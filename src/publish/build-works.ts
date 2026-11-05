import { createHash } from "crypto";
import {
  normalizeForMatch,
  type ChallengeAnnotation,
  type ChallengeDirection,
  type ChallengeIndex,
  type ChallengeLever,
} from "../challenge/challenge-schema";
import {
  buildAdjustments,
  mergeAnnotations,
  type WorkAdjustments,
} from "../challenge/adjustments";
import type { NormalizedElement } from "../normalize/normalized-schema";

export { MIN_CLUSTER_CONFIDENCE } from "../normalize/cluster-config";
import { MIN_CLUSTER_CONFIDENCE } from "../normalize/cluster-config";

export interface PublishedVariation {
  id: string;
  kind: "inline" | "standalone";
  name: string;
  description: string;
  differsBy: string[];
  /** Work id, set for standalone variants that have their own source page. */
  elementId?: string;
  /** easier / harder / lateral / unknown, relative to the base exercise. */
  direction?: ChallengeDirection;
  /** What the variation turns (players, information, rules, …). */
  lever?: ChallengeLever | null;
  /** Verbatim quote from the variation text that justifies the direction. */
  evidence?: string;
}

export interface PublishedWork {
  id: string;
  languageCode: "de" | "en";
  canonicalElementId: string;
  memberIds: string[];
  translationId: string | null;
  parentWorkId: string | null;
  parentConfidence: number | null;
  variations: PublishedVariation[];
  adjustments: WorkAdjustments;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function digest(prefix: string, parts: string[]): string {
  return createHash("md5")
    .update([prefix, ...parts].join(":"))
    .digest("hex");
}

export function buildWorkId(
  languageCode: string,
  memberIds: string[]
): string {
  return `work:${digest("work", [languageCode, ...[...memberIds].sort()])}`;
}

function buildTranslationId(workIds: string[]): string {
  return `tr:${digest("translation", [...workIds].sort())}`;
}

function buildVariationId(workId: string, name: string): string {
  return `variation:${digest("variation", [workId, normalizeName(name)])}`;
}

function canonicalScore(element: NormalizedElement): number {
  const { normalized } = element;
  let score = 0;

  // Prefer improwiki: it carries the sidebar card fields and the longest
  // editorial text. learnimprov next, ircwiki last.
  if (element.sourceName === "improwiki") score += 100;
  else if (element.sourceName === "learnimprov") score += 60;
  else score += 30;

  if (normalized.howToPlay && normalized.howToPlay.steps.length > 0) {
    score += 40;
  }
  score += Math.min(30, normalized.description.length / 20);
  if (element.playerCountMin != null) score += 10;

  return score;
}

function pickCanonicalMember(
  members: NormalizedElement[]
): NormalizedElement {
  return [...members].sort((a, b) => {
    const diff = canonicalScore(b) - canonicalScore(a);
    if (diff !== 0) return diff;
    // Stable tie-breakers so the artifact does not change between runs.
    if (a.sourceName !== b.sourceName) {
      return a.sourceName.localeCompare(b.sourceName);
    }
    return a.identifier.localeCompare(b.identifier);
  })[0];
}

function collectAnnotations(
  members: NormalizedElement[],
  challenge: ChallengeIndex
): Map<string, ChallengeAnnotation[]> {
  const byName = new Map<string, ChallengeAnnotation[]>();

  for (const member of members) {
    const elementAnnotations = challenge.get(member.identifier);
    if (!elementAnnotations) continue;

    for (const variation of member.normalized.variations) {
      const key = normalizeForMatch(variation.name);
      const annotation = elementAnnotations.get(key);
      if (!annotation) continue;

      const list = byName.get(key) ?? [];
      list.push(annotation);
      byName.set(key, list);
    }
  }

  return byName;
}

function dedupeVariations(
  members: NormalizedElement[],
  workId: string,
  challenge?: ChallengeIndex
): PublishedVariation[] {
  const byName = new Map<string, PublishedVariation>();

  for (const member of members) {
    for (const variation of member.normalized.variations) {
      const key = normalizeName(variation.name);
      if (!key) continue;

      const existing = byName.get(key);
      if (existing && existing.description.length >= variation.description.length) {
        continue;
      }

      byName.set(key, {
        id: buildVariationId(workId, variation.name),
        kind: "inline",
        name: variation.name,
        description: variation.description,
        differsBy: variation.differsBy,
      });
    }
  }

  if (challenge) {
    const annotations = collectAnnotations(members, challenge);
    for (const [key, variation] of byName) {
      const merged = mergeAnnotations(annotations.get(key) ?? []);
      if (!merged) continue;
      variation.direction = merged.direction;
      variation.lever = merged.lever;
      variation.evidence = merged.evidence;
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

interface UnionFind {
  find(id: string): string;
  union(a: string, b: string): void;
  groups(): Map<string, string[]>;
}

function createUnionFind(ids: Iterable<string>): UnionFind {
  const parent = new Map<string, string>();
  for (const id of ids) parent.set(id, id);

  function find(id: string): string {
    const root = parent.get(id) ?? id;
    if (root !== id) {
      const resolved = find(root);
      parent.set(id, resolved);
      return resolved;
    }
    parent.set(id, id);
    return id;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  function groups(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const id of parent.keys()) {
      const root = find(id);
      const list = result.get(root) ?? [];
      list.push(id);
      result.set(root, list);
    }
    return result;
  }

  return { find, union, groups };
}

function buildSameLanguageClusters(
  elements: NormalizedElement[],
  minConfidence: number
): NormalizedElement[][] {
  const byId = new Map(elements.map((element) => [element.identifier, element]));
  const unionFind = createUnionFind(byId.keys());

  for (const element of elements) {
    for (const relation of element.relatedIdentifiers) {
      if ((relation.confidence ?? 0) < minConfidence) continue;

      const other = byId.get(relation.identifier);
      if (!other) continue;
      // Works are language-homogeneous; translations are a separate relation.
      if (other.languageCode !== element.languageCode) continue;

      unionFind.union(element.identifier, relation.identifier);
    }
  }

  return [...unionFind.groups().values()].map((ids) =>
    ids.map((id) => byId.get(id) as NormalizedElement)
  );
}

function buildTranslationGroups(
  works: { id: string; languageCode: string; memberIds: string[] }[],
  elementToWork: Map<string, string>,
  elements: NormalizedElement[]
): Map<string, string> {
  const workById = new Map(works.map((work) => [work.id, work]));
  const unionFind = createUnionFind(works.map((work) => work.id));
  const languagesByRoot = new Map<string, Set<string>>();
  for (const work of works) {
    languagesByRoot.set(work.id, new Set([work.languageCode]));
  }

  for (const element of elements) {
    const workId = elementToWork.get(element.identifier);
    if (!workId) continue;

    const targets = [
      element.translationLinkDeIdentifier,
      element.translationLinkEnIdentifier,
    ].filter((id): id is string => Boolean(id));

    for (const targetId of targets) {
      const otherWorkId = elementToWork.get(targetId);
      if (!otherWorkId || otherWorkId === workId) continue;

      const otherWork = workById.get(otherWorkId);
      if (!otherWork) continue;

      const rootA = unionFind.find(workId);
      const rootB = unionFind.find(otherWorkId);
      if (rootA === rootB) continue;

      const languagesA = languagesByRoot.get(rootA) as Set<string>;
      const languagesB = languagesByRoot.get(rootB) as Set<string>;
      // A translation group holds at most one work per language. Conflicting
      // links (two German works pointing at the same English one) are skipped
      // rather than merged into an ambiguous group.
      const overlaps = [...languagesA].some((lang) => languagesB.has(lang));
      if (overlaps) continue;

      unionFind.union(rootA, rootB);
      const merged = new Set([...languagesA, ...languagesB]);
      languagesByRoot.set(unionFind.find(rootA), merged);
    }
  }

  const translationIdByWork = new Map<string, string>();
  for (const ids of unionFind.groups().values()) {
    if (ids.length < 2) continue;

    const languages = new Set(ids.map((id) => workById.get(id)?.languageCode));
    if (languages.size < 2) continue;

    const translationId = buildTranslationId(ids);
    for (const id of ids) translationIdByWork.set(id, translationId);
  }

  return translationIdByWork;
}

const NAME_SEPARATORS = [" - ", "-", " – ", "–", ": ", ":"];

function remainderAfterParent(
  childName: string,
  parentName: string
): string | undefined {
  const child = normalizeName(childName);
  const parent = normalizeName(parentName);

  for (const separator of NAME_SEPARATORS) {
    const prefix = `${parent}${separator}`;
    if (!child.startsWith(prefix)) continue;
    const remainder = child.slice(prefix.length).trim();
    if (remainder.length > 0) return remainder;
  }

  return undefined;
}

/**
 * Links source pages that are variations of another element (for example
 * `Endowments-Crime Scene` → `Endowments`, `Freeze-Endowment` → `Freeze`).
 *
 * The rule is deliberately narrow: the child's name must start with the
 * parent's name plus a separator, and the remainder must match a variation
 * that the parent actually documents. Byte-similar names without that
 * evidence stay independent.
 */
function linkStandaloneVariants(
  works: {
    id: string;
    languageCode: string;
    name: string;
    memberNames: string[];
    variations: PublishedVariation[];
  }[]
): Map<string, { parentWorkId: string; confidence: number; remainder: string }> {
  const links = new Map<
    string,
    { parentWorkId: string; confidence: number; remainder: string }
  >();

  const byLanguage = new Map<string, typeof works>();
  for (const work of works) {
    const list = byLanguage.get(work.languageCode) ?? [];
    list.push(work);
    byLanguage.set(work.languageCode, list);
  }

  for (const candidates of byLanguage.values()) {
    for (const child of candidates) {
      let best:
        | {
            parentWorkId: string;
            confidence: number;
            remainder: string;
            parentNameLength: number;
          }
        | undefined;

      for (const parent of candidates) {
        if (parent.id === child.id) continue;

        for (const parentName of parent.memberNames) {
          const remainder = remainderAfterParent(child.name, parentName);
          if (!remainder) continue;

          const variationNames = parent.variations.map((variation) =>
            normalizeName(variation.name)
          );
          const matches = variationNames.some(
            (name) =>
              name === remainder ||
              name.includes(remainder) ||
              remainder.includes(name)
          );
          if (!matches) continue;

          // Prefer the most specific (longest) parent name.
          if (!best || parentName.length > best.parentNameLength) {
            best = {
              parentWorkId: parent.id,
              confidence: 1,
              remainder,
              parentNameLength: parentName.length,
            };
          }
        }
      }

      if (best) {
        links.set(child.id, {
          parentWorkId: best.parentWorkId,
          confidence: best.confidence,
          remainder: best.remainder,
        });
      }
    }
  }

  return links;
}

function mergeVariations(
  inline: PublishedVariation[],
  children: { workId: string; name: string; description: string; remainder: string }[]
): PublishedVariation[] {
  const result = new Map(
    inline.map((variation) => [normalizeName(variation.name), variation])
  );

  for (const child of children) {
    const childKey = normalizeName(child.name);
    // Remove inline variations that describe the same thing under a shorter
    // name (e.g. inline "Crime Scene" vs. the page "Endowments-Crime Scene").
    const remainderKey = normalizeName(child.remainder);
    for (const [key, variation] of result) {
      const variationKey = normalizeName(variation.name);
      if (variationKey.length === 0) {
        result.delete(key);
        continue;
      }
      if (
        key === childKey ||
        variationKey === remainderKey ||
        (remainderKey.length > 0 &&
          (remainderKey.includes(variationKey) ||
            variationKey.includes(remainderKey)))
      ) {
        result.delete(key);
      }
    }

    result.set(childKey, {
      id: child.workId,
      kind: "standalone",
      name: child.name,
      description: child.description,
      differsBy: [],
      elementId: child.workId,
    });
  }

  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildWorks(
  elements: NormalizedElement[],
  options?: {
    minConfidence?: number;
    /**
     * Extra parent links from `graph-overrides.json` (element level). Mapped to
     * works after clustering.
     */
    parentLinks?: { childElementId: string; parentElementId: string }[];
    /**
     * Variation classification from `output/challenge/*.json`. Optional: without
     * it the artifact keeps the v2 shape.
     */
    challenge?: ChallengeIndex;
  }
): PublishedWork[] {
  const minConfidence = options?.minConfidence ?? MIN_CLUSTER_CONFIDENCE;
  const clusters = buildSameLanguageClusters(elements, minConfidence);

  const elementToWork = new Map<string, string>();
  const works: (PublishedWork & {
    name: string;
    memberNames: string[];
    description: string;
  })[] = [];

  for (const cluster of clusters) {
    const languageCode = cluster[0].languageCode;
    const memberIds = cluster.map((member) => member.identifier);
    const id = buildWorkId(languageCode, memberIds);
    const canonical = pickCanonicalMember(cluster);

    for (const member of cluster) elementToWork.set(member.identifier, id);

    works.push({
      id,
      languageCode,
      canonicalElementId: canonical.identifier,
      memberIds: [...memberIds].sort(),
      translationId: null,
      parentWorkId: null,
      parentConfidence: null,
      variations: dedupeVariations(cluster, id, options?.challenge),
      adjustments: { easier: [], harder: [] },
      name: canonical.name,
      memberNames: [...new Set(cluster.map((member) => member.name))],
      description: canonical.normalized.description,
    });
  }

  const translationIds = buildTranslationGroups(
    works,
    elementToWork,
    elements
  );
  for (const work of works) {
    work.translationId = translationIds.get(work.id) ?? null;
  }

  const links = linkStandaloneVariants(works);

  // Enforce a single level: a work that is itself a variant cannot become a
  // parent. This keeps the relation acyclic regardless of iteration order.
  const childIds = new Set(links.keys());
  for (const [childWorkId, link] of [...links]) {
    if (childIds.has(link.parentWorkId)) {
      links.delete(childWorkId);
    }
  }

  for (const [childWorkId, link] of links) {
    const child = works.find((work) => work.id === childWorkId);
    const parent = works.find((work) => work.id === link.parentWorkId);
    if (!child || !parent) continue;
    // Keep the relation one level deep so the artifact cannot contain cycles.
    if (parent.parentWorkId) continue;

    child.parentWorkId = parent.id;
    child.parentConfidence = link.confidence;
  }

  for (const link of options?.parentLinks ?? []) {
    const childWorkId = elementToWork.get(link.childElementId);
    const parentWorkId = elementToWork.get(link.parentElementId);
    if (!childWorkId || !parentWorkId || childWorkId === parentWorkId) continue;

    const child = works.find((work) => work.id === childWorkId);
    const parent = works.find((work) => work.id === parentWorkId);
    if (!child || !parent || child.parentWorkId) continue;

    child.parentWorkId = parent.id;
    child.parentConfidence = 1;
    links.set(child.id, {
      parentWorkId: parent.id,
      confidence: 1,
      remainder: normalizeName(child.name),
    });
  }

  for (const parent of works) {
    const children = works
      .filter((work) => work.parentWorkId === parent.id)
      .map((work) => {
        const remainder =
          links.get(work.id)?.remainder ?? normalizeName(work.name);
        return {
          workId: work.id,
          name: work.name,
          description: work.description,
          remainder,
        };
      });

    if (children.length === 0) continue;
    parent.variations = mergeVariations(parent.variations, children);
  }

  // Adjustments depend on the final variation list (standalone variants replace
  // inline ones), so derive them last.
  for (const work of works) {
    work.adjustments = buildAdjustments(work.variations);
  }

  return works
    .map(
      ({
        name: _name,
        memberNames: _memberNames,
        description: _description,
        ...work
      }) => work
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}
