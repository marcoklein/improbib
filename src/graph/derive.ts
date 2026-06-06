import { createHash } from "crypto";
import path from "path";
import { mkdir } from "node:fs/promises";
import type { NormalizedElement } from "../normalize/normalized-schema";
import type { VocabularyMap } from "../normalize/llm-client";

interface GraphNode {
  id: string;
  type: "Element" | "Mechanic" | "Skill" | "Tag" | "Source";
  label: string;
}

interface SourceProvenance {
  sourceName: string;
  url: string;
  identifier: string;
}

interface ElementNode extends GraphNode {
  type: "Element";
  canonical: boolean;
  description: string;
  summary: string;
  howToPlay: { steps: { action: string; role?: string; constraint?: string }[] } | null;
  sourceName?: string;
  languageCode: string;
  url?: string;
  sources?: SourceProvenance[];
  difficulty?: string;
  typicalDurationMinutes?: number;
  energyLevel?: string;
  groupSize?: { min?: number; max?: number };
  playerCountMin?: number;
  playerCountMax?: number;
  tags: string[];
}

interface GraphEdge {
  type: "hasMechanic" | "trainsSkill" | "hasTag" | "sourcedFrom" | "translationOf" | "derivedFrom" | "canonicalOf";
  from: string;
  to: string;
  confidence?: number;
}

interface KnowledgeGraph {
  meta: {
    derivedAt: string;
    nodeCount: number;
    edgeCount: number;
    elementCount: number;
    sourceElementCount: number;
    canonicalElementCount: number;
    mechanicCount: number;
    skillCount: number;
    tagCount: number;
    sourceCount: number;
  };
  nodes: (GraphNode | ElementNode)[];
  edges: GraphEdge[];
}

function nodeId(prefix: string, name: string): string {
  return createHash("md5").update(`${prefix}:${name.toLowerCase()}`).digest("hex");
}

function buildVocabMap(vocab: VocabularyMap): {
  mechMap: Map<string, string>;
  skillMap: Map<string, string>;
} {
  const mechMap = new Map<string, string>();
  const skillMap = new Map<string, string>();

  for (const c of vocab.mechanics) {
    mechMap.set(c.canonical.toLowerCase(), c.canonical);
    for (const v of c.variants) {
      mechMap.set(v.toLowerCase(), c.canonical);
    }
  }
  for (const c of vocab.skills) {
    skillMap.set(c.canonical.toLowerCase(), c.canonical);
    for (const v of c.variants) {
      skillMap.set(v.toLowerCase(), c.canonical);
    }
  }

  return { mechMap, skillMap };
}

function resolveTerm(
  name: string,
  vocabMap: Map<string, string>,
): string {
  return vocabMap.get(name.toLowerCase()) ?? name;
}

// Enforce: at most one element per source+language in a canonical cluster.
// Assumption: each source+language has no internal duplicates — if two elements
// from the same source+language end up in the same cluster, only the strongest
// match survives. Weaker matches are dropped (become singletons).
// DE↔EN translations on the same source are NOT considered duplicates.
// Documented in ADR-0011.
function deduplicateClusterBySource(
  members: NormalizedElement[],
): NormalizedElement[] {
  // Group by source+language (improwiki DE and improwiki EN are distinct)
  const key = (el: NormalizedElement) => `${el.sourceName}:${el.languageCode}`;
  const bySourceLang = new Map<string, NormalizedElement[]>();
  for (const el of members) {
    const k = key(el);
    const list = bySourceLang.get(k) || [];
    list.push(el);
    bySourceLang.set(k, list);
  }

  const hasDuplicate = [...bySourceLang.values()].some(list => list.length > 1);
  if (!hasDuplicate) return members;

  // Build a map of identifier → average cross-source confidence
  const scoreMap = new Map<string, number>();
  for (const el of members) {
    let totalConf = 0;
    let count = 0;
    for (const ri of el.relatedIdentifiers || []) {
      const other = members.find(m => m.identifier === ri.identifier);
      if (other && key(other) !== key(el)) {
        totalConf += ri.confidence;
        count++;
      }
    }
    // Also count translation links as confidence 1.0 (but only to different source+lang)
    if (el.translationLinkEnIdentifier &&
      members.some(m => m.identifier === el.translationLinkEnIdentifier && key(m) !== key(el))) {
      totalConf += 1.0;
      count++;
    }
    if (el.translationLinkDeIdentifier &&
      members.some(m => m.identifier === el.translationLinkDeIdentifier && key(m) !== key(el))) {
      totalConf += 1.0;
      count++;
    }
    scoreMap.set(el.identifier, count > 0 ? totalConf / count : 0);
  }

  // Per source+language, keep only the element with the highest cross-source confidence
  const keep = new Set<string>();
  for (const [k, els] of bySourceLang) {
    if (els.length === 1) {
      keep.add(els[0].identifier);
    } else {
      let best: NormalizedElement | null = null;
      let bestScore = -1;
      for (const el of els) {
        const score = scoreMap.get(el.identifier) ?? 0;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
      if (best) {
        keep.add(best.identifier);
        const dropped = els.filter(el => el.identifier !== best!.identifier);
        if (dropped.length > 0) {
          console.log(`  Cluster dedup: source+lang="${k}" kept="${best.name}" dropped="${dropped.map(e => e.name).join('", "')}"`);
        }
      }
    }
  }

  return members.filter(el => keep.has(el.identifier));
}

// Build connected-component clusters from relatedIdentifiers
function buildClusters(
  elements: NormalizedElement[],
  idMap: Map<string, NormalizedElement>,
): Map<string, NormalizedElement[]> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p !== x) {
      const root = find(p);
      parent.set(x, root);
      return root;
    }
    parent.set(x, x);
    return x;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  for (const el of elements) {
    for (const ri of el.relatedIdentifiers || []) {
      union(el.identifier, ri.identifier);
    }
    // Also include translation links for clustering
    if (el.translationLinkEnIdentifier && idMap.has(el.translationLinkEnIdentifier)) {
      union(el.identifier, el.translationLinkEnIdentifier);
    }
    if (el.translationLinkDeIdentifier && idMap.has(el.translationLinkDeIdentifier)) {
      union(el.identifier, el.translationLinkDeIdentifier);
    }
  }

  // Group by root
  const groups = new Map<string, NormalizedElement[]>();
  for (const el of elements) {
    const root = find(el.identifier);
    const list = groups.get(root) || [];
    list.push(el);
    groups.set(root, list);
  }

  // Filter to clusters with ≥2 elements, enforce one-per-source
  const clusters = new Map<string, NormalizedElement[]>();
  for (const [root, members] of groups) {
    if (members.length < 2) continue;
    const deduped = deduplicateClusterBySource(members);
    if (deduped.length >= 2) {
      clusters.set(root, deduped);
    }
  }

  return clusters;
}

function pickCanonicalName(names: string[]): string {
  const unique = [...new Set(names)];
  if (unique.length === 1) return unique[0];

  // Prefer names without exercise/game/variant suffixes, without hyphens
  const suffixPattern = /-(?:exercise|game|variation|handle|übung|spiel|show|format)$/i;
  const scored = unique.map(name => {
    let score = 0;
    if (!suffixPattern.test(name)) score += 100;
    if (!name.includes("-")) score += 50;
    return { name, score };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.name.length - a.name.length; // longer preferred when scores equal
  });
  return scored[0].name;
}

function pickLongestName(names: string[]): string {
  return names.reduce((a, b) => a.length >= b.length ? a : b, names[0] || "");
}

function createCanonicalElement(
  cluster: NormalizedElement[],
  languageCode: "en" | "de",
  clusterId: string,
): { node: ElementNode; memberIds: string[] } | null {
  const langMembers = cluster.filter(el => el.languageCode === languageCode);
  if (langMembers.length === 0) return null;

  const canonicalId = createHash("md5")
    .update(`canonical:${languageCode}:${clusterId}`)
    .digest("hex");

  // Names
  const names = langMembers.map(el => el.name);
  const canonicalName = pickCanonicalName(names);
  const allNames = [...new Set(names)];

  // Description: longest
  const descriptions = langMembers.map(el => el.normalized.description);
  const description = pickLongestName(descriptions);

  // Summary: longest
  const summaries = langMembers.map(el => el.normalized.summary);
  const summary = pickLongestName(summaries);

  // howToPlay: union of step sets (simple: longest wins)
  const howToPlayOptions = langMembers
    .map(el => el.normalized.howToPlay)
    .filter((h): h is NonNullable<typeof h> => h !== null && h.steps.length > 0);
  const howToPlay = howToPlayOptions.length > 0
    ? pickLongestHowToPlay(howToPlayOptions)
    : null;

  // Mechanics: union from all cluster members (language-agnostic)
  const mechSet = new Set<string>();
  for (const el of langMembers) {
    for (const m of el.normalized.mechanics) {
      mechSet.add(m.name);
    }
  }
  const mechanics = [...mechSet];

  // Skills: union from all cluster members (language-agnostic)
  const skillSet = new Set<string>();
  for (const el of langMembers) {
    for (const s of el.normalized.skills) {
      skillSet.add(s.name);
    }
  }
  const skills = [...skillSet];

  // Tags: union
  const tagSet = new Set<string>();
  for (const el of langMembers) {
    for (const t of el.tags) {
      tagSet.add(t);
    }
  }
  const tags = [...tagSet];

  // Practical: mode across sources
  let difficulty: string | undefined;
  let typicalDurationMinutes: number | undefined;
  let energyLevel: string | undefined;
  let groupSizeMin: number | undefined;
  let groupSizeMax: number | undefined;
  let playerCountMin: number | undefined;
  let playerCountMax: number | undefined;

  const diffCounts = new Map<string, number>();
  const energyCounts = new Map<string, number>();
  const durations: number[] = [];
  const gsMins: number[] = [];
  const gsMaxs: number[] = [];
  const pcMins: number[] = [];
  const pcMaxs: number[] = [];

  for (const el of langMembers) {
    if (el.normalized.practical?.difficulty) {
      diffCounts.set(el.normalized.practical.difficulty, (diffCounts.get(el.normalized.practical.difficulty) || 0) + 1);
    }
    if (el.normalized.practical?.typicalDurationMinutes) {
      durations.push(el.normalized.practical.typicalDurationMinutes);
    }
    if (el.normalized.practical?.energyLevel) {
      energyCounts.set(el.normalized.practical.energyLevel, (energyCounts.get(el.normalized.practical.energyLevel) || 0) + 1);
    }
    if (el.normalized.practical?.groupSize?.min) gsMins.push(el.normalized.practical.groupSize.min);
    if (el.normalized.practical?.groupSize?.max) gsMaxs.push(el.normalized.practical.groupSize.max);
    if (el.playerCountMin) pcMins.push(el.playerCountMin);
    if (el.playerCountMax) pcMaxs.push(el.playerCountMax);
  }

  if (diffCounts.size > 0) {
    difficulty = [...diffCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  if (durations.length > 0) {
    typicalDurationMinutes = Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
  }
  if (energyCounts.size > 0) {
    energyLevel = [...energyCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  if (gsMins.length > 0) groupSizeMin = Math.min(...gsMins);
  if (gsMaxs.length > 0) groupSizeMax = Math.max(...gsMaxs);
  if (pcMins.length > 0) playerCountMin = Math.min(...pcMins);
  if (pcMaxs.length > 0) playerCountMax = Math.max(...pcMaxs);

  // Sources
  const sources: SourceProvenance[] = langMembers.map(el => ({
    sourceName: el.sourceName,
    url: el.url,
    identifier: el.identifier,
  }));

  const node: ElementNode = {
    id: canonicalId,
    type: "Element",
    canonical: true,
    label: canonicalName,
    description,
    summary,
    howToPlay,
    languageCode,
    sources,
    tags,
  };

  // Wire mechanics/skills as temp arrays (processed in phase 2)
  (node as any)._mechanics = mechanics;
  (node as any)._skills = skills;

  if (difficulty) node.difficulty = difficulty;
  if (typicalDurationMinutes) node.typicalDurationMinutes = typicalDurationMinutes;
  if (energyLevel) node.energyLevel = energyLevel;
  if (groupSizeMin !== undefined || groupSizeMax !== undefined) {
    node.groupSize = {
      min: groupSizeMin,
      max: groupSizeMax,
    };
  }
  if (playerCountMin !== undefined || playerCountMax !== undefined) {
    node.playerCountMin = playerCountMin;
    node.playerCountMax = playerCountMax;
  }

  const memberIds = langMembers.map(el => el.identifier);
  return { node, memberIds };
}

function pickLongestHowToPlay(
  options: { steps: { action: string; role?: string; constraint?: string }[] }[],
): { steps: { action: string; role?: string; constraint?: string }[] } {
  return options.reduce((a, b) =>
    a.steps.length >= b.steps.length ? a : b, options[0],
  );
}

function dedupSteps(steps: { action: string; role?: string; constraint?: string }[]): { action: string; role?: string; constraint?: string }[] {
  const seen = new Set<string>();
  const result: { action: string; role?: string; constraint?: string }[] = [];
  for (const s of steps) {
    const key = s.action.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(s);
    }
  }
  return result;
}

export function deriveGraph(
  elements: NormalizedElement[],
  vocabulary: VocabularyMap,
): KnowledgeGraph {
  const { mechMap, skillMap } = buildVocabMap(vocabulary);
  const nodes: (GraphNode | ElementNode)[] = [];
  const nodeSet = new Set<string>();
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  function addNode(node: GraphNode | ElementNode): boolean {
    if (nodeSet.has(node.id)) return false;
    nodeSet.add(node.id);
    nodes.push(node);
    return true;
  }

  function addEdge(
    type: GraphEdge["type"],
    from: string,
    to: string,
    confidence?: number,
  ): void {
    const key = `${type}:${from}→${to}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    const edge: GraphEdge = { type, from, to };
    if (confidence !== undefined) edge.confidence = confidence;
    edges.push(edge);
  }

  // ── Phase 1: Create source element nodes ──
  const idMap = new Map<string, NormalizedElement>();
  for (const el of elements) idMap.set(el.identifier, el);

  for (const el of elements) {
    addNode({
      id: el.identifier,
      type: "Element",
      canonical: false,
      label: el.name,
      description: el.normalized.description,
      summary: el.normalized.summary ?? el.normalized.description.slice(0, 100),
      howToPlay: el.normalized.howToPlay,
      sourceName: el.sourceName,
      languageCode: el.languageCode,
      url: el.url,
      difficulty: el.normalized.practical?.difficulty,
      typicalDurationMinutes: el.normalized.practical?.typicalDurationMinutes,
      energyLevel: el.normalized.practical?.energyLevel,
      groupSize: el.normalized.practical?.groupSize,
      playerCountMin: el.playerCountMin,
      playerCountMax: el.playerCountMax,
      tags: el.tags,
    });

    // Source edges
    addEdge("sourcedFrom", el.identifier, nodeId("source", el.sourceName));

    // Translation edges (only from explicit translation links)
    if (el.translationLinkEnIdentifier) {
      addEdge("translationOf", el.identifier, el.translationLinkEnIdentifier, 1.0);
    }
    if (el.translationLinkDeIdentifier) {
      addEdge("translationOf", el.identifier, el.translationLinkDeIdentifier, 1.0);
    }
  }

  // ── Phase 2: Build clusters and create canonical nodes ──
  const clusters = buildClusters(elements, idMap);
  const canonicalNodes: { en?: ElementNode; de?: ElementNode; memberIds: string[] }[] = [];

  for (const [root, members] of clusters) {
    const clusterId = createHash("md5")
      .update([...new Set(members.map(m => m.identifier))].sort().join(","))
      .digest("hex");

    const enResult = createCanonicalElement(members, "en", clusterId);
    const deResult = createCanonicalElement(members, "de", clusterId);

    const allMemberIds = new Set<string>();
    if (enResult) {
      addNode(enResult.node);
      enResult.memberIds.forEach(id => allMemberIds.add(id));
    }
    if (deResult) {
      addNode(deResult.node);
      deResult.memberIds.forEach(id => allMemberIds.add(id));
    }

    // canonicalOf edges
    for (const el of members) {
      if (el.languageCode === "en" && enResult) {
        addEdge("canonicalOf", el.identifier, enResult.node.id);
      } else if (el.languageCode === "de" && deResult) {
        addEdge("canonicalOf", el.identifier, deResult.node.id);
      } else if (el.languageCode === "de" && enResult && !deResult) {
        // DE element in cluster but no DE canonical — point to EN canonical
        addEdge("canonicalOf", el.identifier, enResult.node.id);
      } else if (el.languageCode === "en" && deResult && !enResult) {
        addEdge("canonicalOf", el.identifier, deResult.node.id);
      }
    }

    // translationOf between EN↔DE canonicals
    if (enResult && deResult) {
      addEdge("translationOf", enResult.node.id, deResult.node.id, 1.0);
    }

    canonicalNodes.push({
      en: enResult?.node,
      de: deResult?.node,
      memberIds: [...allMemberIds],
    });
  }

  // ── Phase 3: Mechanic, Skill, Tag edges for ALL elements ──
  // Collect all elements (source + canonical) for edge wiring
  const allElementNodes = nodes.filter(n => n.type === "Element") as ElementNode[];
  const allElementsWithMechSkills: { id: string; mechanics: string[]; skills: string[]; tags: string[]; canonical: boolean; sourceName?: string }[] = [];

  // Source elements: mechanics/skills/tags from normalized data
  for (const el of elements) {
    allElementsWithMechSkills.push({
      id: el.identifier,
      mechanics: el.normalized.mechanics.map(m => m.name),
      skills: el.normalized.skills.map(s => s.name),
      tags: el.tags,
      canonical: false,
      sourceName: el.sourceName,
    });
  }

  // Canonical elements: mechanics/skills/tags from merged data on the node
  for (const cn of canonicalNodes) {
    for (const canonical of [cn.en, cn.de]) {
      if (!canonical) continue;
      const mechs = (canonical as any)._mechanics as string[] || [];
      const skills = (canonical as any)._skills as string[] || [];
      allElementsWithMechSkills.push({
        id: canonical.id,
        mechanics: mechs,
        skills,
        tags: canonical.tags,
        canonical: true,
      });
      // Clean up temp fields
      delete (canonical as any)._mechanics;
      delete (canonical as any)._skills;
    }
  }

  // Collect all unique tags and sources
  const allTags = new Set<string>();
  const allSources = new Set<string>();
  for (const el of elements) {
    for (const t of el.tags) allTags.add(t);
    allSources.add(el.sourceName);
  }

  // Wire edges for all elements
  for (const el of allElementsWithMechSkills) {
    // Mechanic edges
    for (const m of el.mechanics) {
      const canonical = resolveTerm(m, mechMap);
      const mechId = nodeId("mechanic", canonical);
      addNode({ id: mechId, type: "Mechanic", label: canonical });
      addEdge("hasMechanic", el.id, mechId);
    }

    // Skill edges
    for (const s of el.skills) {
      const canonical = resolveTerm(s, skillMap);
      const skillId = nodeId("skill", canonical);
      addNode({ id: skillId, type: "Skill", label: canonical });
      addEdge("trainsSkill", el.id, skillId);
    }

    // Tag edges
    for (const t of el.tags) {
      const tagId = nodeId("tag", t);
      addNode({ id: tagId, type: "Tag", label: t });
      addEdge("hasTag", el.id, tagId);
    }

    // Source nodes (always add, sourcedFrom only for source elements)
    if (!el.canonical && el.sourceName) {
      const sourceId = nodeId("source", el.sourceName);
      addNode({ id: sourceId, type: "Source", label: el.sourceName });
    }
  }

  // Source nodes for canonical sources
  for (const cn of canonicalNodes) {
    for (const canonical of [cn.en, cn.de]) {
      if (!canonical?.sources) continue;
      for (const s of canonical.sources) {
        addNode({ id: nodeId("source", s.sourceName), type: "Source", label: s.sourceName });
      }
    }
  }

  const sourceElementCount = allElementNodes.filter(n => !n.canonical).length;
  const canonicalElementCount = allElementNodes.filter(n => n.canonical).length;
  const mechanicCount = nodes.filter(n => n.type === "Mechanic").length;
  const skillCount = nodes.filter(n => n.type === "Skill").length;
  const tagCount = nodes.filter(n => n.type === "Tag").length;
  const sourceCount = nodes.filter(n => n.type === "Source").length;

  return {
    meta: {
      derivedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      elementCount: allElementNodes.length,
      sourceElementCount,
      canonicalElementCount,
      mechanicCount,
      skillCount,
      tagCount,
      sourceCount,
    },
    nodes,
    edges,
  };
}

export async function deriveGraphFromFiles(): Promise<KnowledgeGraph> {
  const outDir = path.join(process.cwd(), "output", "normalized");
  const vocabPath = path.join(process.cwd(), "output", "vocabulary.json");
  const allSources = ["improwiki", "learnimprov", "ircwiki"];

  const allElements: NormalizedElement[] = [];
  for (const source of allSources) {
    const srcPath = path.join(outDir, `${source}.json`);
    const f = Bun.file(srcPath);
    if (!(await f.exists())) continue;
    const data = await f.json();
    allElements.push(...data.elements);
  }

  let vocabulary: VocabularyMap = { mechanics: [], skills: [] };
  const vf = Bun.file(vocabPath);
  if (await vf.exists()) {
    vocabulary = await vf.json();
  }

  return deriveGraph(allElements, vocabulary);
}

export async function writeGraph(outputPath?: string): Promise<KnowledgeGraph> {
  const graph = await deriveGraphFromFiles();

  const outPath = outputPath || path.join(process.cwd(), "output", "graph.json");
  const outDir = path.dirname(outPath);
  const dir = Bun.file(outDir);
  if (!(await dir.exists())) {
    await mkdir(outDir, { recursive: true });
  }

  await Bun.write(outPath, JSON.stringify(graph, null, 2));
  console.log(`Graph: ${graph.meta.nodeCount} nodes, ${graph.meta.edgeCount} edges`);
  console.log(`  Elements: ${graph.meta.elementCount} (${graph.meta.sourceElementCount} source + ${graph.meta.canonicalElementCount} canonical)`);
  console.log(`  Mechanics: ${graph.meta.mechanicCount}, Skills: ${graph.meta.skillCount}, Tags: ${graph.meta.tagCount}, Sources: ${graph.meta.sourceCount}`);
  console.log(`Wrote ${outPath}`);

  return graph;
}

if (import.meta.main) {
  await writeGraph();
}
