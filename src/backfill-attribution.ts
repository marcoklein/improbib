import { mkdir } from "node:fs/promises";
import path from "node:path";

const storagePath = process.env.STORAGE_PATH || process.cwd();
await mkdir(storagePath, { recursive: true });
process.chdir(storagePath);

const { fetchAndCacheWebsite } = await import(
  "./scraping/shared/fetch-and-cache-website"
);
const { extractAttribution } = await import("./scraping/shared/attribution");

const SOURCES = ["improwiki", "learnimprov", "ircwiki"] as const;

/**
 * Fills `authors` and `lastModified` on every raw element from the full HTML in
 * `.cache`.
 *
 * The raw layer only keeps the article fragment (`htmlContent`), so the byline
 * and edit footer are not part of it. This pass reads the cached page instead
 * and never touches the network.
 */
async function main() {
  const stats = { total: 0, filled: 0, missingCache: 0, withoutAttribution: 0 };

  for (const source of SOURCES) {
    const rawPath = path.join(storagePath, "output", "raw", `${source}.json`);
    const file = Bun.file(rawPath);
    if (!(await file.exists())) {
      console.log(`[attribution] Skipping ${source}: ${rawPath} not found`);
      continue;
    }

    const raw = await file.json();
    const elements = raw.elements ?? [];
    let filled = 0;
    let missingCache = 0;
    let withoutAttribution = 0;

    for (const element of elements) {
      stats.total++;
      let html: string;
      try {
        const page = await fetchAndCacheWebsite(element.url, {
          maxAgeMs: Number.POSITIVE_INFINITY,
          offline: true,
        });
        html = page.html;
      } catch {
        missingCache++;
        stats.missingCache++;
        continue;
      }

      const attribution = extractAttribution(source, html);
      const changed =
        attribution.authors.length > 0 ||
        attribution.lastModified !== undefined;

      if (!changed) {
        withoutAttribution++;
        stats.withoutAttribution++;
        continue;
      }

      element.authors = attribution.authors;
      // Drop the field from older runs: editor names are personal data.
      delete element.lastEditedBy;
      if (attribution.lastModified) {
        element.lastModified = attribution.lastModified;
      }
      filled++;
      stats.filled++;
    }

    await Bun.write(rawPath, JSON.stringify(raw, null, 2));
    console.log(
      `[attribution] ${source}: ${filled}/${elements.length} enriched, ${missingCache} missing cache, ${withoutAttribution} without attribution`
    );
  }

  console.log(
    `[attribution] Done: ${stats.filled}/${stats.total} elements enriched, ${stats.missingCache} cache misses`
  );
}

await main();
