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

  transformAndTranslateTags(allOutputs);

  let dropped = 0;
  allOutputs.elements = allOutputs.elements.filter((e) => {
    const markdownLen = (e.markdown as string)?.length ?? 0;
    const tagIdsLen = (e.tagIds as string[])?.length ?? 0;
    if (markdownLen < 10 || tagIdsLen === 0) {
      console.warn(
        `Dropping element ${e.name}: markdown=${markdownLen} chars, tagIds=${tagIdsLen}`
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

  const result = improbibSchema.safeParse(allOutputs);
  if (!result.success) {
    console.error("Schema validation errors:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
  } else {
    console.log("Schema validation passed");
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

  const outputDir = path.join(process.cwd(), "output");
  await fs.mkdir(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, "improbib.json");
  await fs.writeFile(outputFile, JSON.stringify(allOutputs, null, 2), "utf-8");
  console.log(`Wrote ${outputFile}`);

  return allOutputs;
}
