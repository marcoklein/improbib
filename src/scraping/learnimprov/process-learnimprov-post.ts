import { load } from "cheerio";
import { appLogger } from "../../logger";
import { fetchAndCacheWebsite } from "../shared/fetch-and-cache-website";
import type { ElementType } from "../shared/element-type";

export async function processLearnImprovPost(
  url: string,
  addTags: string[]
): Promise<ElementType | undefined> {
  const logger = appLogger.getChild("processLearnImprovPost");
  logger.debug(`Fetching ${url}`);
  const page = await fetchAndCacheWebsite(url);
  const $ = load(page.html);

  const title = $("h1.entry-title").first().text().trim();
  if (!title) {
    logger.debug(`No title found in: ${url}`);
    return undefined;
  }

  const htmlContent = $(".entry-content").html() ?? "";

  const categories = $("footer.entry-meta a[rel='category tag']")
    .map((_, el) => $(el).text().trim())
    .toArray();

  const postTags = $("footer.entry-meta a[rel='tag']")
    .map((_, el) => $(el).text().trim())
    .toArray();

  const elementName = title.replaceAll("#", "").trim();

  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(`element;${elementName};${url}`);
  logger.debug(`Hashing ${elementName} ${url}`);
  const identifier = hasher.digest("hex");

  const sourceName = "learnimprov";
  const license = {
    licenseName: "CC BY-SA 4.0 International",
    licenseSpdxIdentifier: "CC-BY-SA-4.0",
    licenseUrl: "https://www.learnimprov.com/about/legal/",
  };

  return {
    identifier,
    url,
    name: elementName,
    tags: addTags,
    categories,
    postTags,
    languageCode: "en",
    sourceName,
    htmlContent,
    fetchedAt: page.date.toISOString(),
    ...license,
  };
}
