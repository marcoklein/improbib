import { load } from "cheerio";
import { appLogger } from "../../logger";
import { fetchAndCacheWebsite } from "../shared/fetch-and-cache-website";
import type { ElementType } from "../shared/element-type";

const DELAY_MS = 10000;

function parseLastModified(text: string): string | undefined {
  const match = text.match(
    /on (\d{1,2})\s+(\w+)\s+(\d{4}),\s+at\s+(\d{2}):(\d{2})/
  );
  if (match) {
    const [, day, month, year, hour, minute] = match;
    return new Date(`${month} ${day}, ${year} ${hour}:${minute}:00 UTC`).toISOString();
  }
  return undefined;
}

export async function processIrcWikiPage(
  url: string,
  addTags: string[]
): Promise<ElementType | undefined> {
  const logger = appLogger.getChild("processIrcWikiPage");
  logger.debug(`Fetching ${url}`);
  const page = await fetchAndCacheWebsite(url, { delayMs: DELAY_MS });
  const $ = load(page.html);

  const title = $("#firstHeading").first().text().trim();
  if (!title) {
    logger.debug(`No title found in: ${url}`);
    return undefined;
  }

  const htmlContent = $("#mw-content-text").html() ?? "";

  const categories = $("#catlinks #mw-normal-catlinks ul li a")
    .map((_, el) => $(el).text().trim())
    .toArray()
    .filter((cat) => cat && cat !== "All");

  const lastModifiedText = $("#footer li#lastmod").text().trim();
  const lastModified = parseLastModified(lastModifiedText);

  const tags = [...addTags, ...categories];

  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(`element;${title};${url}`);
  logger.debug(`Hashing ${title} ${url}`);
  const identifier = hasher.digest("hex");

  const sourceName = "ircwiki";
  const license = {
    licenseName: "GNU Free Documentation License 1.2",
    licenseSpdxIdentifier: "GFDL-1.2",
    licenseUrl: "https://www.gnu.org/copyleft/fdl.html",
  };

  return {
    identifier,
    url,
    name: title,
    tags,
    categories,
    languageCode: "en",
    sourceName,
    htmlContent,
    fetchedAt: page.date.toISOString(),
    lastModified,
    ...license,
  };
}
