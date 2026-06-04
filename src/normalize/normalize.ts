import path from "path";
import { createHash } from "crypto";
import { mkdir } from "node:fs/promises";
import type { NormalizedElement } from "./normalized-schema";
import { normalizedSourceSchema, getNormalizedBy } from "./normalized-schema";
import { createOpencodeGoClient } from "./llm-client";
import { seedTranslationPairs, buildRelatedIdentifiers } from "./cross-source-matching";
import { normalizeVocabulary, applyCanonicalTerms } from "./vocabulary";

function hashContent(html: string): string {
  return createHash("md5").update(html).digest("hex");
}

export interface NormalizeProgress {
  sourceName: string;
  stage: "extraction" | "matching" | "vocabulary" | "done" | "error";
  dispatched: number;
  total: number;
  cached: number;
  split: number;
  errors: number;
  startedAt: string;
  error?: string;
}

let currentProgress: NormalizeProgress | null = null;

export function getNormalizeProgress(): NormalizeProgress | null {
  return currentProgress;
}

async function loadRaw(sourceName: string): Promise<{ meta: Record<string, any>; elements: any[] }> {
  const rawPath = path.join(process.cwd(), "output", "raw", `${sourceName}.json`);
  const f = Bun.file(rawPath);
  if (!(await f.exists())) {
    throw new Error(`Raw file not found: ${rawPath}. Run scrape first.`);
  }
  const data = await f.json();
  return { meta: data.meta || {}, elements: data.elements || [] };
}

async function loadPreviousNormalized(sourceName: string): Promise<Map<string, NormalizedElement>> {
  const prev = new Map<string, NormalizedElement>();
  const prevPath = path.join(process.cwd(), "output", "normalized", `${sourceName}.json`);
  const f = Bun.file(prevPath);
  if (!(await f.exists())) return prev;
  try {
    const data = await f.json();
    for (const e of data.elements || []) {
      prev.set(e.identifier, e);
    }
  } catch { /* ignore corrupt file */ }
  return prev;
}

function generateSplitIdentifier(parentId: string, childName: string): string {
  return createHash("md5").update(parentId + childName).digest("hex");
}

function buildNormalizedElement(
  result: NormalizedElement,
  el: any,
  contentHash: string,
  schemaHash: string,
): NormalizedElement {
  return {
    ...result,
    identifier: el.identifier,
    name: el.name,
    url: el.url,
    sourceName: el.sourceName,
    languageCode: el.languageCode,
    tags: el.tags,
    htmlContent: el.htmlContent as string || "",
    translationLinkEn: el.translationLinkEn,
    translationLinkDe: el.translationLinkDe,
    translationLinkEnIdentifier: el.translationLinkEnIdentifier,
    translationLinkDeIdentifier: el.translationLinkDeIdentifier,
    playerCountMin: el.playerCountMin,
    playerCountMax: el.playerCountMax,
    categories: el.categories,
    postTags: el.postTags,
    lastModified: el.lastModified,
    normalized: {
      ...result.normalized,
      contentHash,
      extractedAt: new Date().toISOString(),
      normalizedBy: schemaHash,
    },
  };
}

async function normalizeSource(
  client: ReturnType<typeof createOpencodeGoClient>,
  sourceName: string,
  previous: Map<string, NormalizedElement>,
  options?: { maxElements?: number },
): Promise<NormalizedElement[]> {
  const { elements: rawElements } = await loadRaw(sourceName);
  const elements = options?.maxElements ? rawElements.slice(0, options.maxElements) : rawElements;
  const schemaHash = getNormalizedBy();

  currentProgress = {
    sourceName,
    stage: "extraction",
    dispatched: 0,
    total: elements.length,
    cached: 0,
    split: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
  };

  console.log(`Normalizing ${sourceName}: ${elements.length}${options?.maxElements ? ` of ${rawElements.length}` : ""} elements`);

  const startTime = Date.now();
  const outDir = path.join(process.cwd(), "output", "normalized");
  const sourcePath = path.join(outDir, `${sourceName}.json`);
  const dir = Bun.file(outDir);
  if (!(await dir.exists())) {
    await mkdir(outDir, { recursive: true });
  }

  const normalizedMap = new Map<string, NormalizedElement>();
  let dispatched = 0;
  let cached = 0;
  let splitCount = 0;
  let errors = 0;
  let writeLock = false;
  let lastWriteAt = 0;

  const concurrency = 5;
  let index = 0;

  async function incrementalWrite() {
    if (writeLock) return;
    writeLock = true;
    try {
      const elements = [...normalizedMap.values()];
      const derivedCount = elements.reduce((s, e) => s + e.derivedElements.length, 0);
      const output = {
        meta: { sourceName, elementCount: elements.length, derivedElementCount: derivedCount, splitElementCount: splitCount, normalizedAt: new Date().toISOString() },
        elements,
      };
      await Bun.write(sourcePath, JSON.stringify(output, null, 2));
      lastWriteAt = Date.now();
    } catch (err: any) {
      console.warn(`  Write error ${sourceName}: ${err.message.slice(0, 100)}`);
    } finally {
      writeLock = false;
    }
  }

  function updateProgress() {
    currentProgress = {
      ...currentProgress!,
      dispatched,
      cached,
      split: splitCount,
      errors,
    };
  }

  async function processNext(): Promise<void> {
    while (index < elements.length) {
      const i = index++;
      const el = elements[i];
      const contentHash = hashContent(el.htmlContent || "");

      // Cache hit: same HTML content AND same schema version
      const prev = previous.get(el.identifier);
      if (prev?.normalized?.contentHash === contentHash && prev?.normalized?.normalizedBy === schemaHash) {
        normalizedMap.set(el.identifier, prev);
        cached++;
        dispatched++;
        updateProgress();
        if (dispatched % 10 === 0) logProgress();
        continue;
      }

      try {
        const result = await client.normalizeElement(
          el.name,
          el.htmlContent as string || "",
          el.languageCode,
          el.tags,
        );

        if (Array.isArray(result)) {
          const [parent, ...children] = result;
          normalizedMap.set(el.identifier, buildNormalizedElement(parent, el, contentHash, schemaHash));

          for (const child of children) {
            const childId = generateSplitIdentifier(el.identifier, child.name);
            normalizedMap.set(childId, buildNormalizedElement(child, { ...el, identifier: childId }, contentHash, schemaHash));
            splitCount++;
          }
        } else {
          normalizedMap.set(el.identifier, buildNormalizedElement(result, el, contentHash, schemaHash));
        }
      } catch (err: any) {
        console.warn(`  SKIP ${el.name}: ${err.message.slice(0, 150)}`);
        if (prev) normalizedMap.set(el.identifier, prev);
        errors++;
      }

      dispatched++;
      updateProgress();
      if (dispatched % 10 === 0) logProgress();
      if (dispatched % 25 === 0) await incrementalWrite();
    }
  }

  function logProgress() {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (dispatched / parseFloat(elapsed)).toFixed(1);
    console.log(`  [${dispatched}/${elements.length}] ${sourceName}: ${dispatched - cached} new, ${cached} cached, ${splitCount} split (${rate}/s, ${elapsed}s)`);
  }

  const workers = Array.from({ length: Math.min(concurrency, elements.length) }, () => processNext());
  await Promise.all(workers);
  await incrementalWrite(); // final write

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const normalized = [...normalizedMap.values()];
  const derivedCount = normalized.reduce((s, e) => s + e.derivedElements.length, 0);

  const output = {
    meta: {
      sourceName,
      elementCount: normalized.length,
      derivedElementCount: derivedCount,
      splitElementCount: splitCount,
      normalizedAt: new Date().toISOString(),
    },
    elements: normalized,
  };

  console.log(`Finished ${sourceName}: ${normalized.length} elements, ${derivedCount} derived, ${splitCount} split, ${cached} cached, ${errors} errors, ${totalTime}s`);
  return parsed.success ? parsed.data.elements : normalized;
}

export async function normalizeAll(options?: { maxElements?: number }): Promise<void> {
  const client = createOpencodeGoClient();

  console.log("=== STAGE 1: LLM Extraction ===\n");
  const allElements: Map<string, NormalizedElement[]> = new Map();

  for (const source of ["improwiki", "learnimprov", "ircwiki"]) {
    try {
      const previous = await loadPreviousNormalized(source);
      const elements = await normalizeSource(client, source, previous, options);
      allElements.set(source, elements);
    } catch (err: any) {
      console.error(`Failed to normalize ${source}: ${err.message}`);
    }
  }

  if (options?.maxElements) {
    console.log(`\nSubset mode (max ${options.maxElements} per source) — skipping Stages 2 & 3.`);
    currentProgress = { ...currentProgress!, stage: "done" };
    console.log("=== Normalization (subset) complete ===");
    return;
  }

  console.log("\n=== STAGE 2: Cross-Source Matching ===\n");

  const allCandidates: { identifier: string; name: string; description: string; sourceName: string; languageCode: string }[] = [];
  const allWithTranslation: any[] = [];

  for (const [source, elements] of allElements) {
    for (const el of elements) {
      allCandidates.push({
        identifier: el.identifier,
        name: el.name,
        description: el.normalized.description,
        sourceName: el.sourceName,
        languageCode: el.languageCode,
      });
      allWithTranslation.push(el);
    }
  }

  const translationPairs = seedTranslationPairs(allWithTranslation as any);
  console.log(`Seeded ${translationPairs.length} translation-link pairs`);

  const related = await buildRelatedIdentifiers(allCandidates, client, translationPairs);

  const outDir = path.join(process.cwd(), "output", "normalized");
  for (const [source, elements] of allElements) {
    const updated = elements.map(el => ({
      ...el,
      relatedIdentifiers: related.get(el.identifier) || [],
    }));

    const srcPath = path.join(outDir, `${source}.json`);
    const f = Bun.file(srcPath);
    if (!(await f.exists())) continue;
    const data = await f.json();
    data.elements = updated;

    const parsed = normalizedSourceSchema.safeParse(data);
    await Bun.write(srcPath, JSON.stringify(parsed.success ? parsed.data : data, null, 2));

    const matchCount = updated.reduce((s, e) => s + e.relatedIdentifiers.length, 0) / 2;
    console.log(`  Updated ${source}: ${matchCount} total cross-source match pairs`);
  }

  console.log("\n=== STAGE 3: Vocabulary Normalization ===\n");

  const allNormalized: NormalizedElement[] = [];
  for (const elements of allElements.values()) {
    allNormalized.push(...elements);
  }

  const vocab = await normalizeVocabulary(client, allNormalized);

  if (vocab.mechanics.length > 0 || vocab.skills.length > 0) {
    await Bun.write(
      path.join(outDir, "..", "vocabulary.json"),
      JSON.stringify(vocab, null, 2),
    );
    console.log(`Wrote vocabulary.json: ${vocab.mechanics.length} mechanic clusters, ${vocab.skills.length} skill clusters`);

    for (const [source, elements] of allElements) {
      const canonicalized = applyCanonicalTerms(elements, vocab);
      const srcPath = path.join(outDir, `${source}.json`);
      const f = Bun.file(srcPath);
      if (!(await f.exists())) continue;
      const data = await f.json();
      data.elements = canonicalized;

      const parsed = normalizedSourceSchema.safeParse(data);
      await Bun.write(srcPath, JSON.stringify(parsed.success ? parsed.data : data, null, 2));

      const changed = canonicalized.filter((el, i) => {
        const orig = elements[i];
        if (!orig) return false;
        return el.normalized.mechanics.some((m, j) => m.originalName) ||
               el.normalized.skills.some((s, j) => s.originalName);
      }).length;
      console.log(`  Canonicalized ${changed} elements in ${source}`);
    }
  }

  currentProgress = { ...currentProgress!, stage: "done" };
  console.log("\n=== Normalization complete ===");
}

// Allow running directly: bun run src/normalize/normalize.ts
if (import.meta.main) {
  const maxElements = process.env.NORMALIZE_MAX ? parseInt(process.env.NORMALIZE_MAX) : undefined;
  normalizeAll({ maxElements }).catch((err) => {
    console.error("Normalization failed:", err);
    process.exit(1);
  });
}
