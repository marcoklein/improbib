import fs from "node:fs/promises";
import path from "node:path";
import type { ElementType } from "../shared/element-type";
import { fetchAndCacheWebsite } from "../shared/fetch-and-cache-website";
import { mergeTranslationFields } from "./merge-translation-fields";
import { processImprowikiCardFields } from "./process-improwiki-card-fields";
import { parseImprowikiPage } from "./process-improwiki-page";

const BASE_URL = "https://improwiki.com";

export interface ReparseResult {
  total: number;
  reparsed: number;
  skipped: number;
  withPlayerCount: number;
}

/**
 * Re-parses every known improwiki element from the HTTP cache.
 *
 * Unlike a scrape this never needs the sitemap: the URLs are already in
 * `output/raw/improwiki.json`, and `fetchAndCacheWebsite` serves them from
 * `.cache`. That makes it safe to apply parser fixes to existing data without
 * hammering the source.
 *
 * The stored `htmlContent` is kept unchanged so the normalization cache
 * (`md5(htmlContent)`) still hits and no LLM calls are triggered.
 */
export async function reparseImprowiki(): Promise<ReparseResult> {
  const rawFile = path.join(process.cwd(), "output", "raw", "improwiki.json");
  const raw = JSON.parse(await fs.readFile(rawFile, "utf-8"));
  const elements: ElementType[] = raw.elements ?? [];

  const result: ReparseResult = {
    total: elements.length,
    reparsed: 0,
    skipped: 0,
    withPlayerCount: 0,
  };

  const updated: ElementType[] = [];
  for (const element of elements) {
    let page: Awaited<ReturnType<typeof fetchAndCacheWebsite>>;
    try {
      // Re-parse is offline by design: use the cached HTML regardless of age.
      page = await fetchAndCacheWebsite(element.url, {
        maxAgeMs: Number.POSITIVE_INFINITY,
      });
    } catch {
      result.skipped++;
      updated.push(element);
      continue;
    }

    const fresh = parseImprowikiPage({
      baseUrl: BASE_URL,
      elementUrl: element.url,
      html: page.html,
      fetchedAt: (element.fetchedAt as string) ?? page.date.toISOString(),
    });

    if (!fresh) {
      result.skipped++;
      updated.push(element);
      continue;
    }

    updated.push({
      ...element,
      ...fresh,
      // Keep identity and stored body stable: identifiers are used by Impromat
      // and htmlContent is the normalization cache key.
      identifier: element.identifier,
      url: element.url,
      htmlContent: element.htmlContent ?? fresh.htmlContent,
      htmlContentPath: element.htmlContentPath,
      fetchedAt: element.fetchedAt ?? fresh.fetchedAt,
      // Listing pages contributed `addTags` (game/exercise/show/…) that are
      // not on the element page itself; keep them while refreshing categories.
      tags: [...new Set([...(element.tags ?? []), ...(fresh.tags ?? [])])],
    });
    result.reparsed++;
  }

  const output = { meta: raw.meta ?? {}, elements: updated };
  await processImprowikiCardFields(output);
  mergeTranslationFields(output);
  output.elements.sort((a, b) => a.identifier.localeCompare(b.identifier));

  await fs.writeFile(
    rawFile,
    JSON.stringify(output, null, 2),
    "utf-8"
  );

  result.withPlayerCount = output.elements.filter(
    (element) => typeof element.playerCountMin === "number"
  ).length;

  return result;
}
