/**
 * Cross-source element matching using name similarity.
 *
 * Given lists of elements from different sources, finds pairs that
 * likely refer to the same improv game/exercise, enabling the graph
 * layer to merge them with source attribution.
 */

export interface MatchCandidate {
  identifier: string;
  name: string;
  sourceName: string;
  languageCode: string;
}

export interface MatchPair {
  a: MatchCandidate;
  b: MatchCandidate;
  score: number;
}

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(" ").filter((t) => t.length > 1));
  const tokensB = new Set(b.split(" ").filter((t) => t.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  return intersection.size / Math.max(tokensA.size, tokensB.size);
}

/**
 * Find pairs of elements from different sources with similar names.
 * Returns pairs with score >= threshold (0.0 to 1.0).
 */
export function findCrossSourceMatches(
  candidates: MatchCandidate[],
  threshold: number = 0.8,
): MatchPair[] {
  const matches: MatchPair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];

      // Only match across sources and languages
      if (a.sourceName === b.sourceName) continue;

      const key = `${a.identifier}:${b.identifier}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const nameA = normalizeForMatch(a.name);
      const nameB = normalizeForMatch(b.name);

      // Exact match after normalization
      if (nameA === nameB) {
        matches.push({ a, b, score: 1.0 });
        continue;
      }

      // Token overlap for similar names
      const score = tokenOverlap(nameA, nameB);
      if (score >= threshold) {
        matches.push({ a, b, score: Math.round(score * 100) / 100 });
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Build a map from element identifier to a list of related identifiers
 * from other sources.
 */
export function buildRelatedIdentifiers(
  candidates: MatchCandidate[],
  threshold: number = 0.8,
): Map<string, string[]> {
  const matches = findCrossSourceMatches(candidates, threshold);
  const related = new Map<string, string[]>();

  for (const m of matches) {
    if (!related.has(m.a.identifier)) related.set(m.a.identifier, []);
    if (!related.has(m.b.identifier)) related.set(m.b.identifier, []);
    related.get(m.a.identifier)!.push(m.b.identifier);
    related.get(m.b.identifier)!.push(m.a.identifier);
  }

  return related;
}
