import { createHash } from "crypto";
import path from "path";
import { mkdir } from "node:fs/promises";
import type { NormalizedElement } from "../normalize/normalized-schema";
import type { VocabularyMap, VocabularyCluster } from "../normalize/llm-client";

interface GraphNode {
  id: string;
  type: "Element" | "Mechanic" | "Skill" | "Tag" | "Source";
  label: string;
}

interface ElementNode extends GraphNode {
  type: "Element";
  description: string;
  summary: string;
  howToPlay: { steps: { action: string; role?: string; constraint?: string }[] } | null;
  sourceName: string;
  languageCode: string;
  url: string;
  difficulty?: string;
  typicalDurationMinutes?: number;
  energyLevel?: string;
  groupSize?: { min?: number; max?: number };
  playerCountMin?: number;
  playerCountMax?: number;
  tags: string[];
}

interface GraphEdge {
  type: "hasMechanic" | "trainsSkill" | "hasTag" | "sourcedFrom" | "translationOf" | "derivedFrom";
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

function resolveMechanic(
  name: string,
  vocabMap: Map<string, string>,
): string {
  return vocabMap.get(name.toLowerCase()) ?? name;
}

function resolveSkill(
  name: string,
  vocabMap: Map<string, string>,
): string {
  return vocabMap.get(name.toLowerCase()) ?? name;
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

  // Collect all unique tags and sources
  const allTags = new Set<string>();
  const allSources = new Set<string>();
  for (const el of elements) {
    for (const t of el.tags) allTags.add(t);
    allSources.add(el.sourceName);
  }

  // Element nodes
  for (const el of elements) {
    addNode({
      id: el.identifier,
      type: "Element",
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

    // Mechanic edges
    for (const m of el.normalized.mechanics) {
      const canonical = resolveMechanic(m.name, mechMap);
      const mechId = nodeId("mechanic", canonical);
      addNode({ id: mechId, type: "Mechanic", label: canonical });
      addEdge("hasMechanic", el.identifier, mechId);
    }

    // Skill edges
    for (const s of el.normalized.skills) {
      const canonical = resolveSkill(s.name, skillMap);
      const skillId = nodeId("skill", canonical);
      addNode({ id: skillId, type: "Skill", label: canonical });
      addEdge("trainsSkill", el.identifier, skillId);
    }

    // Tag edges
    for (const t of el.tags) {
      const tagId = nodeId("tag", t);
      addNode({ id: tagId, type: "Tag", label: t });
      addEdge("hasTag", el.identifier, tagId);
    }

    // Source edges
    const sourceId = nodeId("source", el.sourceName);
    addNode({ id: sourceId, type: "Source", label: el.sourceName });
    addEdge("sourcedFrom", el.identifier, sourceId);

    // Translation edges
    if (el.translationLinkEnIdentifier) {
      addEdge("translationOf", el.identifier, el.translationLinkEnIdentifier, 1.0);
    }
    if (el.translationLinkDeIdentifier) {
      addEdge("translationOf", el.identifier, el.translationLinkDeIdentifier, 1.0);
    }

    // Cross-source match edges (from relatedIdentifiers)
    for (const ri of el.relatedIdentifiers || []) {
      addEdge("translationOf", el.identifier, ri.identifier, ri.confidence);
    }
  }

  const elementCount = nodes.filter(n => n.type === "Element").length;
  const mechanicCount = nodes.filter(n => n.type === "Mechanic").length;
  const skillCount = nodes.filter(n => n.type === "Skill").length;
  const tagCount = nodes.filter(n => n.type === "Tag").length;
  const sourceCount = nodes.filter(n => n.type === "Source").length;

  return {
    meta: {
      derivedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      elementCount,
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
  console.log(`  Elements: ${graph.meta.elementCount}, Mechanics: ${graph.meta.mechanicCount}, Skills: ${graph.meta.skillCount}, Tags: ${graph.meta.tagCount}, Sources: ${graph.meta.sourceCount}`);
  console.log(`Wrote ${outPath}`);

  return graph;
}

if (import.meta.main) {
  await writeGraph();
}
