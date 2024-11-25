import {
  ansiColorFormatter,
  configure,
  getConsoleSink,
  getFileSink,
} from "@logtape/logtape";
import fs from "node:fs/promises";
import path from "path";
import { processImprowikiEntryPage } from "./improwiki/process-improwiki-page";
import { resolveTranslationLinks } from "./improwiki/resolve-translation-links";
import { mergeEntities } from "./merge-entities";

await configure({
  sinks: {
    console: getConsoleSink({ formatter: ansiColorFormatter }),
    file: getFileSink("app.log"),
  },
  loggers: [
    {
      category: "app",
      level: "debug",
      sinks: ["console", "file"],
    },
  ],
});

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
      addTags: ["warmup"],
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
      addTags: ["longform"],
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
      addTags: ["warmup"],
    },
    {
      url: "https://improwiki.com/en/wiki/improv/special/category/106/improv-forms",
      addTags: ["show", "longform"],
    },
  ],
];

export type ElementType = {
  /**
   * Url of the element that it got fetched from.
   */
  url: string;
  tags: string[];
  identifier: string;
  name: string;
  sourceName: string;
  languageCode: string;
  translationLinkEn?: string;
  translationLinkDe?: string;
} & Record<string, string | string[] | undefined>;

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

const mergedElements: Record<string, ElementType> = {};

for (const element of elements) {
  const key = element.identifier;
  if (mergedElements[key]) {
    console.log(`Duplicated element: ${element.name}. Merging elements...`);
    console.log(
      `Existing element ${mergedElements[key].name} (${mergedElements[key].url})`
    );
    console.log(`New element ${element.name} (${element.url})`);
    const existingElement = mergedElements[key];
    mergedElements[key] = mergeEntities(existingElement, element);
  } else {
    mergedElements[key] = element;
  }
}

// consistency check
const names = new Set<string>();
for (const element of Object.values(mergedElements)) {
  if (names.has(`${element.languageCode} --- ${element.name}`)) {
    console.error(`Duplicate name: ${element.name}`);
    // throw new Error("Duplicate name");
  } else {
    names.add(`${element.languageCode} --- ${element.name}`);
  }
}

// resolve translationLinkEn

const resolvedElements = await resolveTranslationLinks(
  Object.values(mergedElements)
);

const outputDir = path.join(process.cwd(), "output");
const outputFile = path.join(outputDir, "elements.json");

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  outputFile,
  JSON.stringify(resolvedElements, null, 2),
  "utf-8"
);

console.log(`Elements have been written to ${outputFile}`);
