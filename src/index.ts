import fs from "node:fs/promises";
import path from "path";
import type { ElementType } from "./element-type";
import { mergeTranslationFields } from "./improwiki/merge-translation-fields";
import { processImprowikiCardFields } from "./improwiki/process-improwiki-card.fields";
import { processImprowikiEntryPage } from "./improwiki/process-improwiki-page";
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

let elements: ElementType[] = [];
for (const entryPage of entryPages) {
  elements = [
    ...elements,
    ...(
      await processImprowikiEntryPage("https://improwiki.com", entryPage.url)
    ).map((element) => ({
      ...entryPage,
      ...element,
      tags: [...new Set(element.tags.concat(entryPage.addTags))],
    })),
  ];
}
console.log("finished reading elements");

const output: { meta: Record<string, any>; elements: ElementType[] } = {
  meta: {},
  elements,
};

mergeElements(output);
await resolveTranslationLinks(output);
await processImprowikiCardFields(output);
mergeElements(output);
mergeTranslationFields(output);
mergeElements(output);
transformAndTranslateTags(output);

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
const outputFile = path.join(outputDir, "elements.json");

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputFile, JSON.stringify(output, null, 2), "utf-8");

console.log(`Elements have been written to ${outputFile}`);
