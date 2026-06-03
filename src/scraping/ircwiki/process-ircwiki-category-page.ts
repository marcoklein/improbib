import { load } from "cheerio";
import { fetchAndCacheWebsite } from "../shared/fetch-and-cache-website";

const DELAY_MS = 10000;

export async function processIrcWikiCategoryPage(url: string) {
  const page = await fetchAndCacheWebsite(url, { delayMs: DELAY_MS });
  const $ = load(page.html);

  const postUrls = $("#mw-pages a")
    .map((_, el) => $(el).attr("href"))
    .toArray()
    .filter((href): href is string => !!href);

  return postUrls;
}
