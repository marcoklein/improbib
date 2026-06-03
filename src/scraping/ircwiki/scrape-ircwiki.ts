import fs from "node:fs/promises";
import path from "path";
import type { ElementType } from "../shared/element-type";
import { loadExistingElements } from "../shared/load-existing-elements";
import { mergeElements } from "../shared/merge-elements";
import { processIrcWikiCategoryPage } from "./process-ircwiki-category-page";
import { processIrcWikiPage } from "./process-ircwiki-page";

const BASE_URL = "https://wiki.improvresourcecenter.com";

function resolveUrl(href: string): string {
  if (href.startsWith("http")) return href;
  return BASE_URL + href;
}

export async function scrapeIrcWiki(options?: { maxPagesPerListing?: number }) {
  const { elements: existingElements, urlMap } =
    await loadExistingElements("ircwiki");

  console.log(`Loaded ${existingElements.length} existing elements`);

  const listingPages = [
    {
      url: `${BASE_URL}/index.php?title=Category:Improv_Forms`,
      addTags: ["Improv Form"],
    },
    {
      url: `${BASE_URL}/index.php?title=Category:Concepts`,
      addTags: ["Concept"],
    },
    {
      url: `${BASE_URL}/index.php?title=Category:Openings`,
      addTags: ["Opening"],
    },
    {
      url: `${BASE_URL}/index.php?title=Category:Editing_Techniques`,
      addTags: ["Editing Technique"],
    },
    {
      url: `${BASE_URL}/index.php?title=Category:Exercises`,
      addTags: ["Exercise"],
    },
    {
      url: `${BASE_URL}/index.php?title=Category:Improv_Games`,
      addTags: ["Improv Game"],
    },
  ];

  let newElements: ElementType[] = [];

  for (const listingPage of listingPages) {
    console.log(`Processing listing page: ${listingPage.url}`);
    const relativeUrls = await processIrcWikiCategoryPage(listingPage.url);
    console.log(`Found ${relativeUrls.length} pages`);

    const toFetch: string[] = [];
    let skipped = 0;
    for (const relativeUrl of relativeUrls) {
      const postUrl = resolveUrl(relativeUrl);
      if (urlMap.has(postUrl)) {
        skipped++;
      } else {
        toFetch.push(postUrl);
      }
    }

    console.log(
      `  Fetching ${toFetch.length} new, skipping ${skipped} existing`
    );

    if (toFetch.length === 0) continue;

    const urls = options?.maxPagesPerListing
      ? toFetch.slice(0, options.maxPagesPerListing)
      : toFetch;

    let fetched = 0;

    for (const postUrl of urls) {
      const element = await processIrcWikiPage(postUrl, listingPage.addTags);
      if (element) {
        newElements.push(element);
      }
      fetched++;
      if (fetched % 5 === 0 || fetched === urls.length) {
        console.log(`  Progress: ${fetched}/${urls.length} pages`);
      }
    }
  }

  console.log(`New elements fetched: ${newElements.length}`);
  console.log(`Reusing ${existingElements.length} existing elements`);

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

  const outputFile = path.join(rawDir, "ircwiki.json");
  await fs.writeFile(outputFile, JSON.stringify(output, null, 2), "utf-8");
  console.log(`Raw elements written to ${outputFile}`);

  return output;
}
