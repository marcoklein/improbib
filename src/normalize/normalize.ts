import path from "path";
import { createHash } from "crypto";
import type { ElementType } from "../scraping/shared/element-type";
import { createOpencodeGoClient } from "./llm-client";
import { normalizedSourceSchema, type NormalizedElement } from "./normalized-schema";
import { buildRelatedIdentifiers } from "./cross-source-matching";

interface LoadResult {
  meta: Record<string, any>;
  elements: ElementType[];
}

async function loadRaw(sourceName: string): Promise<LoadResult> {
  const rawPath = path.join(process.cwd(), "output", "raw", `${sourceName}.json`);
  const f = Bun.file(rawPath);
  if (!(await f.exists())) {
    throw new Error(`Raw file not found: ${rawPath}. Run fetch-raw or scrape first.`);
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
  } catch { /* ignore corrupt previous file */ }
  return prev;
}

function hashContent(html: string): string {
  return createHash("md5").update(html).digest("hex");
}

export async function normalizeSource(sourceName: string, options?: { maxElements?: number }): Promise<void> {
  const { meta, elements: allElements } = await loadRaw(sourceName);
  const previous = await loadPreviousNormalized(sourceName);
  const client = createOpencodeGoClient();

  const elements = options?.maxElements
    ? allElements.slice(0, options.maxElements)
    : allElements;

  console.log(`Normalizing ${sourceName}: ${elements.length}${options?.maxElements ? ` of ${allElements.length}` : ""} elements`);

  const normalized: NormalizedElement[] = [];
  let skipped = 0;
  let extracted = 0;
  const startTime = Date.now();

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const contentHash = hashContent(el.htmlContent || "");

    // Skip unchanged elements
    const prev = previous.get(el.identifier);
    if (prev?.normalized?.contentHash === contentHash) {
      normalized.push(prev);
      skipped++;
      continue;
    }

    try {
      const result = await client.normalizeElement(
        el.name,
        el.htmlContent as string || "",
        el.languageCode,
      );

      // Promote variations with substantial descriptions to derived elements
      const derivedElements = result.variations
        .filter((v) => v.description.length > 40)
        .map((v) => ({
          name: v.name,
          description: v.description,
          parentIdentifier: el.identifier,
        }));

      const normalizedEl: NormalizedElement = {
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
          description: result.description,
          howToPlay: result.howToPlay,
          variations: result.variations,
          tips: result.tips,
          referencedElements: result.referencedElements,
          contentHash,
          extractedAt: new Date().toISOString(),
        },
        derivedElements,
      };

      normalized.push(normalizedEl);
      extracted++;

      if ((i + 1) % 10 === 0 || i === elements.length - 1) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = ((i + 1) / parseFloat(elapsed)).toFixed(1);
        console.log(`  [${i + 1}/${elements.length}] ${sourceName}: ${extracted} new, ${skipped} cached (${rate}/s, ${elapsed}s)`);
      }
    } catch (err: any) {
      console.warn(`  SKIP ${el.name}: ${err.message}`);
      // Keep previous if available, otherwise skip
      if (prev) normalized.push(prev);
      else skipped++;
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const derivedCount = normalized.reduce((s, e) => s + e.derivedElements.length, 0);

  const output = {
    meta: {
      sourceName,
      elementCount: normalized.length,
      derivedElementCount: derivedCount,
      normalizedAt: new Date().toISOString(),
    },
    elements: normalized,
  };

  // Validate
  const parsed = normalizedSourceSchema.safeParse(output);
  if (!parsed.success) {
    console.error(`Schema validation failed for ${sourceName}:`);
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
  }

  const outDir = path.join(process.cwd(), "output", "normalized");
  await Bun.write(path.join(outDir, `${sourceName}.json`), JSON.stringify(parsed.success ? parsed.data : output, null, 2));

  console.log(`Finished ${sourceName}: ${normalized.length} elements, ${derivedCount} derived, ${skipped} skipped, ${totalTime}s`);
}

export async function normalizeAll(): Promise<void> {
  const outDir = path.join(process.cwd(), "output", "normalized");
  const dir = Bun.file(outDir);
  if (!(await dir.exists())) {
    await Bun.$`mkdir -p ${outDir}`.quiet();
  }

  for (const source of ["improwiki", "learnimprov", "ircwiki"]) {
    try {
      await normalizeSource(source);
    } catch (err: any) {
      console.error(`Failed to normalize ${source}: ${err.message}`);
    }
  }

  // Cross-source matching: compute relatedIdentifiers across all sources
  console.log("\nComputing cross-source matches...");
  const allCandidates: { identifier: string; name: string; sourceName: string; languageCode: string }[] = [];

  for (const source of ["improwiki", "learnimprov", "ircwiki"]) {
    const f = Bun.file(path.join(outDir, `${source}.json`));
    if (!(await f.exists())) continue;
    const data = await f.json();
    for (const el of data.elements || []) {
      allCandidates.push({
        identifier: el.identifier,
        name: el.name,
        sourceName: el.sourceName,
        languageCode: el.languageCode,
      });
    }
  }

  const related = buildRelatedIdentifiers(allCandidates);
  const matchCount = [...related.values()].reduce((s, ids) => s + ids.length, 0) / 2;
  console.log(`Found ${matchCount} cross-source match pairs`);

  // Update each source file with relatedIdentifiers
  for (const source of ["improwiki", "learnimprov", "ircwiki"]) {
    const srcPath = path.join(outDir, `${source}.json`);
    const f = Bun.file(srcPath);
    if (!(await f.exists())) continue;
    const data = await f.json();
    for (const el of data.elements || []) {
      el.relatedIdentifiers = related.get(el.identifier) || [];
    }
    await Bun.write(srcPath, JSON.stringify(data, null, 2));
    console.log(`  Updated ${source} with cross-source references`);
  }
}
