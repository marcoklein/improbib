import fs from "node:fs/promises";
import path from "path";
import type { ElementType } from "../shared/element-type";
import { fetchAndCacheWebsite } from "../shared/fetch-and-cache-website";
import { loadExistingElements } from "../shared/load-existing-elements";
import { mergeElements } from "../shared/merge-elements";
import {
  buildSitemapMap,
  parseSitemapXml,
} from "../shared/sitemap";
import { processLearnImprovListingPage } from "./process-learnimprov-listing-page";
import { processLearnImprovPost } from "./process-learnimprov-post";

const SITEMAP_URL = "https://www.learnimprov.com/wp-sitemap-posts-post-1.xml";

async function shouldFetch(
  url: string,
  existing: Map<string, ElementType>,
  sitemap: Map<string, string | null>
): Promise<boolean> {
  if (!existing.has(url)) return true;

  const sitemapLastmod = sitemap.get(url);
  if (!sitemapLastmod) return false;

  const existingLastmod = existing.get(url)!.fetchedAt as string;
  return sitemapLastmod > existingLastmod;
}

export async function scrapeLearnImprov(
  options?: { maxPagesPerListing?: number }
) {
  const { elements: existingElements, urlMap } =
    await loadExistingElements("learnimprov");

  console.log(`Loaded ${existingElements.length} existing elements`);

  const sitemapPage = await fetchAndCacheWebsite(SITEMAP_URL);
  const sitemapEntries = parseSitemapXml(sitemapPage.html);
  const sitemap = buildSitemapMap(sitemapEntries);
  console.log(`Loaded sitemap with ${sitemap.size} entries`);

  const listingPages = [
    { url: "https://www.learnimprov.com/warm-ups/", addTags: ["Warm-Up"] },
    { url: "https://www.learnimprov.com/exercises/", addTags: ["Exercise"] },
    { url: "https://www.learnimprov.com/handles/", addTags: ["Handle"] },
    { url: "https://www.learnimprov.com/long-forms/", addTags: ["Long Form"] },
    {
      url: "https://www.learnimprov.com/long-forms/show-forms/",
      addTags: ["Show"],
    },
    { url: "https://www.learnimprov.com/ask-fors/", addTags: ["Ask For"] },
  ];

  let newElements: ElementType[] = [];

  for (const listingPage of listingPages) {
    console.log(`Processing listing page: ${listingPage.url}`);
    const postUrls = await processLearnImprovListingPage(listingPage.url);
    console.log(`Found ${postUrls.length} posts`);

    const toFetch: string[] = [];
    let skipped = 0;
    for (const postUrl of postUrls) {
      if (await shouldFetch(postUrl, urlMap, sitemap)) {
        toFetch.push(postUrl);
      } else {
        skipped++;
      }
    }

    console.log(
      `  Fetching ${toFetch.length} new/changed, skipping ${skipped} unchanged`
    );

    if (toFetch.length === 0) continue;

    const urls = options?.maxPagesPerListing
      ? toFetch.slice(0, options.maxPagesPerListing)
      : toFetch;

    let fetched = 0;

    for (const postUrl of urls) {
      const element = await processLearnImprovPost(
        postUrl,
        listingPage.addTags
      );
      if (element) {
        newElements.push(element);
      }
      fetched++;
      if (fetched % 10 === 0 || fetched === urls.length) {
        console.log(`  Progress: ${fetched}/${urls.length} posts`);
      }
    }
  }

  console.log(`New elements fetched: ${newElements.length}`);
  console.log(
    `Reusing ${existingElements.length} existing elements`
  );

  const allElements = [...existingElements, ...newElements];

  const output: { meta: Record<string, any>; elements: ElementType[] } = {
    meta: {},
    elements: allElements,
  };

  mergeElements(output);

  console.log(`Total elements after merge: ${output.elements.length}`);

  output.meta.inventory = {
    elementCount: output.elements.length,
    newFetched: newElements.length,
    reused: existingElements.length,
  };

  const rawDir = path.join(process.cwd(), "output", "raw");
  const filesDir = path.join(rawDir, "files");
  await fs.mkdir(filesDir, { recursive: true });

  for (const element of output.elements) {
    if (!element.htmlContentPath) {
      const htmlFile = path.join(filesDir, `${element.identifier}.html`);
      await fs.writeFile(htmlFile, element.htmlContent as string, "utf-8");
      element.htmlContentPath = htmlFile;
    }
  }

  output.elements = output.elements.sort((a, b) =>
    a.identifier.localeCompare(b.identifier)
  );

  const outputFile = path.join(rawDir, "learnimprov.json");
  await fs.writeFile(outputFile, JSON.stringify(output, null, 2), "utf-8");
  console.log(`Raw elements written to ${outputFile}`);

  return output;
}
