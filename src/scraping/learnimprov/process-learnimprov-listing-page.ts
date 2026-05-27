import { load } from "cheerio";
import { fetchAndCacheWebsite } from "../shared/fetch-and-cache-website";

export async function processLearnImprovListingPage(url: string) {
  const page = await fetchAndCacheWebsite(url);
  const $ = load(page.html);

  const postUrls = $("ul.lcp_catlist a")
    .map((_, el) => $(el).attr("href"))
    .toArray()
    .filter((href): href is string => !!href);

  return postUrls;
}
