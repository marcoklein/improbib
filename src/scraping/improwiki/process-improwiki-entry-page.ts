import { load } from "cheerio";
import { appLogger } from "../../logger";
import type { ElementType } from "../shared/element-type";
import { fetchAndCacheWebsite } from "../shared/fetch-and-cache-website";
import { processImprowikiPage } from "./process-improwiki-page";

export async function processImprowikiEntryPage(baseUrl: string, url: string) {
  const logger = appLogger.getChild("processImprowikiEntryPage");
  const entryPage = await fetchAndCacheWebsite(url);
  logger.info(`Processing entry page ${entryPage.url}`);

  const $ = load(entryPage.html);

  const elementUrls = $(".startpage > .container")
    .find("a")
    .map((_, el) => $(el).attr("href"))
    .toArray()
    .map((url) => new URL(url, baseUrl).href);

  const elements: ElementType[] = [];

  for (const originalUrl of elementUrls) {
    const result = await processImprowikiPage(baseUrl, originalUrl);
    if (result) {
      elements.push(result);
    }
  }

  return elements;
}
