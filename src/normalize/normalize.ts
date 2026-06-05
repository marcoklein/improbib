import path from "path";
import { createHash } from "crypto";
import { mkdir } from "node:fs/promises";
import type { NormalizedElement } from "./normalized-schema";
import { normalizedSourceSchema, getNormalizedBy } from "./normalized-schema";
import { createOpencodeGoClient, getPromptHash } from "./llm-client";
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
): Promise<{ elements: NormalizedElement[]; anyElementChanged: boolean }> {
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

  console.log(`Finished ${sourceName}: ${normalized.length} elements, ${derivedCount} derived, ${splitCount} split, ${cached} cached, ${errors} errors, ${totalTime}s`);
  return { elements: finalOutput.elements, anyElementChanged };
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

  const promptHash = getPromptHash();
  const statePath = path.join(process.cwd(), "output", ".normalize-state.json");

  // Read previous state
  let state: { promptHash?: string; stage2?: { inputHash: string; completedAt: string }; stage3?: { termsHash: string; completedAt: string } } = {};
  try {
    const sf = Bun.file(statePath);
    if (await sf.exists()) {
      state = await sf.json();
    }
  } catch { /* missing or corrupt — start fresh */ }

  async function writeState() {
    await Bun.write(statePath, JSON.stringify({ ...state, promptHash }, null, 2));
  }

  if (options?.maxElements || options?.stages?.includes(1) && options.stages.length === 1) {
    console.log(`\nSubset/stage-1-only mode — skipping Stages 2 & 3.`);
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

  const candidatesSorted = [...allCandidates].sort((a, b) => a.identifier.localeCompare(b.identifier));
  const stage2InputHash = createHash("md5").update(JSON.stringify(candidatesSorted.map(c => ({ id: c.identifier, name: c.name })))).digest("hex");

  const skipStage2 = !anyElementChanged && state.stage2?.inputHash === stage2InputHash;
  if (skipStage2) {
    console.log(`  Input hash unchanged (${stage2InputHash.slice(0, 8)}) — skipping LLM batches.`);
  } else {
    console.log(`  Input hash: ${stage2InputHash.slice(0, 8)}${state.stage2?.inputHash ? ` (was ${state.stage2.inputHash.slice(0, 8)})` : " (first run)"}${anyElementChanged ? " — anyElementChanged" : ""}`);
  }

  const translationPairs = seedTranslationPairs(allWithTranslation as any);
  console.log(`Seeded ${translationPairs.length} translation-link pairs`);

  let related: Map<string, { identifier: string; confidence: number }[]> = new Map();
  if (!skipStage2) {
    related = await buildRelatedIdentifiers(allCandidates, client, translationPairs);
    state.stage2 = { inputHash: stage2InputHash, completedAt: new Date().toISOString() };
    await writeState();
  }

  const outDir = path.join(process.cwd(), "output", "normalized");
  if (!skipStage2) {
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
  }

  console.log("\n=== STAGE 3: Vocabulary Normalization ===\n");

  const allNormalized: NormalizedElement[] = [];
  for (const elements of allElements.values()) {
    allNormalized.push(...elements);
  }

  // Compute terms hash for caching — use original names to avoid hash drift from canonicalization
  const allMechSet = new Set<string>();
  const allSkillSet = new Set<string>();
  for (const el of allNormalized) {
    for (const m of el.normalized.mechanics) {
      const name = m.originalName || m.name;
      if (name) allMechSet.add(name.toLowerCase());
    }
    for (const s of el.normalized.skills) {
      const name = s.originalName || s.name;
      if (name) allSkillSet.add(name.toLowerCase());
    }
  }
  const allMech = [...allMechSet].sort();
  const allSkill = [...allSkillSet].sort();
  const stage3TermsHash = createHash("md5").update(JSON.stringify({ mechanics: allMech, skills: allSkill })).digest("hex");

  const vocabExists = await Bun.file(path.join(outDir, "..", "vocabulary.json")).exists();
  const skipStage3 = !anyElementChanged && state.stage3?.termsHash === stage3TermsHash && vocabExists;

  if (skipStage3) {
    console.log(`  Terms hash unchanged (${stage3TermsHash.slice(0, 8)}) — skipping vocabulary normalization.`);
    currentProgress = { ...currentProgress!, stage: "done" };
    console.log("\n=== Normalization complete ===");
    return;
  }

  console.log(`  Terms hash: ${stage3TermsHash.slice(0, 8)}${state.stage3?.termsHash ? ` (was ${state.stage3.termsHash.slice(0, 8)})` : " (first run)"}${anyElementChanged ? " — anyElementChanged" : ""} (${allMech.length} mechanics, ${allSkill.length} skills)`);

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

  state.stage3 = { termsHash: stage3TermsHash, completedAt: new Date().toISOString() };
  await writeState();

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
