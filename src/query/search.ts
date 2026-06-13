import { getGraphIndex, type GraphIndex } from "./graph-query";
import type { ElementNode } from "../graph/derive";

export interface SearchResult {
  elementId: string;
  label: string;
  summary: string;
  score: number;
  difficulty?: string;
  energyLevel?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  matchedConcepts: {
    mechanics: string[];
    skills: string[];
    tags: string[];
  };
  queryWords: string[];
  suggestions: string[];
}

export interface SearchOptions {
  canonicalOnly?: boolean;
  language?: string;
  limit?: number;
}

const STOP_WORDS = new Set([
  "a",
  "the",
  "is",
  "of",
  "in",
  "and",
  "to",
  "for",
  "with",
  "on",
]);

const CURATED_SUGGESTIONS = [
  "storytelling",
  "status",
  "characters",
  "rhyming",
  "singing",
  "active listening",
  "physicality",
  "emotions",
  "scene work",
  "spontaneity",
];

interface ElementLabelIndex {
  mechanicLabels: string[];
  skillLabels: string[];
  tagLabels: string[];
}

let _labelIndex: Map<string, ElementLabelIndex> | null = null;

function buildElementLabelIndex(idx: GraphIndex): Map<string, ElementLabelIndex> {
  const map = new Map<string, ElementLabelIndex>();

  for (const el of idx.elements) {
    const mechanicLabels: string[] = [];
    const skillLabels: string[] = [];
    const tagLabels: string[] = [];

    const outEdges = idx.edgesByFrom.get(el.id) || [];
    for (const edge of outEdges) {
      if (edge.type === "hasMechanic") {
        const node = idx.nodeById.get(edge.to);
        if (node) mechanicLabels.push(node.label);
      } else if (edge.type === "trainsSkill") {
        const node = idx.nodeById.get(edge.to);
        if (node) skillLabels.push(node.label);
      } else if (edge.type === "hasTag") {
        const node = idx.nodeById.get(edge.to);
        if (node) tagLabels.push(node.label);
      }
    }

    map.set(el.id, { mechanicLabels, skillLabels, tagLabels });
  }

  return map;
}

function getElementLabelIndex(): Map<string, ElementLabelIndex> {
  if (!_labelIndex) {
    _labelIndex = buildElementLabelIndex(getGraphIndex());
  }
  return _labelIndex;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreElements(
  elements: ElementNode[],
  labelIndex: Map<string, ElementLabelIndex>,
  queryWords: string[],
): {
  results: SearchResult[];
  matchedMechanics: Set<string>;
  matchedSkills: Set<string>;
  matchedTags: Set<string>;
} {
  const results: SearchResult[] = [];
  const matchedMechanics = new Set<string>();
  const matchedSkills = new Set<string>();
  const matchedTags = new Set<string>();

  for (const el of elements) {
    let score = 0;
    const elLabels = labelIndex.get(el.id);

    for (const word of queryWords) {
      const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");

      if (regex.test(el.label)) {
        score += 10;
      }

      if (regex.test(el.summary)) {
        score += 5;
      }

      if (elLabels) {
        for (const m of elLabels.mechanicLabels) {
          if (regex.test(m)) {
            score += 4;
            matchedMechanics.add(m);
          }
        }
        for (const s of elLabels.skillLabels) {
          if (regex.test(s)) {
            score += 4;
            matchedSkills.add(s);
          }
        }
        for (const t of elLabels.tagLabels) {
          if (regex.test(t)) {
            score += 3;
            matchedTags.add(t);
          }
        }
      }
    }

    if (score > 0) {
      results.push({
        elementId: el.id,
        label: el.label,
        summary: el.summary,
        score,
        difficulty: el.difficulty,
        energyLevel: el.energyLevel,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);

  return { results, matchedMechanics, matchedSkills, matchedTags };
}

export function searchElements(
  query: string,
  options?: SearchOptions,
): SearchResponse {
  const canonicalOnly = options?.canonicalOnly !== false;
  const language = options?.language || "en";
  const limit = options?.limit || 50;

  const idx = getGraphIndex();
  const labelIndex = getElementLabelIndex();

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  const elements = canonicalOnly ? idx.canonicals : idx.elements;
  const enElements = elements.filter((el) => el.languageCode === language);

  if (queryWords.length === 0) {
    return {
      results: [],
      matchedConcepts: { mechanics: [], skills: [], tags: [] },
      queryWords: [],
      suggestions: CURATED_SUGGESTIONS,
    };
  }

  const { results, matchedMechanics, matchedSkills, matchedTags } =
    scoreElements(enElements, labelIndex, queryWords);

  let finalResults = results.slice(0, limit);

  if (finalResults.length < 5 && queryWords.length > 1) {
    let worstWord = queryWords[queryWords.length - 1];
    let worstCount = Infinity;

    for (const word of queryWords) {
      let matchCount = 0;
      const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
      for (const [, elLabels] of labelIndex) {
        for (const m of elLabels.mechanicLabels) {
          if (regex.test(m)) matchCount++;
        }
        for (const s of elLabels.skillLabels) {
          if (regex.test(s)) matchCount++;
        }
        for (const t of elLabels.tagLabels) {
          if (regex.test(t)) matchCount++;
        }
      }
      if (matchCount < worstCount) {
        worstCount = matchCount;
        worstWord = word;
      }
    }

    const retryWords = queryWords.filter((w) => w !== worstWord);
    if (retryWords.length > 0) {
      const retry = scoreElements(enElements, labelIndex, retryWords);
      if (retry.results.length > finalResults.length) {
        finalResults = retry.results.slice(0, limit);
        for (const m of retry.matchedMechanics) matchedMechanics.add(m);
        for (const s of retry.matchedSkills) matchedSkills.add(s);
        for (const t of retry.matchedTags) matchedTags.add(t);
      }
    }
  }

  const matchedConceptLabels = new Set(
    [...matchedMechanics, ...matchedSkills, ...matchedTags].map((l) =>
      l.toLowerCase(),
    ),
  );

  const suggestions = CURATED_SUGGESTIONS.filter(
    (s) => !matchedConceptLabels.has(s.toLowerCase()),
  ).slice(0, 5);

  return {
    results: finalResults,
    matchedConcepts: {
      mechanics: [...matchedMechanics],
      skills: [...matchedSkills],
      tags: [...matchedTags],
    },
    queryWords,
    suggestions,
  };
}
