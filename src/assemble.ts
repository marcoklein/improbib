import fs from "node:fs/promises";
import path from "path";
import type { ElementType } from "./scraping/shared/element-type";
import { mergeElements } from "./scraping/shared/merge-elements";
import { convertHtmlToMarkdown } from "./scraping/shared/process-markdown";
import {
  transformAndTranslateTags,
} from "./scraping/shared/transform-and-translate-tags";
import { improbibSchema } from "./validation/improbib-schema";

const SOURCES = ["improwiki", "learnimprov", "ircwiki"] as const;

async function loadRawJson(
  sourceName: string
): Promise<{ meta: Record<string, any>; elements: ElementType[] }> {
  const rawFile = path.join(
    process.cwd(),
    "output",
    "raw",
    `${sourceName}.json`
  );
  try {
    const raw = JSON.parse(await fs.readFile(rawFile, "utf-8"));
    return { meta: raw.meta || {}, elements: raw.elements || [] };
  } catch {
    console.warn(`Raw file not found for ${sourceName}, skipping`);
    return { meta: {}, elements: [] };
  }
}

export async function assemble() {
  const allOutputs: {
    meta: Record<string, any>;
    elements: ElementType[];
  } = { meta: {}, elements: [] };

  for (const source of SOURCES) {
    const { meta, elements } = await loadRawJson(source);
    console.log(
      `Loaded ${elements.length} elements from ${source}`
    );
    allOutputs.elements.push(...elements);
    Object.assign(allOutputs.meta, meta);
  }

  console.log(
    `Total elements before merge: ${allOutputs.elements.length}`
  );

  mergeElements(allOutputs);

  console.log(
    `Total elements after merge: ${allOutputs.elements.length}`
  );

  convertHtmlToMarkdown(allOutputs.elements);

  // learnimprov stores WordPress categories and post tags separately (ADR-0004);
  // this is the processing step that decides to use them as tags.
  for (const element of allOutputs.elements) {
    if (element.sourceName !== "learnimprov") continue;
    const taxonomy = [
      ...((element.categories as string[] | undefined) ?? []),
      ...((element.postTags as string[] | undefined) ?? []),
    ];
    if (taxonomy.length === 0) continue;
    element.tags = [...new Set([...(element.tags ?? []), ...taxonomy])];
  }

  transformAndTranslateTags(allOutputs);

  let dropped = 0;
  allOutputs.elements = allOutputs.elements.filter((e) => {
    const markdownLen = (e.markdown as string)?.length ?? 0;
    if (markdownLen < 10) {
      console.warn(
        `Dropping element ${e.name}: markdown=${markdownLen} chars`
      );
      dropped++;
      return false;
    }
    return true;
  });
  if (dropped) console.log(`Dropped ${dropped} elements with insufficient content`);

  for (const e of allOutputs.elements) {
    const md = e.markdown as string;
    if (md.length > 10000) {
      e.markdown = md.slice(0, 10000);
    }
  }

  allOutputs.meta.assembly = {
    sourceCounts: SOURCES.reduce(
      (acc, source) => {
        acc[source] = allOutputs.elements.filter(
          (e) => e.sourceName === source
        ).length;
        return acc;
      },
      {} as Record<string, number>
    ),
    totalElements: allOutputs.elements.length,
  };

  // Never publish invalid output: an over-cap or broken element used to be
  // logged and written anyway, which is how a 1265-element file ended up in
  // production while the schema only allowed 1000.
  const parsed = improbibSchema.parse(allOutputs);
  console.log("Schema validation passed");

  const outputDir = path.join(process.cwd(), "output");
  await fs.mkdir(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, "improbib.json");
  await fs.writeFile(outputFile, JSON.stringify(allOutputs, null, 2), "utf-8");
  console.log(`Wrote ${outputFile}`);

  return { ...parsed, meta: allOutputs.meta };
}
