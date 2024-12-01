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
  const elementUrl = page.url; // url might differ from originalUrl due to redirects
  const $ = load(page.html);
  if ($(".wikipage").length !== 1) {
    // expected for all none-game websites
    logger.debug(`No .wikipage found in: ${elementUrl}`);
    return undefined;
  }

  logger.debug(`Processing ${elementUrl}`);

  // parse html information
  const title = $(".wikipage .container h1").first().text().trim();
  const htmlContent = $(".wikipage .wikiarticle .row .col-lg-9").html() ?? "";
  // ensure links are absolute
  $(".wikipage .wikiarticle .row .col-lg-9 a").each((_, el) => {
    const url = $(el).attr("href");
    if (url) {
      const newUrl = new URL(url, baseUrl).href;
      $(el).attr("href", newUrl);
    }
  });
  const linksInHtmlContent = $(".wikipage .wikiarticle .row .col-lg-9 a")
    .map((_, el) => $(el).attr("href"))
    .toArray();

  const elementName = title?.replaceAll("#", "").trim();

  const tags = $(".wikipage .text-left a")
    .map((_, element) => $(element).text().trim())
    .toArray()
    .filter((text) => text.includes("#"))
    .map((text) => text.replaceAll("#", "").trim());

  const lastUpdate = $("small").text().split(":")[1].split("by")[0].trim();

  const translationLinkEn = $("li:contains('englische Version')")
    .find("a")
    .attr("href");

  const translationLinkDe = $("li:contains('german version')")
    .find("a")
    .attr("href");

  const cardFields: Record<string, string> = {};
  $(".card-body dl.row dt").each(function () {
    const key = "card_" + $(this).text().trim();
    const value = $(this).next("dd").text().trim();
    cardFields[key] = value;
  });

  // add context information
  const hasher = new Bun.CryptoHasher("md5");

  // from improbib
  hasher.update(`element;${elementName};${elementUrl}`);
  logger.debug(`Hashing ${elementName} ${elementUrl}`);
  if (!elementUrl) {
    logger.error(`No elementUrl for ${elementName}`);
    throw new Error(`No elementUrl for ${elementName}`);
  }

  const identifier = hasher.digest("hex");
  const languageCode = elementUrl.includes("/en/") ? "en" : "de";

  // add license
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
    translationLinkEn,
    translationLinkDe,
    languageCode,
    sourceName,
    linksInHtmlContent,
    htmlContent: htmlContent,
    ...(languageCode === "en" ? licenseEn : licenseDe),
    ...cardFields,
  };
  return element;
}
