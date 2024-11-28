import fs from "node:fs/promises";
import path from "path";
import type { ElementType } from "./element-type";
import { mergeTranslationFields } from "./improwiki/merge-translation-fields";
import { processImprowikiCardFields } from "./improwiki/process-improwiki-card.fields";
import { processImprowikiEntryPage } from "./improwiki/process-improwiki-page";
import { processMarkdown } from "./improwiki/process-markdown";
import { resolveTranslationLinks } from "./improwiki/resolve-translation-links";
import { tagTranslations } from "./improwiki/tag-translations";
import { appLogger, initLogging } from "./logger";
import { mergeElements } from "./merge-elements";
import { tagTransformations } from "./tag-transformations";
import { transformAndTranslateTags } from "./transform-and-translate-tags";

await initLogging();

const entryPages = [
  ...[
    {
      url: "https://improwiki.com/de/spiele",
      addTags: ["game"],
    },
    {
      url: "https://improwiki.com/de/aufwaermspiele",
      addTags: ["warmup"],
    },
    {
      url: "https://improwiki.com/de/kennenlernspiele",
      addTags: ["warmup", "icebreaker"],
    },
    {
      url: "https://improwiki.com/de/uebungen",
      addTags: ["exercise"],
    },
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
    {
      url: "https://improwiki.com/en/improv-games",
      addTags: ["game"],
    },
    {
      url: "https://improwiki.com/en/improv-exercises",
      addTags: ["exercise"],
    },
    {
      url: "https://improwiki.com/en/warm-ups",
      addTags: ["warmup"],
    },
    {
      url: "https://improwiki.com/icebreaker-games",
      addTags: ["warmup", "icebreaker"],
    },
    {
      url: "https://improwiki.com/en/wiki/improv/special/category/106/improv-forms",
      addTags: ["show", "longform"],
    },
  ],
];

const baseUrl = "https://improwiki.com";
let elements: ElementType[] = [];
for (const entryPage of entryPages) {
  elements = [
    ...elements,
    ...(await processImprowikiEntryPage(baseUrl, entryPage.url)).map(
      (element) => ({
        ...entryPage,
        ...element,
        tags: [...new Set(element.tags.concat(entryPage.addTags))],
      })
    ),
  ];
}
console.log("finished reading elements");

const output: { meta: Record<string, any>; elements: ElementType[] } = {
  meta: {},
  elements,
};

mergeElements(output);
await resolveTranslationLinks(baseUrl, output);
await processImprowikiCardFields(output);
mergeElements(output);
mergeTranslationFields(output);
mergeElements(output);
transformAndTranslateTags(output);
await processMarkdown(output);

// consistency check
const names = new Set<string>();
for (const element of Object.values(output.elements)) {
  if (names.has(`${element.languageCode} --- ${element.name}`)) {
    console.error(`Duplicate name: ${element.name}`);
    throw new Error("Duplicate name");
  } else {
    names.add(`${element.languageCode} --- ${element.name}`);
  }
}

// collect all distinct tag names
const tagNames = [...new Set(output.elements.flatMap((e) => e.tags))];
output.meta.tagNames = tagNames;

const tagIds = [...new Set(output.elements.flatMap((e) => e.tagIds))];
output.meta.tagIds = tagIds;

// verify translations
const remainingTags = { ...tagTranslations };
for (const tagId of output.meta.tagIds) {
  if (!(tagTranslations as any)[tagId]) {
    appLogger.warn("Translation missing for tag: {tagId}", { tagId });
  } else {
    delete (remainingTags as any)[tagId];
  }
}
if (Object.keys(remainingTags).length) {
  appLogger.warn("Delete these unused tags in translation: {remainingTags}", {
    remainingTags,
  });
}

// verify transformations
const remainingTransformations = { ...tagTransformations };
for (const tag of tagNames) {
  if ((tagTransformations as any)[tag]) {
    delete (remainingTransformations as any)[tag];
  }
}
if (Object.keys(remainingTransformations).length) {
  appLogger.warn(
    "Delete these unused transformations: {remainingTransformations}",
    { remainingTransformations }
  );
}

// add final inventory to meta tag
output.meta.inventory = {
  elementCount: output.elements.length,
  tagCount: tagNames.length,
};

const outputDir = path.join(process.cwd(), "output");
await fs.mkdir(outputDir, { recursive: true });

// create processing directory
const processingDir = path.join(outputDir, "processing");
await fs.mkdir(processingDir, { recursive: true });
const headings: { name: string; count: number }[] = [];
const headingCounts: Record<string, number> = {};

appLogger.info("Processing elements");
for (const element of output.elements) {
  const markdownContent = element.markdown as string;
  const headingMatches = markdownContent.match(/^#+\s(.+)$/gm);
  if (headingMatches) {
    for (const heading of headingMatches) {
      const headingText = heading.replace(/^#+\s/, "").toLowerCase();
      headingCounts[headingText] = (headingCounts[headingText] || 0) + 1;
    }
    headings.push(
      ...headingMatches.map((heading) => {
        const headingText = heading.replace(/^#+\s/, "");
        return {
          name: headingText,
          count: headingCounts[headingText],
        };
      })
    );
  }
}

appLogger.info("Headings collected");

const sortedHeadings = Object.entries(headingCounts)
  .map(([name, count]) => ({ name, count }))
  .sort((a, b) => b.count - a.count)
  .map(({ name, count }) => `${name} (${count})`);

const headingsFile = path.join(processingDir, "headings.txt");
await fs.writeFile(headingsFile, sortedHeadings.join("\n"), "utf-8");

// extract html and markdown into separate files
for (const element of output.elements) {
  const filesDir = path.join(outputDir, "files");
  await fs.mkdir(filesDir, { recursive: true });
  const htmlFile = path.join(filesDir, `${element.identifier}.html`);
  const markdownFile = path.join(filesDir, `${element.identifier}.md`);
  await fs.writeFile(htmlFile, element.htmlContent as string, "utf-8");
  await fs.writeFile(markdownFile, element.markdown as string, "utf-8");
  element.htmlContentPath = htmlFile;
  element.markdownPath = markdownFile;
  element.html = "See htmlContentPath";
  element.markdown = "See markdownPath";
}

const outputFile = path.join(outputDir, "elements.json");

await fs.writeFile(outputFile, JSON.stringify(output, null, 2), "utf-8");

console.log(`Elements have been written to ${outputFile}`);
