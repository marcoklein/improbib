import { load } from "cheerio";
import { appLogger } from "../../logger";
import type { ElementType } from "../shared/element-type";
import { fetchAndCacheWebsite } from "../shared/fetch-and-cache-website";
import { processImprowikiPage } from "./process-improwiki-page";

export async function processImprowikiEntryPage(
  baseUrl: string,
  url: string,
  shouldFetch?: (url: string) => Promise<boolean>
) {
  const logger = appLogger.getChild("processImprowikiEntryPage");
  const entryPage = await fetchAndCacheWebsite(url);
  logger.info(`Processing entry page ${entryPage.url}`);

  const $ = load(entryPage.html);

  const elementUrls = $("main a[href*='/wiki/']")
    .filter((_, el) => $(el).find("h3").length > 0)
    .map((_, el) => $(el).attr("href"))
    .toArray()
    .filter((href): href is string => !!href)
    .map((href) => new URL(href, baseUrl).href);

  let toFetch: string[] = elementUrls;
  let skipped = 0;

  if (shouldFetch) {
    const results = await Promise.all(
      elementUrls.map(async (u) => ({ url: u, fetch: await shouldFetch(u) }))
    );
    toFetch = results.filter((r) => r.fetch).map((r) => r.url);
    skipped = results.length - toFetch.length;
    logger.info(
      `  ${toFetch.length} new/changed, ${skipped} unchanged`
    );
  }

  const startTime = Date.now();
  const elements: ElementType[] = [];
  let fetched = 0;

  for (const originalUrl of toFetch) {
    const result = await processImprowikiPage(baseUrl, originalUrl);
    if (result) {
      elements.push(result);
    }
    fetched++;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = fetched / (elapsed / 60);
    if (fetched % 10 === 0 || fetched === toFetch.length) {
      logger.info(
        `Progress: ${fetched}/${toFetch.length} pages (${Math.round(rate)}/min)`
      );
    }
  }

  return elements;
}
