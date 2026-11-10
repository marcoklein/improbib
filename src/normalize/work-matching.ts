/**
 * Finding the sources that describe the same work, *before* any extraction.
 *
 * The old pipeline extracted every source page on its own and merged the
 * results afterwards, which is why the same game could end up with two
 * different walkthroughs side by side. Here the grouping happens on the raw
 * text, so the extraction sees all sources of a work at once.
 *
 * A group is language-homogeneous: the German and the English page of the same
 * game are two works, linked by `translationId` later. Only same-language
 * sources are merged.
 *
 * The matching is deliberately staged:
 *
 * 1. Same normalized title — confident, no review needed.
 * 2. Same normalized title after dropping an article or a plural -s — nearly
 *    as confident ("Actor's Nightmare" / "Actors Nightmare").
 * 3. Similar title in the review band — a human or the LLM decides.
 * 4. Everything else stays separate.
 *
 * First paragraphs are part of the signal, not the decision: two pages can
 * share a title and describe different games (there are two "Freeze" variants
 * in learnimprov), so a title match with no shared content is downgraded into
 * the review band instead of being merged blindly.
 */

export interface WorkSource {
  identifier: string;
  name: string;
  languageCode: string;
  sourceName: string;
  /** Plain text of the page's first paragraph, used as a sanity check. */
  lead?: string;
}

export interface WorkGroup {
  ids: string[];
  languageCode: string;
  /** How the group was formed. */
  method: "title" | "normalized-title" | "similar-title";
  /** 0–1; groups below `REVIEW_THRESHOLD` are proposals, not decisions. */
  confidence: number;
}

/** Above this, a group is merged automatically. */
export const AUTO_THRESHOLD = 0.85;
/**
 * Between `REVIEW_THRESHOLD` and `AUTO_THRESHOLD` a proposal is shown for
 * review instead of being applied.
 */
export const REVIEW_THRESHOLD = 0.6;

const LEADING_ARTICLE = /^(the|a|an|der|die|das|ein|eine)\s+/;

/**
 * The title as it is compared: lower-case, no punctuation, no diacritics, no
 * leading article, single spaces.
 */
export function normalizeTitle(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(LEADING_ARTICLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Second chance for titles that differ only in a plural marker
 * ("Actor's Nightmare" / "Actors Nightmare"). Not applied to short titles,
 * where dropping an "s" changes too much ("Cats" / "Cat").
 */
function singularized(title: string): string {
  return title
    .split(" ")
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
    .join(" ");
}

function tokenSet(text: string): Set<string> {
  return new Set(text.split(" ").filter(Boolean));
}

/** Jaccard similarity of the word sets of two normalized strings. */
export function tokenSimilarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) {
    if (setB.has(token)) shared++;
  }
  return shared / (setA.size + setB.size - shared);
}

/**
 * Title similarity on a 0–1 scale. An exact normalized match is 1, a shared
 * first word plus a shared word set lands around 0.7–0.85, unrelated titles
 * stay near 0.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (singularized(left) === singularized(right)) return 0.95;

  const jaccard = tokenSimilarity(left, right);
  // One title containing the other is a strong signal ("Freeze" / "Freeze Tag").
  const containment =
    left.startsWith(`${right} `) || right.startsWith(`${left} `) ? 0.9 : 0;
  return Math.max(jaccard, containment);
}

/**
 * Whether two leads talk about the same thing. Used as a guard, not as a
 * reason to merge: a title match with a lead that shares almost no word gets
 * downgraded.
 */
export function leadAgrees(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return true; // no lead = no evidence against
  const words = (text: string) =>
    new Set(
      normalizeTitle(text)
        .split(" ")
        .filter((word) => word.length > 3)
    );
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return true;
  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared++;
  }
  return shared / Math.min(left.size, right.size) >= 0.2;
}

interface Cluster {
  members: WorkSource[];
  languageCode: string;
  method: WorkGroup["method"];
  confidence: number;
}

/**
 * Groups same-language sources that describe the same work.
 *
 * Returns every group with two or more sources, sorted by the first
 * identifier so the result is stable across runs. Groups below
 * `REVIEW_THRESHOLD` are not returned at all — they are separate works.
 */
export function findWorkGroups(sources: WorkSource[]): WorkGroup[] {
  const byLanguage = new Map<string, WorkSource[]>();
  for (const source of sources) {
    const list = byLanguage.get(source.languageCode) ?? [];
    list.push(source);
    byLanguage.set(source.languageCode, list);
  }

  const groups: WorkGroup[] = [];
  for (const [languageCode, languageSources] of byLanguage) {
    const clusters: Cluster[] = [];

    for (const source of [...languageSources].sort((a, b) =>
      a.identifier.localeCompare(b.identifier)
    )) {
      let best: { cluster: Cluster; score: number } | null = null;

      for (const cluster of clusters) {
        const anchor = cluster.members[0];
        let score = titleSimilarity(anchor.name, source.name);
        if (score === 0) continue;

        // A shared title with an unrelated lead is suspicious. Two pages can
        // share a name and describe different games.
        if (score >= AUTO_THRESHOLD && !leadAgrees(anchor.lead, source.lead)) {
          score = Math.min(score, 0.75);
        }

        if (!best || score > best.score) best = { cluster, score };
      }

      if (best && best.score >= REVIEW_THRESHOLD) {
        best.cluster.members.push(source);
        // The weakest link defines the confidence of the group.
        best.cluster.confidence = Math.min(best.cluster.confidence, best.score);
        if (best.score < AUTO_THRESHOLD) best.cluster.method = "similar-title";
      } else {
        clusters.push({
          members: [source],
          languageCode,
          method: "title",
          confidence: titleSimilarity(source.name, source.name), // 1
        });
      }
    }

    for (const cluster of clusters) {
      if (cluster.members.length < 2) continue;
      groups.push({
        ids: cluster.members.map((member) => member.identifier).sort(),
        languageCode,
        method: cluster.method,
        confidence: Number(cluster.confidence.toFixed(2)),
      });
    }
  }

  return groups.sort((a, b) => a.ids[0].localeCompare(b.ids[0]));
}

/** Groups that need a human (or an LLM) before they are merged. */
export function findReviewGroups(groups: WorkGroup[]): WorkGroup[] {
  return groups.filter((group) => group.confidence < AUTO_THRESHOLD);
}
