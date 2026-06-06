import path from "path";
import type { KnowledgeGraph, GraphEdge } from "./graph/derive";
import { loadOverrides, writeOverrides } from "./graph/overrides";
import type { Override } from "./graph/overrides";

function printUsage(): never {
  console.log("Usage: bun run src/review.ts <mode> [options]");
  console.log();
  console.log("Modes:");
  console.log("  --clusters       List clusters sorted by lowest dedup confidence");
  console.log("  --hubs           Show top skill/mechanic/tag hubs by degree");
  console.log("  --element <id>   Show full details for an element (by ID or name substring)");
  console.log("  --random <N>     Show N random canonical elements with their edges");
  console.log("  --reject <a> <b> Add reject_match override (use element IDs)");
  console.log("  --add-match <a> <b>  Add add_match override (use element IDs)");
  console.log("  --remove-edge <elt> <type> <target>  Add remove_edge override");
  console.log("  --add-edge <elt> <type> <target>     Add add_edge override");
  console.log();
  console.log("Options:");
  console.log("  --overrides-path <path>  Override file path (default: graph-overrides.json)");
  console.log("  --graph-path <path>      Graph JSON path (default: output/graph.json)");
  console.log("  --limit <N>              Max items to show in --clusters or --hubs (default: 30)");
  process.exit(1);
}

interface ElementNode {
  id: string;
  type: "Element";
  label: string;
  canonical: boolean;
  description: string;
  summary: string;
  languageCode: string;
  sourceName?: string;
  url?: string;
  tags: string[];
  sources?: { sourceName: string; url: string; identifier: string }[];
  difficulty?: string;
  typicalDurationMinutes?: number;
  playerCountMin?: number;
  playerCountMax?: number;
}

interface ReviewData {
  graph: KnowledgeGraph;
  elementNodes: ElementNode[];
  elementById: Map<string, ElementNode>;
  edgesByFrom: Map<string, GraphEdge[]>;
  edgesByTo: Map<string, GraphEdge[]>;
  edgesByType: Map<string, GraphEdge[]>;
  nodeById: Map<string, { id: string; type: string; label: string }>;
}

async function loadGraph(graphPath: string): Promise<ReviewData> {
  const file = Bun.file(graphPath);
  if (!(await file.exists())) {
    console.error(`Graph not found at ${graphPath}. Run the pipeline first:`);
    console.error(`  bun run src/normalize/normalize.ts --graph`);
    process.exit(1);
  }
  const graph = await file.json() as KnowledgeGraph;

  const elementNodes: ElementNode[] = [];
  const elementById = new Map<string, ElementNode>();
  const edgesByFrom = new Map<string, GraphEdge[]>();
  const edgesByTo = new Map<string, GraphEdge[]>();
  const edgesByType = new Map<string, GraphEdge[]>();
  const nodeById = new Map<string, { id: string; type: string; label: string }>();

  for (const node of graph.nodes) {
    nodeById.set(node.id, { id: node.id, type: node.type, label: node.label });
    if (node.type === "Element") {
      const en = node as ElementNode;
      elementNodes.push(en);
      elementById.set(en.id, en);
    }
  }

  for (const edge of graph.edges) {
    const fromList = edgesByFrom.get(edge.from) || [];
    fromList.push(edge);
    edgesByFrom.set(edge.from, fromList);

    const toList = edgesByTo.get(edge.to) || [];
    toList.push(edge);
    edgesByTo.set(edge.to, toList);

    const typeList = edgesByType.get(edge.type) || [];
    typeList.push(edge);
    edgesByType.set(edge.type, typeList);
  }

  return { graph, elementNodes, elementById, edgesByFrom, edgesByTo, edgesByType, nodeById };
}

function findElement(data: ReviewData, query: string): ElementNode | null {
  // Exact ID match
  if (data.elementById.has(query)) return data.elementById.get(query)!;

  // Substring match (case-insensitive)
  const lower = query.toLowerCase();
  for (const el of data.elementNodes) {
    if (el.label.toLowerCase().includes(lower)) return el;
  }

  return null;
}

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len - 3) + "...";
}

function formatConf(c: number | undefined): string {
  if (c === undefined) return "  --  ";
  const pct = Math.round(c * 100);
  const bar = pct >= 90 ? "███" : pct >= 75 ? "██░" : pct >= 65 ? "█░░" : "░░░";
  return `${bar} ${pct}%`;
}

// ── --clusters ──
function showClusters(data: ReviewData, limit: number) {
  const canonicalOfEdges = data.edgesByType.get("canonicalOf") || [];

  // Build Union-Find over canonical nodes linked by translationOf edges (same concept)
  const translationEdges = data.edgesByType.get("translationOf") || [];
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
  for (const e of translationEdges) {
    const a = find(e.from);
    const b = find(e.to);
    parent.set(a, b);
  }

  // Group canonicalOf edges by concept root (merged canonical set via translation links)
  const conceptGroups = new Map<string, GraphEdge[]>();
  for (const e of canonicalOfEdges) {
    const root = find(e.to);
    const list = conceptGroups.get(root) || [];
    list.push(e);
    conceptGroups.set(root, list);
  }

  // Compute per-concept stats
  interface ClusterInfo {
    canonicalId: string;
    canonicalNames: { id: string; name: string; lang: string }[];
    edgeCount: number;
    minConf: number;
    avgConf: number;
    maxConf: number;
    members: { id: string; name: string; source: string; lang: string; conf: number }[];
  }

  const clusters: ClusterInfo[] = [];
  for (const [rootId, edges] of conceptGroups) {
    // Collect all canonical node IDs in this translation-linked concept
    const canonicalNodes = new Set<string>();
    for (const e of edges) {
      canonicalNodes.add(e.to);
    }
    const canonicalNames = [...canonicalNodes].map(id => {
      const node = data.elementById.get(id);
      return { id, name: node?.label ?? id, lang: node?.languageCode ?? "?" };
    });

    const confidences = edges.map(e => e.confidence ?? 0);
    const members = edges.map(e => {
      const el = data.elementById.get(e.from);
      return {
        id: e.from,
        name: el?.label ?? e.from,
        source: el?.sourceName ?? "?",
        lang: el?.languageCode ?? "?",
        conf: e.confidence ?? 0,
      };
    });

    clusters.push({
      canonicalId: rootId,
      canonicalNames,
      edgeCount: edges.length,
      minConf: Math.min(...confidences),
      avgConf: confidences.reduce((a, b) => a + b, 0) / confidences.length,
      maxConf: Math.max(...confidences),
      members,
    });
  }

  // Sort by lowest confidence first (weakest dedup at top)
  clusters.sort((a, b) => a.minConf - b.minConf);

  const shown = clusters.slice(0, limit);
  console.log(`=== Dedup Clusters (sorted by weakest confidence) ===`);
  console.log(`Showing ${shown.length} of ${clusters.length} clusters\n`);

  for (const c of shown) {
    const sigil = c.minConf >= 0.9 ? "✓" : c.minConf >= 0.75 ? "~" : "⚠";
    // Show primary name (prefer EN) and all canonical names
    const primary = c.canonicalNames.find(n => n.lang === "en")?.name
      ?? c.canonicalNames[0]?.name;
    const langs = [...new Set(c.canonicalNames.map(n => n.lang))].join("/");
    console.log(`${sigil} ${primary} [${langs}]  conf: ${formatConf(c.minConf)}–${formatConf(c.maxConf)}`);
    if (c.canonicalNames.length > 1) {
      for (const cn of c.canonicalNames) {
        console.log(`  canonical [${cn.lang}]: ${cn.id}`);
      }
    } else {
      console.log(`  canonical: ${c.canonicalNames[0]?.id}`);
    }
    for (const m of c.members) {
      console.log(`    ${formatConf(m.conf)} ${m.name} (${m.source} ${m.lang})`);
    }
    console.log();
  }

  // Distribution summary
  const bins: Record<string, number> = { "65-74%": 0, "75-84%": 0, "85-94%": 0, "95-100%": 0 };
  for (const c of clusters) {
    if (c.minConf >= 0.95) bins["95-100%"]++;
    else if (c.minConf >= 0.85) bins["85-94%"]++;
    else if (c.minConf >= 0.75) bins["75-84%"]++;
    else bins["65-74%"]++;
  }
  console.log(`Confidence distribution:`);
  for (const [range, count] of Object.entries(bins)) {
    if (count > 0) console.log(`  ${range}: ${count} clusters`);
  }
}

// ── --hubs ──
function showHubs(data: ReviewData, limit: number) {
  // Compute degree for non-Element nodes
  interface HubInfo {
    id: string;
    label: string;
    type: string;
    degree: number;
    sampleElements: string[];
  }

  const hubs: HubInfo[] = [];
  for (const [nodeId, node] of data.nodeById) {
    if (node.type === "Element" || node.type === "Source") continue;
    const inEdges = data.edgesByTo.get(nodeId) || [];
    const outEdges = data.edgesByFrom.get(nodeId) || [];
    const degree = inEdges.length + outEdges.length;

    // Get sample elements (from in-edges, since mechanics/skills/tags are targets)
    const sampleElements = new Set<string>();
    for (const e of inEdges) {
      const el = data.elementById.get(e.from);
      if (el) sampleElements.add(el.label);
    }

    hubs.push({
      id: nodeId,
      label: node.label,
      type: node.type,
      degree,
      sampleElements: [...sampleElements].slice(0, 5),
    });
  }

  hubs.sort((a, b) => b.degree - a.degree);

  console.log(`=== Top Hubs by Degree ===`);
  console.log(`Showing top ${Math.min(limit, hubs.length)} of ${hubs.length}\n`);

  for (const h of hubs.slice(0, limit)) {
    console.log(`${h.type.padEnd(10)} ${h.label.padEnd(30)} degree: ${h.degree}`);
    if (h.sampleElements.length > 0) {
      console.log(`            samples: ${h.sampleElements.map(s => truncate(s, 40)).join(", ")}`);
    }
  }
}

// ── --element ──
function showElement(data: ReviewData, query: string) {
  const el = findElement(data, query);
  if (!el) {
    console.error(`Element not found: "${query}"`);
    process.exit(1);
  }

  const fromEdges = data.edgesByFrom.get(el.id) || [];
  const toEdges = data.edgesByTo.get(el.id) || [];

  console.log(`=== Element: ${el.label} ===`);
  console.log(`ID:         ${el.id}`);
  console.log(`Canonical:  ${el.canonical ? "yes" : "no"}`);
  console.log(`Language:   ${el.languageCode}`);
  if (el.sourceName) console.log(`Source:     ${el.sourceName}`);
  if (el.url) console.log(`URL:        ${el.url}`);
  if (el.difficulty) console.log(`Difficulty: ${el.difficulty}`);
  if (el.typicalDurationMinutes) console.log(`Duration:   ${el.typicalDurationMinutes} min`);
  if (el.playerCountMin !== undefined || el.playerCountMax !== undefined) {
    console.log(`Players:    ${el.playerCountMin ?? "?"}–${el.playerCountMax ?? "?"}`);
  }
  console.log(`Tags:       ${el.tags.join(", ")}`);
  console.log();
  console.log(truncate(el.description, 500));
  console.log();

  // Group edges by type
  const edgeGroup = new Map<string, GraphEdge[]>();
  for (const e of fromEdges) {
    const list = edgeGroup.get(e.type) || [];
    list.push(e);
    edgeGroup.set(e.type, list);
  }
  for (const e of toEdges) {
    const key = `←${e.type}`;
    const list = edgeGroup.get(key) || [];
    list.push(e);
    edgeGroup.set(key, list);
  }

  const order = ["sourcedFrom", "canonicalOf", "translationOf", "hasMechanic", "trainsSkill", "hasTag"];
  for (const type of order) {
    const edges = edgeGroup.get(type);
    if (!edges || edges.length === 0) continue;
    console.log(`  ${type}:`);
    for (const e of edges) {
      const target = data.nodeById.get(e.to);
      const source = data.nodeById.get(e.from);
      const label = target?.label ?? source?.label ?? e.to;
      const conf = e.confidence !== undefined ? ` (${formatConf(e.confidence)})` : "";
      console.log(`    → ${label}${conf}  [${e.to}]`);
    }
  }
  console.log();

  // Show sources for canonical elements
  if (el.canonical && el.sources && el.sources.length > 0) {
    console.log(`  Source provenance:`);
    for (const s of el.sources) {
      console.log(`    ${s.sourceName}: ${s.url}`);
    }
    console.log();
  }
}

// ── --random ──
function showRandom(data: ReviewData, n: number) {
  const canonical = data.elementNodes.filter(el => el.canonical);
  if (canonical.length === 0) {
    console.error("No canonical elements found in graph");
    process.exit(1);
  }

  const shuffled = [...canonical].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(n, canonical.length));

  console.log(`=== Random Canonical Elements (${picked.length} of ${canonical.length}) ===\n`);
  for (const el of picked) {
    const fromEdges = data.edgesByFrom.get(el.id) || [];
    const mechanics = fromEdges.filter(e => e.type === "hasMechanic").map(e => {
      const target = data.nodeById.get(e.to);
      return target?.label ?? e.to;
    });
    const skills = fromEdges.filter(e => e.type === "trainsSkill").map(e => {
      const target = data.nodeById.get(e.to);
      return target?.label ?? e.to;
    });

    console.log(`${el.label} [${el.languageCode}]`);
    console.log(`  ID: ${el.id}`);
    console.log(`  ${truncate(el.summary, 200)}`);
    console.log(`  Mechanics (${mechanics.length}): ${mechanics.slice(0, 10).join(", ")}${mechanics.length > 10 ? "..." : ""}`);
    console.log(`  Skills (${skills.length}): ${skills.slice(0, 10).join(", ")}${skills.length > 10 ? "..." : ""}`);
    console.log();
  }
}

// ── Override helpers ──
function overridesPath(): string {
  return process.env.GRAPH_OVERRIDES_PATH || "graph-overrides.json";
}

async function addOverride(override: Override) {
  const op = overridesPath();
  const existing = await loadOverrides(op);

  // Deduplicate
  const key = JSON.stringify(override, Object.keys(override).sort());
  const exists = existing.some(o => JSON.stringify(o, Object.keys(o).sort()) === key);
  if (exists) {
    console.log(`Override already exists: ${override.type}`);
    process.exit(0);
  }

  existing.push(override);
  await writeOverrides(op, existing);
  console.log(`Added ${override.type} override to ${op}`);
  console.log(`Run the graph again to apply: bun run src/normalize/normalize.ts --graph`);
}

// ── Main ──
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
  }

  const mode = args[0];

  // Modes that don't need graph data
  if (mode === "--reject") {
    if (args.length < 3) printUsage();
    await addOverride({
      type: "reject_match",
      elementA: args[1],
      elementB: args[2],
    });
    return;
  }

  if (mode === "--add-match") {
    if (args.length < 3) printUsage();
    await addOverride({
      type: "add_match",
      elementA: args[1],
      elementB: args[2],
    });
    return;
  }

  if (mode === "--remove-edge") {
    if (args.length < 4) printUsage();
    await addOverride({
      type: "remove_edge",
      elementId: args[1],
      edgeType: args[2] as "hasMechanic" | "trainsSkill" | "hasTag",
      targetId: args[3],
    });
    return;
  }

  if (mode === "--add-edge") {
    if (args.length < 4) printUsage();
    await addOverride({
      type: "add_edge",
      elementId: args[1],
      edgeType: args[2] as "hasMechanic" | "trainsSkill" | "hasTag",
      targetId: args[3],
    });
    return;
  }

  // Parse options
  let graphPath = "output/graph.json";
  let limit = 30;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--graph-path") graphPath = args[++i];
    if (args[i] === "--overrides-path") process.env.GRAPH_OVERRIDES_PATH = args[++i];
    if (args[i] === "--limit") limit = parseInt(args[++i]) || 30;
  }

  const data = await loadGraph(graphPath);

  switch (mode) {
    case "--clusters":
      showClusters(data, limit);
      break;
    case "--hubs":
      showHubs(data, limit);
      break;
    case "--element":
      if (args.length < 2) printUsage();
      showElement(data, args[1]);
      break;
    case "--random":
      showRandom(data, parseInt(args[1]) || 5);
      break;
    default:
      console.error(`Unknown mode: ${mode}`);
      printUsage();
  }
}

await main();
