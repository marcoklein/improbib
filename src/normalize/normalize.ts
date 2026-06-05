import path from "path";
import { createHash } from "crypto";
import { mkdir } from "node:fs/promises";
import type { NormalizedElement } from "./normalized-schema";
import { normalizedSourceSchema, getNormalizedBy } from "./normalized-schema";
import { createOpencodeGoClient, getPromptHash } from "./llm-client";


interface DroppedElement {
  identifier: string;
  name: string;
  reason: string;
}

function hashContent(html: string): string {
  return createHash("md5").update(html).digest("hex");
}

export interface FillerWarning {
  name: string;
  count: number;
  percentage: number;
  field: "mechanics" | "skills";
}

export interface FillerReport {
  warnings: FillerWarning[];
  totalElements: number;
  threshold: number;
  minAbsoluteCount: number;
}

export function detectFillers(
  elements: NormalizedElement[],
  threshold: number = 0.05,
  minAbsoluteCount: number = 2,
): FillerReport {
  const mechCounts = new Map<string, number>();
  const skillCounts = new Map<string, number>();

  for (const el of elements) {
    for (const m of el.normalized.mechanics) {
      const name = m.name.toLowerCase().trim();
      if (name) mechCounts.set(name, (mechCounts.get(name) || 0) + 1);
    }
    for (const s of el.normalized.skills) {
      const name = s.name.toLowerCase().trim();
      if (name) skillCounts.set(name, (skillCounts.get(name) || 0) + 1);
    }
  }

  const warnings: FillerWarning[] = [];
  const total = elements.length;

  for (const [name, count] of mechCounts) {
    const pct = count / total;
    if (pct > threshold && count >= minAbsoluteCount) {
      warnings.push({ name, count, percentage: pct, field: "mechanics" });
    }
  }
  for (const [name, count] of skillCounts) {
    const pct = count / total;
    if (pct > threshold && count >= minAbsoluteCount) {
      warnings.push({ name, count, percentage: pct, field: "skills" });
    }
  }

  warnings.sort((a, b) => b.percentage - a.percentage);

  return { warnings, totalElements: total, threshold, minAbsoluteCount };
}

export interface NormalizeProgress {
  sourceName: string;
  stage: "extraction" | "matching" | "done" | "error";
  dispatched: number;
  total: number;
  cached: number;
  split: number;
  errors: number;
  dropped: number;
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
): Promise<{ elements: NormalizedElement[]; anyElementChanged: boolean; droppedCount: number }> {
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
    dropped: 0,
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
  const dropped: DroppedElement[] = [];
  let dispatched = 0;
  let cached = 0;
  let splitCount = 0;
  let errors = 0;
  let writeLock = false;
  let lastWriteAt = 0;
  let anyElementChanged = false;

  const concurrency = 10;
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
      dropped: dropped.length,
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

      anyElementChanged = true;

      try {
        const result = await client.normalizeElement(
          el.name,
          el.htmlContent as string || "",
          el.languageCode,
          el.tags,
        );

        if (Array.isArray(result)) {
          const [parent, ...children] = result;
          const parentEl = buildNormalizedElement(parent, el, contentHash, schemaHash);
          delete (parentEl as any).splitFrom;
          normalizedMap.set(el.identifier, parentEl);

          for (const child of children) {
            const childId = generateSplitIdentifier(el.identifier, child.name);
            const childEl = buildNormalizedElement(child, { ...el, identifier: childId }, contentHash, schemaHash);
            childEl.splitFrom = el.identifier;
            normalizedMap.set(childId, childEl);
            splitCount++;
          }
        } else {
          normalizedMap.set(el.identifier, buildNormalizedElement(result, el, contentHash, schemaHash));
        }
      } catch (err: any) {
        console.warn(`  SKIP ${el.name}: ${err.message.slice(0, 150)}`);
        if (prev) {
          normalizedMap.set(el.identifier, prev);
        } else {
          dropped.push({ identifier: el.identifier, name: el.name, reason: err.message.slice(0, 200) });
        }
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
  await incrementalWrite(); // final snapshot

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const normalized = [...normalizedMap.values()];
  const derivedCount = normalized.reduce((s, e) => s + e.derivedElements.length, 0);

  const output = {
    meta: { sourceName, elementCount: normalized.length, derivedElementCount: derivedCount, splitElementCount: splitCount, normalizedAt: new Date().toISOString() },
    elements: normalized,
  };

  // Validate and write final validated output
  const parsed = normalizedSourceSchema.safeParse(output);
  if (!parsed.success) {
    console.error(`Schema validation failed for ${sourceName}:`);
    for (const issue of parsed.error.issues.slice(0, 30)) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    if (parsed.error.issues.length > 30) {
      console.error(`  ... and ${parsed.error.issues.length - 30} more issues`);
    }
  }
  const finalOutput = parsed.success ? parsed.data : output;
  await Bun.write(sourcePath, JSON.stringify(finalOutput, null, 2));

  // Write dropped element report for visibility and recovery
  if (dropped.length > 0) {
    const droppedPath = path.join(outDir, `dropped-${sourceName}.json`);
    const droppedReport = {
      sourceName,
      droppedAt: new Date().toISOString(),
      count: dropped.length,
      elements: dropped,
    };
    await Bun.write(droppedPath, JSON.stringify(droppedReport, null, 2));
    console.warn(`  Dropped ${dropped.length} elements without previous version — see ${droppedPath}`);
    for (const d of dropped.slice(0, 10)) {
      console.warn(`    - ${d.name}: ${d.reason}`);
    }
    if (dropped.length > 10) console.warn(`    ... and ${dropped.length - 10} more`);
  }

  const droppedCount = dropped.length;
  console.log(`Finished ${sourceName}: ${normalized.length} elements, ${derivedCount} derived, ${splitCount} split, ${cached} cached, ${errors} errors (${droppedCount} dropped), ${totalTime}s`);

  const fillerReport = detectFillers(finalOutput.elements);
  if (fillerReport.warnings.length > 0) {
    console.warn(`  FILLER WARNING: ${fillerReport.warnings.length} names above ${(fillerReport.threshold * 100).toFixed(0)}% threshold in ${sourceName}:`);
    for (const w of fillerReport.warnings) {
      console.warn(`    ${w.field}: "${w.name}" appears in ${w.count}/${fillerReport.totalElements} elements (${(w.percentage * 100).toFixed(1)}%)`);
    }
  }

  return { elements: finalOutput.elements, anyElementChanged, droppedCount: dropped.length };
}

export async function normalizeAll(options?: { maxElements?: number; source?: string; stages?: number[] }): Promise<void> {
  const client = createOpencodeGoClient();

  const allSources = ["improwiki", "learnimprov", "ircwiki"];
  const sourceNames = options?.source ? [options.source] : allSources;

  console.log("=== STAGE 1: LLM Extraction ===\n");
  const allElements: Map<string, NormalizedElement[]> = new Map();
  let anyElementChanged = false;

  await Promise.all(sourceNames.map(async (source) => {
    try {
      const previous = await loadPreviousNormalized(source);
      const result = await normalizeSource(client, source, previous, options);
      allElements.set(source, result.elements);
      if (result.anyElementChanged) anyElementChanged = true;
    } catch (err: any) {
      console.error(`Failed to normalize ${source}: ${err.message}`);
    }
  }));

  const allForFillerCheck: NormalizedElement[] = [];
  for (const [, elements] of allElements) {
    allForFillerCheck.push(...elements);
  }

  if (allForFillerCheck.length > 0) {
    const aggregateReport = detectFillers(allForFillerCheck);
    if (aggregateReport.warnings.length > 0) {
      console.warn(`\n  CROSS-SOURCE FILLER WARNING: ${aggregateReport.warnings.length} names above ${(aggregateReport.threshold * 100).toFixed(0)}% threshold across ${allElements.size} sources:`);
      for (const w of aggregateReport.warnings) {
        console.warn(`    ${w.field}: "${w.name}" appears in ${w.count}/${aggregateReport.totalElements} elements (${(w.percentage * 100).toFixed(1)}%)`);
      }
    }
  }

  const promptHash = getPromptHash();
  const statePath = path.join(process.cwd(), "output", ".normalize-state.json");

  // Read previous state
  let state: { promptHash?: string; stage2?: { inputHash: string; completedAt: string }; stage1Sources?: Record<string, { elementCount: number; droppedCount: number; completedAt: string }> } = {};
  try {
    const sf = Bun.file(statePath);
    if (await sf.exists()) {
      state = await sf.json();
    }
  } catch { /* missing or corrupt — start fresh */ }

  async function writeState() {
    await Bun.write(statePath, JSON.stringify({ ...state, promptHash }, null, 2));
  }

  // Record Stage 1 completion per source
  const normDir = path.join(process.cwd(), "output", "normalized");
  state.stage1Sources = {};
  for (const [source, elements] of allElements) {
    const droppedPath = path.join(normDir, `dropped-${source}.json`);
    let droppedCount = 0;
    try {
      const df = Bun.file(droppedPath);
      if (await df.exists()) {
        const report = await df.json();
        droppedCount = report.count || 0;
      }
    } catch { /* ignore */ }
    state.stage1Sources[source] = {
      elementCount: elements.length,
      droppedCount,
      completedAt: new Date().toISOString(),
    };
  }
  await writeState();

  if (options?.maxElements || (options?.stages?.includes(1) && options.stages.length === 1)) {
    console.log(`\nSubset/stage-1-only mode — cross-source matching runs separately via --dedup.`);
    currentProgress = { ...currentProgress!, stage: "done" };
    console.log("=== Stage 1 (extraction) complete ===");
    return;
  }

  currentProgress = { ...currentProgress!, stage: "done" };
  console.log("\n=== Stage 1 (extraction) complete ===\n");
  console.log("Run --vocabulary for Stage 3, then --dedup for Stage 4 cross-source matching.");
}

export async function normalizeVocabularyStage(): Promise<void> {
  const outDir = path.join(process.cwd(), "output", "normalized");
  const vocabPath = path.join(process.cwd(), "output", "vocabulary.json");
  const allSources = ["improwiki", "learnimprov", "ircwiki"];
  const allElements: NormalizedElement[] = [];

  console.log("=== VOCABULARY NORMALIZATION ===\n");

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
    console.log("\nNo normalized elements found. Run Stage 1+2 first.");
    return;
  }

  const { normalizeVocabulary: clusterVocab, applyCanonicalTerms } = await import("./vocabulary");
  const vocab = await clusterVocab(allElements);

  await Bun.write(vocabPath, JSON.stringify(vocab, null, 2));
  console.log(`\nWrote ${vocabPath}`);

  // Write back canonical terms to each source file
  for (const source of allSources) {
    const srcPath = path.join(outDir, `${source}.json`);
    const f = Bun.file(srcPath);
    if (!(await f.exists())) continue;

    const data = await f.json();
    const updated = applyCanonicalTerms(data.elements, vocab);
    data.elements = updated;

    const parsed = normalizedSourceSchema.safeParse(data);
    await Bun.write(srcPath, JSON.stringify(parsed.success ? parsed.data : data, null, 2));

    const changedCount = updated.filter((e: NormalizedElement) =>
      e.normalized.mechanics.some(m => m.originalName) ||
      e.normalized.skills.some(s => s.originalName),
    ).length;
    console.log(`  Updated ${source}: ${changedCount}/${updated.length} elements canonicalized`);
  }

  console.log("\n=== Vocabulary normalization complete ===");
}

export async function dedupElementsStage(): Promise<void> {
  const { dedupElements } = await import("./element-dedup");
  await dedupElements();
}

export async function deriveGraphStage(): Promise<void> {
  console.log("=== GRAPH DERIVATION ===\n");
  const { writeGraph } = await import("../graph/derive");
  await writeGraph();
  console.log("\n=== Graph derivation complete ===");
}

// Allow running directly: bun run src/normalize/normalize.ts
if (import.meta.main) {
  const args = process.argv.slice(2);
  const maxElements = process.env.NORMALIZE_MAX ? parseInt(process.env.NORMALIZE_MAX) : undefined;

  if (args.includes("--vocabulary")) {
    normalizeVocabularyStage().catch((err) => {
      console.error("Vocabulary normalization failed:", err);
      process.exit(1);
    });
  } else if (args.includes("--dedup")) {
    dedupElementsStage().catch((err) => {
      console.error("Dedup failed:", err);
      process.exit(1);
    });
  } else if (args.includes("--graph")) {
    deriveGraphStage().catch((err) => {
      console.error("Graph derivation failed:", err);
      process.exit(1);
    });
  } else {
    normalizeAll({ maxElements }).catch((err) => {
      console.error("Normalization failed:", err);
      process.exit(1);
    });
  }
}
