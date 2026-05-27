import { load } from "cheerio";
import { appLogger } from "../../logger";
import { fetchAndCacheWebsite } from "../shared/fetch-and-cache-website";

export async function processImprowikiPage(
  baseUrl: string,
  originalUrl: string
) {
  const logger = appLogger.getChild("processImprowikiPage");
  logger.debug(`Fetching ${originalUrl}`);
  const page = await fetchAndCacheWebsite(originalUrl);
  const elementUrl = page.url;
  const $ = load(page.html);

  const title = $("h1.font-comic").first().text().trim();
  if (!title) {
    logger.debug(`No title found in: ${elementUrl}`);
    return undefined;
  }

  logger.debug(`Processing ${elementUrl}`);

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

  const languageCode = elementUrl.includes("/en/") ? "en" : "de";

  const tags: string[] = [];
  const categoriesHeading =
    languageCode === "en" ? 'h3:contains("Categories")' : 'h3:contains("Kategorien")';
  const categoriesEl = $(categoriesHeading).first();
  if (categoriesEl.length) {
    const siblingDiv = categoriesEl.next();
    siblingDiv.find("a").each((_, el) => {
      tags.push($(el).text().trim());
    });
  }

  const lastUpdateEl = $(
    languageCode === "en"
      ? 'p:contains("Last edited")'
      : 'p:contains("Zuletzt bearbeitet")'
  ).first();
  let lastUpdate = "";
  if (lastUpdateEl.length) {
    const text = lastUpdateEl.text();
    const match = text.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (match) lastUpdate = match[1];
  }

  const currentUrl = elementUrl;
  const translationLinkEn =
    $('link[rel="alternate"][hreflang="en"]').attr("href") || undefined;
  const translationLinkDe =
    $('link[rel="alternate"][hreflang="de"]').attr("href") || undefined;

  const cardFields: Record<string, string> = {};
  const catHeading =
    languageCode === "en"
      ? $('h3:contains("Categories")').first()
      : $('h3:contains("Kategorien")').first();
  if (catHeading.length) {
    const sidebarCard = catHeading.parent();
    sidebarCard.find("h3").each(function () {
      let key = $(this).text().trim();
      if (key === "Kategorien" || key === "Categories") return;
      const sibling = $(this).next();
      const value =
        sibling.is("p") || sibling.is("div")
          ? sibling.text().trim()
          : sibling.find("a").first().text().trim() || sibling.text().trim();
      key = key.replace(" of ", " ");
      cardFields["card_" + key] = value;
    });
  }

  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(`element;${elementName};${elementUrl}`);
  logger.debug(`Hashing ${elementName} ${elementUrl}`);
  if (!elementUrl) {
    logger.error(`No elementUrl for ${elementName}`);
    throw new Error(`No elementUrl for ${elementName}`);
  }

  const identifier = hasher.digest("hex");

  const sourceName = "improwiki";
  const licenseEn = {
    licenseName: "CC BY-SA 3.0 DE",
    licenseSpdxIdentifier: "CC-BY-SA-3.0-DE",
    licenseUrl: "https://improwiki.com/en/lizenz",
  };
  const licenseDe = {
    licenseName: "CC BY-SA 3.0 DE",
    licenseSpdxIdentifier: "CC-BY-SA-3.0-DE",
    licenseUrl: "https://improwiki.com/de/lizenz",
  };

  const element = {
    type: "element",
    identifier,
    url: elementUrl,
    name: elementName,
    tags: [...new Set(tags)],
    lastUpdate,
    translationLinkEn:
      translationLinkEn === currentUrl ? undefined : translationLinkEn,
    translationLinkDe:
      translationLinkDe === currentUrl ? undefined : translationLinkDe,
    languageCode,
    sourceName,
    linksInHtmlContent,
    htmlContent: htmlContent,
    ...(languageCode === "en" ? licenseEn : licenseDe),
    ...cardFields,
  };
  return element;
}
