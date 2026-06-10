import { getGraphIndex } from "./graph-query";
import type { GraphNode } from "../graph/derive";

export interface ThemeNode {
  type: "Mechanic" | "Skill" | "Tag";
  id: string;
  label: string;
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

const themeCache = new Map<string, ThemeNode[]>();

export function expandTheme(theme: string): ThemeNode[] {
  const cacheKey = theme.toLowerCase().trim();
  const cached = themeCache.get(cacheKey);
  if (cached) return cached;

  const idx = getGraphIndex();

  const words = theme
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  const scored: { node: ThemeNode; score: number }[] = [];

  for (const node of idx.nodes) {
    if (node.type !== "Mechanic" && node.type !== "Skill" && node.type !== "Tag")
      continue;
    const labelLower = node.label.toLowerCase();
    let matchCount = 0;
    for (const word of words) {
      if (labelLower.includes(word)) matchCount++;
    }
    if (matchCount > 0) {
      scored.push({
        node: { type: node.type, id: node.id, label: node.label },
        score: matchCount,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const result = scored.map((s) => s.node);

  themeCache.set(cacheKey, result);
  return result;
}

export function clearThemeCache(): void {
  themeCache.clear();
}
