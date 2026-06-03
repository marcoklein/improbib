import fs from "node:fs/promises";
import path from "path";
import { processImprowikiEntryPage } from "./scraping/improwiki/process-improwiki-entry-page";
import { followTranslationLinksOfElement } from "./scraping/improwiki/follow-translation-links";
import type { ElementType } from "./scraping/shared/element-type";
import { fetchAndCacheWebsite } from "./scraping/shared/fetch-and-cache-website";
import { loadExistingElements } from "./scraping/shared/load-existing-elements";
import { mergeElements } from "./scraping/shared/merge-elements";
import {
  buildSitemapMap,
  parseSitemapXml,
} from "./scraping/shared/sitemap";

const SITEMAP_INDEX_URL = "https://improwiki.com/sitemap.xml";

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

export async function scrapeImprowiki(
  options?: { maxPagesPerListing?: number }
) {
  const { elements: existingElements, urlMap } =
    await loadExistingElements("improwiki");

  console.log(`Loaded ${existingElements.length} existing elements`);

  const sitemap = new Map<string, string | null>();

  try {
    const sitemapIndexPage = await fetchAndCacheWebsite(SITEMAP_INDEX_URL);
    const sitemapIndexEntries = parseSitemapXml(sitemapIndexPage.html);

    const languageSitemaps = sitemapIndexEntries
      .filter((e) => e.loc.includes("sitemap-de.") || e.loc.includes("sitemap-en."))
      .map((e) => e.loc);

    for (const sitemapUrl of languageSitemaps) {
      try {
        const sitemapPage = await fetchAndCacheWebsite(sitemapUrl);
        const entries = parseSitemapXml(sitemapPage.html);
        const sitemapMap = buildSitemapMap(entries);
        for (const [key, value] of sitemapMap) {
          if (!sitemap.has(key)) {
            sitemap.set(key, value);
          }
        }
      } catch {
        console.warn(`Failed to fetch sitemap: ${sitemapUrl}`);
      }
    }
    console.log(`Loaded sitemap with ${sitemap.size} entries`);
  } catch {
    console.warn("Failed to fetch sitemap index, will fetch all pages");
  }

  const entryPages = [
    ...[
      { url: "https://improwiki.com/de/spiele", addTags: ["game"] },
      { url: "https://improwiki.com/de/aufwaermspiele", addTags: ["warmup"] },
      {
        url: "https://improwiki.com/de/kennenlernspiele",
        addTags: ["warmup", "icebreaker"],
      },
      { url: "https://improwiki.com/de/uebungen", addTags: ["exercise"] },
      {
        url: "https://improwiki.com/de/wiki/improtheater/special/category/108/showformen",
        addTags: ["show"],
      },
      {
        url: "https://improwiki.com/de/wiki/improtheater/special/category/59/langformen",
        addTags: ["show", "longform"],
      },
    ],
    ...[
      { url: "https://improwiki.com/en/improv-games", addTags: ["game"] },
      {
        url: "https://improwiki.com/en/improv-exercises",
        addTags: ["exercise"],
      },
      { url: "https://improwiki.com/en/warm-ups", addTags: ["warmup"] },
      {
        url: "https://improwiki.com/en/category/icebreaker-games",
        addTags: ["warmup", "icebreaker"],
      },
      {
        url: "https://improwiki.com/en/wiki/improv/special/category/106/improv-forms",
        addTags: ["show", "longform"],
      },
    ],
  ];

  const baseUrl = "https://improwiki.com";
  let elements: ElementType[] = [...existingElements];

  for (const entryPage of entryPages) {
    console.log(`Processing entry page: ${entryPage.url}`);
    const newElements = await processImprowikiEntryPage(
      baseUrl,
      entryPage.url,
      {
        shouldFetch: (url) => shouldFetch(url, urlMap, sitemap),
        maxPagesPerListing: options?.maxPagesPerListing,
      }
    );

    elements = [
      ...elements,
      ...newElements.map((element) => ({
        ...element,
        tags: [...new Set(element.tags.concat(entryPage.addTags))],
      })),
    ];

    console.log(
      `  ${newElements.length} new elements from ${entryPage.url}`
    );
  }

  console.log(`Total elements before merge: ${elements.length}`);

  const output: { meta: Record<string, any>; elements: ElementType[] } = {
    meta: {},
    elements,
  };

  mergeElements(output);
  await followTranslationLinksOfElement(baseUrl, output);
  mergeElements(output);

  output.meta.inventory = {
    elementCount: output.elements.length,
    elementCountEn: output.elements.filter((e) => e.languageCode === "en")
      .length,
    elementCountDe: output.elements.filter((e) => e.languageCode === "de")
      .length,
    newFetched: output.elements.length - existingElements.length,
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

  const outputFile = path.join(rawDir, "improwiki.json");
  await fs.writeFile(outputFile, JSON.stringify(output, null, 2), "utf-8");
  console.log(`Raw elements written to ${outputFile}`);

  return output;
}
