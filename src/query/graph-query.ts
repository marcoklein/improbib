import type { KnowledgeGraph, GraphEdge, GraphNode, ElementNode } from "../graph/derive";
import { jaccardSimilarity } from "./similarity";

export interface GraphIndex {
  meta: KnowledgeGraph["meta"];
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeById: Map<string, GraphNode>;
  edgesByFrom: Map<string, GraphEdge[]>;
  edgesByTo: Map<string, GraphEdge[]>;
  edgesByType: Map<string, GraphEdge[]>;
  elements: ElementNode[];
  canonicals: ElementNode[];
  labelToNodeIds: Map<string, Map<string, string>>;
}

let _index: GraphIndex | null = null;

export function getGraphIndex(): GraphIndex {
  if (!_index) throw new Error("Graph not loaded");
  return _index;
}

export function createGraphIndex(graph: KnowledgeGraph): GraphIndex {
  const nodeById = new Map<string, GraphNode>();
  const edgesByFrom = new Map<string, GraphEdge[]>();
  const edgesByTo = new Map<string, GraphEdge[]>();
  const edgesByType = new Map<string, GraphEdge[]>();

  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
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

  const elements = graph.nodes.filter(
    (n): n is ElementNode => n.type === "Element",
  );
  const canonicals = elements.filter((e) => e.canonical);

  const labelToNodeIds = new Map<string, Map<string, string>>();
  for (const type of ["Mechanic", "Skill", "Tag", "Requirement"] as const) {
    const map = new Map<string, string>();
    for (const node of graph.nodes) {
      if (node.type === type) {
        map.set(node.label.toLowerCase(), node.id);
      }
    }
    labelToNodeIds.set(type, map);
  }

  _index = {
    meta: graph.meta,
    nodes: graph.nodes,
    edges: graph.edges,
    nodeById,
    edgesByFrom,
    edgesByTo,
    edgesByType,
    elements,
    canonicals,
    labelToNodeIds,
  };

  return _index;
}

export function reloadGraph(graph: KnowledgeGraph): GraphIndex {
  return createGraphIndex(graph);
}

export interface ElementResult {
  id: string;
  label: string;
  summary: string;
  canonical: boolean;
  languageCode: string;
  difficulty?: string;
  typicalDurationMinutes?: number;
  playerCountMin?: number;
  playerCountMax?: number;
  energyLevel?: string;
  tags: string[];
  mechanicLabels: string[];
  skillLabels: string[];
  requirementLabels: string[];
}

export interface ElementFilters {
  difficulty?: string;
  minPlayers?: number;
  maxPlayers?: number;
  minDuration?: number;
  maxDuration?: number;
  tag?: string;
  mechanic?: string;
  skill?: string;
  excludeRequirements?: string[];
  requireRequirements?: string[];
  canonicalOnly?: boolean;
  language?: string;
}

export interface PaginatedResult {
  results: ElementResult[];
  total: number;
  page: number;
  limit: number;
}

function getElementMechanicLabels(idx: GraphIndex, elementId: string): string[] {
  const labels: string[] = [];
  const outEdges = idx.edgesByFrom.get(elementId) || [];
  for (const edge of outEdges) {
    if (edge.type === "hasMechanic") {
      const node = idx.nodeById.get(edge.to);
      if (node) labels.push(node.label);
    }
  }
  return labels;
}

function getElementSkillLabels(idx: GraphIndex, elementId: string): string[] {
  const labels: string[] = [];
  const outEdges = idx.edgesByFrom.get(elementId) || [];
  for (const edge of outEdges) {
    if (edge.type === "trainsSkill") {
      const node = idx.nodeById.get(edge.to);
      if (node) labels.push(node.label);
    }
  }
  return labels;
}

function getElementRequirementLabels(idx: GraphIndex, elementId: string): string[] {
  const labels: string[] = [];
  const outEdges = idx.edgesByFrom.get(elementId) || [];
  for (const edge of outEdges) {
    if (edge.type === "requires") {
      const node = idx.nodeById.get(edge.to);
      if (node) labels.push(node.label);
    }
  }
  return labels;
}

function getElementMechSkillNodeIds(idx: GraphIndex, elementId: string): Set<string> {
  const ids = new Set<string>();
  const outEdges = idx.edgesByFrom.get(elementId) || [];
  for (const edge of outEdges) {
    if (edge.type === "hasMechanic" || edge.type === "trainsSkill") {
      ids.add(edge.to);
    }
  }
  return ids;
}

function elementToResult(idx: GraphIndex, el: ElementNode): ElementResult {
  return {
    id: el.id,
    label: el.label,
    summary: el.summary,
    canonical: el.canonical,
    languageCode: el.languageCode,
    difficulty: el.difficulty,
    typicalDurationMinutes: el.typicalDurationMinutes,
    playerCountMin: el.playerCountMin,
    playerCountMax: el.playerCountMax,
    energyLevel: el.energyLevel,
    tags: el.tags,
    mechanicLabels: getElementMechanicLabels(idx, el.id),
    skillLabels: getElementSkillLabels(idx, el.id),
    requirementLabels: getElementRequirementLabels(idx, el.id),
  };
}

export function queryElements(
  filters: ElementFilters & { page?: number; limit?: number },
): PaginatedResult {
  const idx = getGraphIndex();

  const canonicalOnly = filters.canonicalOnly !== false;
  const language = filters.language || "en";
  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 20, 100);

  let candidates = canonicalOnly ? [...idx.canonicals] : [...idx.elements];

  if (language) {
    candidates = candidates.filter((el) => el.languageCode === language);
  }

  if (filters.difficulty) {
    candidates = candidates.filter((el) => el.difficulty === filters.difficulty);
  }

  if (filters.minPlayers !== undefined) {
    candidates = candidates.filter((el) => {
      if (el.playerCountMax !== undefined && el.playerCountMax < filters.minPlayers!)
        return false;
      if (el.playerCountMin !== undefined && el.playerCountMin > filters.minPlayers!)
        return false;
      return true;
    });
  }

  if (filters.maxPlayers !== undefined) {
    candidates = candidates.filter((el) => {
      if (el.playerCountMin !== undefined && el.playerCountMin > filters.maxPlayers!)
        return false;
      return true;
    });
  }

  if (filters.minDuration !== undefined) {
    candidates = candidates.filter((el) => {
      if (el.typicalDurationMinutes !== undefined && el.typicalDurationMinutes < filters.minDuration!)
        return false;
      return true;
    });
  }

  if (filters.maxDuration !== undefined) {
    candidates = candidates.filter((el) => {
      if (el.typicalDurationMinutes !== undefined && el.typicalDurationMinutes > filters.maxDuration!)
        return false;
      return true;
    });
  }

  if (filters.tag) {
    const tagMap = idx.labelToNodeIds.get("Tag");
    const tagId = tagMap?.get(filters.tag.toLowerCase());
    if (tagId) {
      candidates = candidates.filter((el) => {
        const outEdges = idx.edgesByFrom.get(el.id) || [];
        return outEdges.some((e) => e.type === "hasTag" && e.to === tagId);
      });
    } else {
      return { results: [], total: 0, page, limit };
    }
  }

  if (filters.mechanic) {
    const mechMap = idx.labelToNodeIds.get("Mechanic");
    const mechId = mechMap?.get(filters.mechanic.toLowerCase());
    if (mechId) {
      candidates = candidates.filter((el) => {
        const outEdges = idx.edgesByFrom.get(el.id) || [];
        return outEdges.some((e) => e.type === "hasMechanic" && e.to === mechId);
      });
    } else {
      return { results: [], total: 0, page, limit };
    }
  }

  if (filters.skill) {
    const skillMap = idx.labelToNodeIds.get("Skill");
    const skillId = skillMap?.get(filters.skill.toLowerCase());
    if (skillId) {
      candidates = candidates.filter((el) => {
        const outEdges = idx.edgesByFrom.get(el.id) || [];
        return outEdges.some((e) => e.type === "trainsSkill" && e.to === skillId);
      });
    } else {
      return { results: [], total: 0, page, limit };
    }
  }

  if (filters.excludeRequirements && filters.excludeRequirements.length > 0) {
    const reqMap = idx.labelToNodeIds.get("Requirement") || new Map();
    const excludeIds = filters.excludeRequirements
      .map((r) => reqMap.get(r.toLowerCase()))
      .filter((id): id is string => !!id);

    candidates = candidates.filter((el) => {
      const outEdges = idx.edgesByFrom.get(el.id) || [];
      return !outEdges.some(
        (e) => e.type === "requires" && excludeIds.includes(e.to),
      );
    });
  }

  if (filters.requireRequirements && filters.requireRequirements.length > 0) {
    const reqMap = idx.labelToNodeIds.get("Requirement") || new Map();
    const requireIds = filters.requireRequirements
      .map((r) => reqMap.get(r.toLowerCase()))
      .filter((id): id is string => !!id);

    if (requireIds.length > 0) {
      candidates = candidates.filter((el) => {
        const outEdges = idx.edgesByFrom.get(el.id) || [];
        const hasEdges = outEdges
          .filter((e) => e.type === "requires")
          .map((e) => e.to);
        return requireIds.every((rid) => hasEdges.includes(rid));
      });
    }
  }

  const total = candidates.length;
  const start = (page - 1) * limit;
  const paged = candidates.slice(start, start + limit);

  return {
    results: paged.map((el) => elementToResult(idx, el)),
    total,
    page,
    limit,
  };
}

export interface ElementDetail {
  element: ElementNode;
  edges: {
    sourcedFrom: GraphEdge[];
    canonicalOf: GraphEdge[];
    translationOf: GraphEdge[];
    hasMechanic: GraphEdge[];
    trainsSkill: GraphEdge[];
    hasTag: GraphEdge[];
    requires: GraphEdge[];
    buildsOn_from: GraphEdge[];
    buildsOn_to: GraphEdge[];
    variationOf_from: GraphEdge[];
    variationOf_to: GraphEdge[];
  };
  mechanicLabels: string[];
  skillLabels: string[];
  tagLabels: string[];
  requirementLabels: string[];
  buildsOn_from_labels: string[];
  buildsOn_to_labels: string[];
  variationOf_from_labels: string[];
  variationOf_to_labels: string[];
  similar: ElementResult[];
}

export function getElementDetail(id: string): ElementDetail | null {
  const idx = getGraphIndex();
  const node = idx.nodeById.get(id);
  if (!node || node.type !== "Element") return null;

  const element = node as ElementNode;

  const outEdges = idx.edgesByFrom.get(id) || [];
  const inEdges = idx.edgesByTo.get(id) || [];

  const edges = {
    sourcedFrom: outEdges.filter((e) => e.type === "sourcedFrom"),
    canonicalOf: inEdges.filter((e) => e.type === "canonicalOf"),
    translationOf: [...outEdges, ...inEdges].filter((e) => e.type === "translationOf"),
    hasMechanic: outEdges.filter((e) => e.type === "hasMechanic"),
    trainsSkill: outEdges.filter((e) => e.type === "trainsSkill"),
    hasTag: outEdges.filter((e) => e.type === "hasTag"),
    requires: outEdges.filter((e) => e.type === "requires"),
    buildsOn_from: outEdges.filter((e) => e.type === "buildsOn"),
    buildsOn_to: inEdges.filter((e) => e.type === "buildsOn"),
    variationOf_from: outEdges.filter((e) => e.type === "variationOf"),
    variationOf_to: inEdges.filter((e) => e.type === "variationOf"),
  };

  const similar = getSimilarElements(id, 10);

  function resolveLabels(edgeList: GraphEdge[], direction: "to" | "from"): string[] {
    return edgeList.map((e) => {
      const nodeId = direction === "to" ? e.to : e.from;
      const node = idx.nodeById.get(nodeId);
      return node ? node.label : nodeId.slice(0, 8);
    });
  }

  return {
    element,
    edges,
    mechanicLabels: resolveLabels(edges.hasMechanic, "to"),
    skillLabels: resolveLabels(edges.trainsSkill, "to"),
    tagLabels: resolveLabels(edges.hasTag, "to"),
    requirementLabels: resolveLabels(edges.requires, "to"),
    buildsOn_from_labels: resolveLabels(edges.buildsOn_from, "to"),
    buildsOn_to_labels: resolveLabels(edges.buildsOn_to, "from"),
    variationOf_from_labels: resolveLabels(edges.variationOf_from, "to"),
    variationOf_to_labels: resolveLabels(edges.variationOf_to, "from"),
    similar,
  };
}

export function getSimilarElements(
  id: string,
  limit: number = 10,
): ElementResult[] {
  const idx = getGraphIndex();

  const mechSkillIds = getElementMechSkillNodeIds(idx, id);
  if (mechSkillIds.size === 0) return [];

  const scored: { result: ElementResult; score: number }[] = [];

  for (const el of idx.canonicals) {
    if (el.id === id) continue;

    const elMechSkillIds = getElementMechSkillNodeIds(idx, el.id);
    if (elMechSkillIds.size === 0) continue;

    const score = jaccardSimilarity(mechSkillIds, elMechSkillIds);
    if (score > 0) {
      scored.push({ result: elementToResult(idx, el), score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.result);
}
