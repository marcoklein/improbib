import { load } from "cheerio";
import { appLogger } from "../../logger";
import type { ElementType } from "../shared/element-type";
import { fetchAndCacheWebsite } from "../shared/fetch-and-cache-website";

/** Sidebar headings that are UI affordances, not element data. */
const UI_HEADINGS =
  /badge|karte|^card$|textlink|text link|was möchtest du|verlink uns|gruppe folgen|community/i;

export interface ImprowikiPageInput {
  baseUrl: string;
  elementUrl: string;
  html: string;
  fetchedAt: string;
}

/**
 * Parses a single improwiki element page.
 *
 * Kept pure (no fetching) so the page can be re-parsed from the HTTP cache
 * without touching the network.
 */
export function parseImprowikiPage({
  baseUrl,
  elementUrl,
  html,
  fetchedAt,
}: ImprowikiPageInput): ElementType | undefined {
  const logger = appLogger.getChild("parseImprowikiPage");
  const $ = load(html);

  const title = $("h1.font-comic").first().text().trim();
  if (!title) {
    logger.debug(`No title found in: ${elementUrl}`);
    return undefined;
  }

  const languageCode = elementUrl.includes("/en/") ? "en" : "de";

  const htmlContent = $(".article-content").html() ?? "";
  $(".article-content a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      $(el).attr("href", new URL(href, baseUrl).href);
    }
  });
  const linksInHtmlContent = $(".article-content a")
    .map((_, el) => $(el).attr("href"))
    .toArray();

  const elementName = title.replaceAll("#", "").trim();

  const tags: string[] = [];
  const categoriesLabel = languageCode === "en" ? "Categories" : "Kategorien";
  const categoriesEl = $(`h3:contains("${categoriesLabel}")`).first();
  if (categoriesEl.length) {
    categoriesEl.next().find("a").each((_, el) => {
      const label = $(el).text().trim();
      if (label) tags.push(label);
    });
  }

  const lastUpdateMatch = $.html().match(
    /(?:Zuletzt bearbeitet|Last edited)[^0-9]{0,80}(\d{2}\.\d{2}\.\d{4})/
  );
  const lastUpdate = lastUpdateMatch?.[1] ?? "";

  const translationLinkEn =
    $('link[rel="alternate"][hreflang="en"]').attr("href") || undefined;
  const translationLinkDe =
    $('link[rel="alternate"][hreflang="de"]').attr("href") || undefined;

  // All sidebar fields live in one <aside>; the heading's direct parent only
  // wraps the heading itself, which is why the old `.parent()` lookup lost
  // every value after the redesign.
  const cardFields: Record<string, string> = {};
  const sidebar = categoriesEl.closest("aside");
  if (sidebar.length) {
    sidebar.find("h3").each((_, el) => {
      const key = $(el).text().trim();
      if (!key || key === categoriesLabel || UI_HEADINGS.test(key)) return;

      const sibling = $(el).next();
      const value = sibling.is("p") || sibling.is("div")
        ? sibling.text().trim()
        : sibling.find("a").first().text().trim() || sibling.text().trim();
      if (!value) return;

      cardFields[`card_${key.replace(" of ", " ")}`] = value;
    });
  }

  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(`element;${elementName};${elementUrl}`);
  const identifier = hasher.digest("hex");

  const license =
    languageCode === "en"
      ? {
          licenseName: "CC BY-SA 3.0 DE",
          licenseSpdxIdentifier: "CC-BY-SA-3.0-DE",
          licenseUrl: "https://improwiki.com/en/lizenz",
        }
      : {
          licenseName: "CC BY-SA 3.0 DE",
          licenseSpdxIdentifier: "CC-BY-SA-3.0-DE",
          licenseUrl: "https://improwiki.com/de/lizenz",
        };

  return {
    type: "element",
    identifier,
    url: elementUrl,
    name: elementName,
    tags: [...new Set(tags)],
    lastUpdate,
    translationLinkEn:
      translationLinkEn === elementUrl ? undefined : translationLinkEn,
    translationLinkDe:
      translationLinkDe === elementUrl ? undefined : translationLinkDe,
    languageCode,
    sourceName: "improwiki",
    linksInHtmlContent,
    htmlContent,
    fetchedAt,
    ...license,
    ...cardFields,
  };
}

export async function processImprowikiPage(
  baseUrl: string,
  originalUrl: string
) {
  const logger = appLogger.getChild("processImprowikiPage");
  logger.debug(`Fetching ${originalUrl}`);
  const page = await fetchAndCacheWebsite(originalUrl);
  logger.debug(`Processing ${page.url}`);

  return parseImprowikiPage({
    baseUrl,
    elementUrl: page.url,
    html: page.html,
    fetchedAt: page.date.toISOString(),
  });
}
