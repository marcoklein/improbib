import path from "path";
import { createHash } from "crypto";
import type { NormalizedElement } from "./normalized-schema";
import { normalizedSourceSchema } from "./normalized-schema";
import { jaccardWordSimilarity, seedTranslationPairs } from "./cross-source-matching";
import { createOpencodeGoClient, callApi, extractJson } from "./llm-client";
import { ACTIVE_SOURCES } from "../sources";
import { normalizeSourceUrl } from "../scraping/shared/url-identity";

interface SameAsRecord {
  canonical: string;
  variants: string[];
}

interface ThesaurusFile {
  sameAs: SameAsRecord[];
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/^the\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let prev = 0;
  for (let i = 1; i <= m; i++) {
    prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(dp[j], dp[j - 1], prev);
      prev = temp;
    }
  }
  return dp[n];
}

function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

async function loadThesaurus(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const p = path.join(import.meta.dirname, "element-thesaurus.json");
  const f = Bun.file(p);
  if (!(await f.exists())) return map;
  try {
    const data: ThesaurusFile = await f.json();
    for (const entry of data.sameAs) {
      const canonicalLower = entry.canonical.toLowerCase();
      map.set(canonicalLower, entry.canonical);
      for (const variant of entry.variants) {
        map.set(variant.toLowerCase(), entry.canonical);
      }
    }
  } catch {
    console.warn("Could not load element thesaurus");
  }
  return map;
}

function mechJaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map(m => m.toLowerCase()));
  const setB = new Set(b.map(m => m.toLowerCase()));
  let intersection = 0;
  for (const m of setA) {
    if (setB.has(m)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

function computeMatchScore(
  a: NormalizedElement,
  b: NormalizedElement,
  thesaurus: Map<string, string>,
): number {
  const canonA = thesaurus.get(a.name.toLowerCase());
  const canonB = thesaurus.get(b.name.toLowerCase());

  // Thesaurus: both map to same canonical
  if (canonA && canonB && canonA.toLowerCase() === canonB.toLowerCase()) return 1.0;
  // Thesaurus: one is canonical, other is variant
  if (canonA && canonA.toLowerCase() === b.name.toLowerCase()) return 1.0;
  if (canonB && canonB.toLowerCase() === a.name.toLowerCase()) return 1.0;

  const na = normalizeName(a.name);
  const nb = normalizeName(b.name);

  // Exact normalized name match
  if (na === nb && na.length > 0) return 0.95;

  const mechNamesA = a.normalized.mechanics.map(m => m.name);
  const mechNamesB = b.normalized.mechanics.map(m => m.name);
  const mechScore = mechJaccard(mechNamesA, mechNamesB);
  const sharedMechCount = mechNamesA.filter(m => mechNamesB.some(n => n.toLowerCase() === m.toLowerCase())).length;

  // Substring match: requires the shorter name to be multi-word (single-word names like "Freeze" are too generic)
  const substringMatch = na.length > 3 && nb.length > 3 && (na.includes(nb) || nb.includes(na));
  const shorterIsMultiWord = (na.length <= nb.length ? na : nb).includes(" ");
  const validSubstring = substringMatch && shorterIsMultiWord;

  if (validSubstring && mechScore >= 0.3) return 0.85;
  if (validSubstring && sharedMechCount >= 1) return 0.8;
  if (validSubstring) return 0.7;

  // Name similarity via Levenshtein
  const nameLevRatio = na.length < 30 && nb.length < 30 ? levenshteinRatio(na, nb) : 0;
  const hasNameSignal = validSubstring || nameLevRatio >= 0.75;

  // Strong mechanic signal: ≥2 shared AND Jaccard > 0.4 AND some name similarity
  if (sharedMechCount >= 2 && mechScore >= 0.4 && hasNameSignal) return 0.9;

  // Moderate mechanic signal: ≥2 shared AND Jaccard > 0.33 (at least 1/3 overlap) AND name similarity
  if (sharedMechCount >= 2 && mechScore >= 0.33 && hasNameSignal) return 0.8;

  // Single shared distinctive mechanic + name similarity
  if (sharedMechCount >= 1 && hasNameSignal && mechScore >= 0.3) return 0.75;

  // Levenshtein for short names with mechanic verification
  if (nameLevRatio >= 0.8 && mechScore >= 0.3) return 0.75;
  if (nameLevRatio >= 0.8) return 0.65;

  // Combined weighted score
  const skillNamesA = [...a.normalized.skills];
  const skillNamesB = [...b.normalized.skills];
  const skillScore = mechJaccard(skillNamesA, skillNamesB);
  const combined = 0.4 * mechScore + 0.3 * Math.min(1, levenshteinRatio(na, nb) * 1.5) + 0.3 * skillScore;
  if (combined >= 0.6) return Math.min(0.85, combined);

  return 0;
}

function findDeterministicMatches(
  elements: NormalizedElement[],
  thesaurus: Map<string, string>,
): Map<string, { identifier: string; confidence: number }[]> {
  const related = new Map<string, { identifier: string; confidence: number }[]>();

  function addPair(aId: string, bId: string, confidence: number) {
    if (!related.has(aId)) related.set(aId, []);
    if (!related.has(bId)) related.set(bId, []);
    const aExisting = related.get(aId)!.find(r => r.identifier === bId);
    const bExisting = related.get(bId)!.find(r => r.identifier === aId);
    if (aExisting) {
      aExisting.confidence = Math.max(aExisting.confidence, confidence);
      if (bExisting) bExisting.confidence = Math.max(bExisting.confidence, confidence);
    } else {
      related.get(aId)!.push({ identifier: bId, confidence });
      related.get(bId)!.push({ identifier: aId, confidence });
    }
  }

  // Group by source
  const bySource = new Map<string, NormalizedElement[]>();
  for (const el of elements) {
    const list = bySource.get(el.sourceName) || [];
    list.push(el);
    bySource.set(el.sourceName, list);
  }

  const sourceNames = [...bySource.keys()];
  let totalComparisons = 0;
  let totalMatches = 0;

  for (let i = 0; i < sourceNames.length; i++) {
    for (let j = i + 1; j < sourceNames.length; j++) {
      const listA = bySource.get(sourceNames[i])!;
      const listB = bySource.get(sourceNames[j])!;

      // Jaccard name pre-filter
      const similarPairs: { a: NormalizedElement; b: NormalizedElement }[] = [];
      for (const a of listA) {
        for (const b of listB) {
          totalComparisons++;
          if (jaccardWordSimilarity(a.name, b.name, 0)) {
            similarPairs.push({ a, b });
          }
        }
      }

      for (const { a, b } of similarPairs) {
        // Guard: never match within the same source
        if (a.sourceName === b.sourceName) continue;
        const score = computeMatchScore(a, b, thesaurus);
        if (score >= 0.65) {
          addPair(a.identifier, b.identifier, score);
          totalMatches++;
        }
      }
    }
  }

  const totalPreFiltered = totalComparisons; // approximate, we count each pair once
  console.log(`  Deterministic: ${totalComparisons} pairs compared, ${totalMatches} matches found`);

  // Also add translation-link seeds
  const translationPairs = seedTranslationPairs(elements as any);
  for (const p of translationPairs) {
    addPair(p.a, p.b, p.confidence);
  }
  console.log(`  Translation seeds: ${translationPairs.length} pairs`);

  // Count unique match pairs
  let pairCount = 0;
  const seen = new Set<string>();
  for (const [id, matches] of related) {
    for (const m of matches) {
      const key = [id, m.identifier].sort().join(":");
      if (!seen.has(key)) {
        seen.add(key);
        pairCount++;
      }
    }
  }
  console.log(`  Total matched pairs (incl. translations): ${pairCount}`);

  return related;
}

interface EnhancedCandidate {
  identifier: string;
  name: string;
  description: string;
  sourceName: string;
  mechanics: string[];
  skills: string[];
}

function buildEnhancedMatchPrompt(sourceA: EnhancedCandidate[], sourceB: EnhancedCandidate[]): string {
  const maxDesc = 200;
  const listA = sourceA.map((e, i) => {
    const desc = e.description.length > maxDesc ? e.description.slice(0, maxDesc) + "..." : e.description;
    const mech = e.mechanics.length > 0 ? `Mechanics: ${e.mechanics.join(", ")}` : "";
    const skill = e.skills.length > 0 ? `Skills: ${e.skills.join(", ")}` : "";
    const extra = [mech, skill].filter(Boolean).join("; ");
    return `- [${i}] ${e.name}: ${desc}${extra ? ` [${extra}]` : ""}`;
  }).join("\n");
  const listB = sourceB.map((e, i) => {
    const desc = e.description.length > maxDesc ? e.description.slice(0, maxDesc) + "..." : e.description;
    const mech = e.mechanics.length > 0 ? `Mechanics: ${e.mechanics.join(", ")}` : "";
    const skill = e.skills.length > 0 ? `Skills: ${e.skills.join(", ")}` : "";
    const extra = [mech, skill].filter(Boolean).join("; ");
    return `- [${i}] ${e.name}: ${desc}${extra ? ` [${extra}]` : ""}`;
  }).join("\n");

  return `Compare these two lists of improv elements from different sources. Return all pairs that refer to the same game/exercise/concept.

Use the mechanics and skills fields to help identify matches — if two elements share several mechanics (especially distinctive ones), they are likely the same game.

Source A (${sourceA[0]?.sourceName || "unknown"}):
${listA}

Source B (${sourceB[0]?.sourceName || "unknown"}):
${listB}

Return a JSON object: {"matches": [{"a": "index from A", "b": "index from B", "confidence": 0.0-1.0}]}
Use the numeric index (in brackets) from each list. Confidence should reflect how certain you are these are the same thing. 1.0 = definitely identical. 0.5 = possibly related. Only include pairs with confidence >= 0.5.`;
}

function parseEnhancedMatchResponse(
  text: string,
  sourceA: EnhancedCandidate[],
  sourceB: EnhancedCandidate[],
): { a: string; b: string; confidence: number }[] {
  let json: any;
  try { json = extractJson(text); } catch { return []; }
  if (!json.matches || !Array.isArray(json.matches)) return [];
  return json.matches.map((m: any) => ({
    a: sourceA[Number(m.a)]?.identifier || String(m.a || ""),
    b: sourceB[Number(m.b)]?.identifier || String(m.b || ""),
    confidence: typeof m.confidence === "number" ? m.confidence : 0.5,
  }));
}

async function findEnhancedLLMMatches(
  elements: NormalizedElement[],
  existingMatches: Map<string, { identifier: string; confidence: number }[]>,
): Promise<Map<string, { identifier: string; confidence: number }[]>> {
  const related = new Map(existingMatches);
  const matchedIds = new Set<string>();
  for (const [id, matches] of existingMatches) {
    matchedIds.add(id);
    for (const m of matches) matchedIds.add(m.identifier);
  }

  function addPair(aId: string, bId: string, confidence: number) {
    if (!related.has(aId)) related.set(aId, []);
    if (!related.has(bId)) related.set(bId, []);
    const existing = related.get(aId)!.find(r => r.identifier === bId);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
    } else {
      related.get(aId)!.push({ identifier: bId, confidence });
      related.get(bId)!.push({ identifier: aId, confidence });
    }
  }

  // Group unmatched elements by source
  const bySource = new Map<string, EnhancedCandidate[]>();
  for (const el of elements) {
    if (matchedIds.has(el.identifier)) continue;
    const list = bySource.get(el.sourceName) || [];
    list.push({
      identifier: el.identifier,
      name: el.name,
      description: el.normalized.description,
      sourceName: el.sourceName,
      mechanics: el.normalized.mechanics.map(m => m.name),
      skills: [...el.normalized.skills],
    });
    bySource.set(el.sourceName, list);
  }

  const sourceNames = [...bySource.keys()];
  const apiKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY || "";
  // Same default as the extractor: the previous default named models that the
  // gateway no longer serves, so every batch failed with "Model is
  // unavailable" and cross-source matching silently degraded to the
  // deterministic pass.
  const models = (process.env.DEDUP_MODELS || "deepseek-v4.1-flash,deepseek-v4-flash-free,deepseek-v4-flash")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let totalBatches = 0;
  let totalSucceeded = 0;
  let totalPairs = 0;

  for (let i = 0; i < sourceNames.length; i++) {
    for (let j = i + 1; j < sourceNames.length; j++) {
      const listA = bySource.get(sourceNames[i])!;
      const listB = bySource.get(sourceNames[j])!;
      if (listA.length === 0 || listB.length === 0) continue;

      // Name pre-filter
      const similarA: EnhancedCandidate[] = [];
      const similarBIds = new Set<string>();
      for (const a of listA) {
        for (const b of listB) {
          if (jaccardWordSimilarity(a.name, b.name, 0)) {
            similarBIds.add(b.identifier);
            similarA.push(a);
            break;
          }
        }
      }
      const filteredB = listB.filter(b => similarBIds.has(b.identifier));
      if (similarA.length === 0 || filteredB.length === 0) continue;

      console.log(`  LLM pre-filtered ${sourceNames[i]}↔${sourceNames[j]}: ${listA.length}×${listB.length} → ${similarA.length}×${filteredB.length} candidates`);

      const batchSize = 20;
      let pairBatches = 0;
      let pairSucceeded = 0;

      for (let a = 0; a < similarA.length; a += batchSize) {
        for (let b = 0; b < filteredB.length; b += batchSize) {
          const batchA = similarA.slice(a, a + batchSize);
          const batchB = filteredB.slice(b, b + batchSize);

          await new Promise(r => setTimeout(r, 1000));
          pairBatches++;
          totalBatches++;

          try {
            const prompt = buildEnhancedMatchPrompt(batchA, batchB);
            const text = await callApi(
              apiKey, models,
              "You compare improv elements and return match pairs as JSON. Use mechanics and skills overlaps as strong signals for matching.",
              prompt, 16000, 2, true,
            );
            const matches = parseEnhancedMatchResponse(text, batchA, batchB);
            for (const m of matches) {
              if (m.confidence >= 0.5) {
                addPair(m.a, m.b, m.confidence);
                totalPairs++;
              }
            }
            pairSucceeded++;
            totalSucceeded++;
          } catch (err: any) {
            console.warn(`  LLM match failed for ${sourceNames[i]}↔${sourceNames[j]} batch: ${err.message}`);
          }
        }
      }
      if (pairBatches > 0) {
        console.log(`  ${sourceNames[i]}↔${sourceNames[j]}: ${pairSucceeded}/${pairBatches} batches succeeded`);
      }
    }
  }

  if (totalBatches > 0) {
    console.log(`  LLM matching: ${totalSucceeded}/${totalBatches} batches succeeded, ${totalPairs} new LLM-confirmed pairs`);
  }

  return related;
}

/**
 * Conservative identity key for a source URL. See
 * `normalizeSourceUrl` in `src/scraping/shared/url-identity.ts`.
 */
export const normalizeElementUrl = normalizeSourceUrl;

/**
 * The published measure of how much content a source element carries.
 *
 * Elements loaded from `output/normalized` have no `markdown` (it is derived at
 * assembly time); split children and raw elements do. The markdown length wins
 * when it is there, otherwise the article HTML length is the closest available
 * proxy for the same thing.
 */
export function elementContentLength(element: NormalizedElement): number {
  const markdown = (element as NormalizedElement & { markdown?: unknown })
    .markdown;
  if (typeof markdown === "string") return markdown.length;
  return element.htmlContent?.length ?? 0;
}

/**
 * Picks the element that survives a same-page group.
 *
 * Rule: the element with the most content characters (markdown when present,
 * otherwise the HTML length); ties are broken by the lowest identifier. Both
 * parts are stable across runs, so the keeper never depends on input order or
 * on a model.
 */
export function pickSameUrlKeeper(
  group: NormalizedElement[]
): NormalizedElement {
  return [...group].sort((a, b) => {
    const byLength = elementContentLength(b) - elementContentLength(a);
    if (byLength !== 0) return byLength;
    return a.identifier.localeCompare(b.identifier);
  })[0];
}

export interface SameUrlGroup {
  sourceName: string;
  /** Normalized URL, i.e. the group key. */
  url: string;
  elements: NormalizedElement[];
}

/**
 * Groups elements by `(sourceName, normalized url)`.
 *
 * Source-scoped on purpose: the same URL under two different sources stays
 * with the normal (LLM) matching, because two sources can describe different
 * games on a shared or migrated page.
 */
export function findSameUrlGroups(
  elements: NormalizedElement[]
): SameUrlGroup[] {
  const groups = new Map<string, SameUrlGroup>();
  for (const element of elements) {
    const url = normalizeElementUrl(element.url);
    const key = `${element.sourceName}\u0000${url}`;
    const group = groups.get(key);
    if (group) {
      group.elements.push(element);
    } else {
      groups.set(key, {
        sourceName: element.sourceName,
        url,
        elements: [element],
      });
    }
  }
  return [...groups.values()]
    .filter((group) => group.elements.length > 1)
    .sort(
      (a, b) =>
        a.sourceName.localeCompare(b.sourceName) || a.url.localeCompare(b.url)
    );
}

export interface SameUrlMerge {
  sourceName: string;
  url: string;
  keeper: NormalizedElement;
  duplicates: NormalizedElement[];
}

type MetadataArrays = {
  tags?: string[];
  categories?: string[];
  postTags?: string[];
};

const METADATA_ARRAY_FIELDS = ["tags", "categories", "postTags"] as const;

/**
 * Unions the source taxonomies into the keeper so nothing that was discovered
 * through a second listing page (which supplies its own `addTags`) is lost.
 */
function unionMetadataArrays(target: MetadataArrays, source: MetadataArrays): void {
  for (const field of METADATA_ARRAY_FIELDS) {
    const extra = source[field];
    if (!extra || extra.length === 0) continue;
    target[field] = [...new Set([...(target[field] ?? []), ...extra])];
  }
}

/**
 * Collapses every same-page group into its keeper.
 *
 * The scraper derives an element identifier from `element;<name>;<url>`, so a
 * page whose title changed is enqueued again under a new identifier while the
 * previous element stays in place. Two entries for one URL are the same page,
 * not a judgement call — the LLM matcher saw them in different runs and made
 * two different calls, which is exactly the instability this pass removes.
 *
 * Content is not merged: the keeper is already the most complete extraction of
 * that page, only the metadata arrays are unioned into it.
 *
 * Pure: returns the element list without the duplicates (input order kept) and
 * a description of every merge for logging and write-back.
 */
export function mergeSameUrlDuplicates(elements: NormalizedElement[]): {
  elements: NormalizedElement[];
  merges: SameUrlMerge[];
} {
  const merges: SameUrlMerge[] = [];
  const dropped = new Set<string>();

  for (const group of findSameUrlGroups(elements)) {
    const keeper = pickSameUrlKeeper(group.elements);
    const duplicates = group.elements
      .filter((element) => element.identifier !== keeper.identifier)
      .sort((a, b) => a.identifier.localeCompare(b.identifier));

    for (const duplicate of duplicates) {
      unionMetadataArrays(keeper, duplicate);
      dropped.add(duplicate.identifier);
    }

    merges.push({
      sourceName: group.sourceName,
      url: group.url,
      keeper,
      duplicates,
    });
  }

  return {
    elements: elements.filter((element) => !dropped.has(element.identifier)),
    merges,
  };
}

/**
 * Removes the merged-away duplicates from both output layers.
 *
 * The normalized layer feeds matching and the graph; the raw layer feeds the
 * published `elements` array. Cleaning only one of the two would leave the
 * duplicate in the artifact (raw) or in the graph (normalized), so both are
 * rewritten here — the dedup stage is the only place that decides what a
 * duplicate is.
 *
 * The normalized files are written from the in-memory list, so the keeper
 * keeps the metadata that was unioned into it.
 */
async function writeBackSameUrlMerge(
  outDir: string,
  rawDir: string,
  sources: readonly string[],
  merges: SameUrlMerge[],
  keptBySource: Map<string, NormalizedElement[]>
): Promise<void> {
  const droppedIds = new Set(
    merges.flatMap((merge) =>
      merge.duplicates.map((duplicate) => duplicate.identifier)
    )
  );
  const mergeByKeeperId = new Map(
    merges.map((merge) => [merge.keeper.identifier, merge])
  );

  for (const source of sources) {
    const normalizedPath = path.join(outDir, `${source}.json`);
    const normalizedFile = Bun.file(normalizedPath);
    const kept = keptBySource.get(source);
    if (kept && (await normalizedFile.exists())) {
      const data = await normalizedFile.json();
      const before = (data.elements ?? []).length;
      if (kept.length !== before) {
        data.elements = kept;
        const parsed = normalizedSourceSchema.safeParse(data);
        await Bun.write(
          normalizedPath,
          JSON.stringify(parsed.success ? parsed.data : data, null, 2)
        );
        console.log(
          `  Removed ${before - kept.length} duplicate(s) from normalized/${source}.json`
        );
      }
    }

    const rawPath = path.join(rawDir, `${source}.json`);
    const rawFile = Bun.file(rawPath);
    if (!(await rawFile.exists())) continue;
    const raw = await rawFile.json();
    const before = (raw.elements ?? []).length;
    const keptRaw = (raw.elements ?? []).filter(
      (element: { identifier: string }) => !droppedIds.has(element.identifier)
    );
    if (keptRaw.length === before) continue;
    for (const element of keptRaw as MetadataArrays[]) {
      const merge = mergeByKeeperId.get((element as { identifier: string }).identifier);
      if (!merge) continue;
      for (const duplicate of merge.duplicates) {
        unionMetadataArrays(element, duplicate);
      }
    }
    raw.elements = keptRaw;
    await Bun.write(rawPath, JSON.stringify(raw, null, 2));
    console.log(
      `  Removed ${before - keptRaw.length} duplicate(s) from raw/${source}.json`
    );
  }
}

export async function dedupElements(): Promise<void> {
  const outDir = path.join(process.cwd(), "output", "normalized");
  const rawDir = path.join(process.cwd(), "output", "raw");
  const allSources = [...ACTIVE_SOURCES];
  let allElements: NormalizedElement[] = [];

  console.log("=== ELEMENT DEDUP ===\n");

  // Load all elements
  for (const source of allSources) {
    const srcPath = path.join(outDir, `${source}.json`);
    const f = Bun.file(srcPath);
    if (!(await f.exists())) {
      console.log(`  Skipping ${source}: no normalized output found`);
      continue;
    }
    const data = await f.json();
    allElements.push(...data.elements);
    console.log(`  Loaded ${source}: ${data.elements.length} elements`);
  }

  if (allElements.length === 0) {
    console.log("\nNo normalized elements found. Run Stage 1+3 first.");
    return;
  }

  // Deterministic same-page merge. Deliberately before the cache check and
  // before any model call: two entries for one `(source, url)` are one page,
  // and that must never depend on an LLM decision or on a cache state.
  console.log("\n--- Deterministic Same-Page Merge ---");
  const sameUrlMerge = mergeSameUrlDuplicates(allElements);
  allElements = sameUrlMerge.elements;

  if (sameUrlMerge.merges.length === 0) {
    console.log("  No element shares a source and URL — nothing to merge");
  } else {
    for (const merge of sameUrlMerge.merges) {
      console.log(`  ${merge.sourceName} | ${merge.url}`);
      console.log(
        `    keep ${merge.keeper.identifier} "${merge.keeper.name}" (${elementContentLength(merge.keeper)} chars)`
      );
      for (const duplicate of merge.duplicates) {
        console.log(
          `    drop ${duplicate.identifier} "${duplicate.name}" (${elementContentLength(duplicate)} chars)`
        );
      }
    }
    const droppedIds = new Set(
      sameUrlMerge.merges.flatMap((merge) =>
        merge.duplicates.map((duplicate) => duplicate.identifier)
      )
    );
    const keptBySource = new Map<string, NormalizedElement[]>();
    for (const element of allElements) {
      const list = keptBySource.get(element.sourceName) ?? [];
      list.push(element);
      keptBySource.set(element.sourceName, list);
    }
    await writeBackSameUrlMerge(
      outDir,
      rawDir,
      allSources,
      sameUrlMerge.merges,
      keptBySource
    );
    console.log(
      `  Merged ${sameUrlMerge.merges.length} same-page group(s), dropped ${droppedIds.size} element(s)`
    );
  }

  // Compute content hash for caching
  const candidatesSorted = [...allElements].sort((a, b) => a.identifier.localeCompare(b.identifier));
  const inputHash = createHash("md5")
    .update(JSON.stringify(candidatesSorted.map(c => ({ id: c.identifier, name: c.name, mech: c.normalized.mechanics.map(m => m.name) }))))
    .digest("hex");

  const statePath = path.join(process.cwd(), "output", ".normalize-state.json");
  let state: { dedup?: { inputHash: string; completedAt: string } } = {};
  try {
    const sf = Bun.file(statePath);
    if (await sf.exists()) state = await sf.json();
  } catch { /* missing */ }

  const skipDedup = state.dedup?.inputHash === inputHash;
  if (skipDedup) {
    console.log(`  Input hash unchanged (${inputHash.slice(0, 8)}) — all elements already matched.\n`);
    console.log("=== Element dedup skipped (cache hit) ===");
    return;
  }
  console.log(`  Input hash: ${inputHash.slice(0, 8)}${state.dedup?.inputHash ? ` (was ${state.dedup.inputHash.slice(0, 8)})` : " (first run)"}`);

  // Load thesaurus
  const thesaurus = await loadThesaurus();
  console.log(`  Thesaurus: ${thesaurus.size} entries`);

  // Deterministic matching
  console.log("\n--- Deterministic Matching ---");
  let allMatches = findDeterministicMatches(allElements, thesaurus);

  // LLM matching (skip if DEDUP_SKIP_LLM is set)
  console.log("\n--- LLM Matching ---");
  const skipLLM = process.env.DEDUP_SKIP_LLM === "1";
  if (skipLLM) {
    console.log("  Skipping LLM matching (DEDUP_SKIP_LLM=1)");
  } else {
    allMatches = await findEnhancedLLMMatches(allElements, allMatches);
  }

  // Write back to normalized files
  console.log("\n--- Writing Back ---");
  for (const source of allSources) {
    const srcPath = path.join(outDir, `${source}.json`);
    const f = Bun.file(srcPath);
    if (!(await f.exists())) continue;
    const data = await f.json();

    const updated = data.elements.map((el: NormalizedElement) => ({
      ...el,
      relatedIdentifiers: allMatches.get(el.identifier) || [],
    }));

    data.elements = updated;
    const parsed = normalizedSourceSchema.safeParse(data);
    await Bun.write(srcPath, JSON.stringify(parsed.success ? parsed.data : data, null, 2));

    const matchCount = updated.reduce((s: number, e: NormalizedElement) => s + e.relatedIdentifiers.length, 0) / 2;
    console.log(`  Updated ${source}: ${matchCount} match pairs`);
  }

  // Update state
  state.dedup = { inputHash, completedAt: new Date().toISOString() };
  await Bun.write(statePath, JSON.stringify(state, null, 2));

  console.log("\n=== Element dedup complete ===");
}
