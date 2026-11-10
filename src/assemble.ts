import fs from "node:fs/promises";
import path from "path";
import { applyDedupOverrides, loadOverrides } from "./graph/overrides";
import type { Override } from "./graph/overrides";
import type { NormalizedElement } from "./normalize/normalized-schema";
import { buildPublishedArtifact } from "./publish/build-artifact";
import type { ArtifactWork } from "./publish/build-artifact";
import {
  applyWorkNormalizations,
  type WorkNormalization,
} from "./publish/apply-work-normalizations";
import { buildWorks } from "./publish/build-works";
import { loadWorkMergeGroups } from "./normalize/normalize-works";
import type { ElementType } from "./scraping/shared/element-type";
import { mergeElements } from "./scraping/shared/merge-elements";
import { truncateMarkdown } from "./scraping/shared/markdown-limit";
import { convertHtmlToMarkdown } from "./scraping/shared/process-markdown";
import {
  transformAndTranslateTags,
} from "./scraping/shared/transform-and-translate-tags";
import type { SplitFile } from "./split/build";
import { ACTIVE_SOURCES } from "./sources";
import { improbibSchema } from "./validation/improbib-schema";

const SOURCES = ACTIVE_SOURCES;

async function loadNormalized(): Promise<NormalizedElement[]> {
  const normalizedDir = path.join(process.cwd(), "output", "normalized");
  const elements: NormalizedElement[] = [];

  for (const sourceName of SOURCES) {
    try {
      const data = JSON.parse(
        await fs.readFile(path.join(normalizedDir, `${sourceName}.json`), "utf-8")
      );
      elements.push(...(data.elements ?? []));
    } catch {
      console.warn(`Normalized file not found for ${sourceName}, skipping`);
    }
  }

  return elements;
}

/**
 * The merged per-work extractions. Optional: a run before the works stage
 * still publishes, it just keeps the per-source content.
 */
async function loadWorkNormalizations(): Promise<WorkNormalization[]> {
  try {
    const data = JSON.parse(
      await fs.readFile(
        path.join(process.cwd(), "output", "normalized-works.json"),
        "utf-8"
      )
    );
    return (data.works ?? []) as WorkNormalization[];
  } catch {
    console.warn(
      "normalized-works.json not found, works keep their per-source content"
    );
    return [];
  }
}

async function loadSplits(): Promise<
  Map<string, SplitFile>
> {
  const result = new Map<string, SplitFile>();
  for (const sourceName of SOURCES) {
    try {
      const data = JSON.parse(
        await fs.readFile(
          path.join(process.cwd(), "output", "splits", `${sourceName}.json`),
          "utf-8"
        )
      );
      result.set(sourceName, data as SplitFile);
    } catch {
      // No split data for this source.
    }
  }
  return result;
}

async function loadSplitNormalized(): Promise<NormalizedElement[]> {
  const elements: NormalizedElement[] = [];
  for (const sourceName of SOURCES) {
    try {
      const data = JSON.parse(
        await fs.readFile(
          path.join(
            process.cwd(),
            "output",
            "normalized-splits",
            `${sourceName}.json`
          ),
          "utf-8"
        )
      );
      elements.push(...(data.elements ?? []));
    } catch {
      // No normalized split data for this source.
    }
  }
  return elements;
}

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
    works?: ArtifactWork[];
    collections?: {
      id: string;
      name: string;
      url: string;
      sourceName: string;
      languageCode: string;
      childIds: string[];
    }[];
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

  // Pages that describe several independent games: the parent stays as a
  // collection marker, the children become first-class elements. The raw layer
  // is untouched; this is the only place the two are joined.
  const splits = await loadSplits();
  const elementById = new Map(
    allOutputs.elements.map((element) => [element.identifier, element])
  );
  let splitCollections = 0;
  let splitChildren = 0;
  const collectionParents = new Set<string>();
  const collections: NonNullable<typeof allOutputs.collections> = [];

  for (const splitFile of splits.values()) {
    for (const page of splitFile.pages) {
      const parent = elementById.get(page.parentIdentifier);
      if (parent) parent.isCollection = true;
      splitCollections++;
      collectionParents.add(page.parentIdentifier);
      collections.push({
        id: page.parentIdentifier,
        name: page.parentName,
        url: parent?.url ?? "",
        sourceName: page.sourceName,
        languageCode: page.languageCode,
        childIds: page.children.map((child) => child.identifier),
      });

      for (const child of page.children) {
        if (elementById.has(child.identifier)) continue;
        const childElement: ElementType = {
          type: "element",
          identifier: child.identifier,
          url: child.url,
          name: child.name,
          sourceName: page.sourceName,
          languageCode: page.languageCode,
          tags: parent?.tags ?? [],
          htmlContent: child.htmlContent,
          markdown: child.markdown,
          fetchedAt: parent?.fetchedAt,
          lastModified: parent?.lastModified,
          authors: parent?.authors,
          licenseName: parent?.licenseName,
          licenseSpdxIdentifier: parent?.licenseSpdxIdentifier,
          licenseUrl: parent?.licenseUrl,
          splitFrom: page.parentIdentifier,
        };
        allOutputs.elements.push(childElement);
        elementById.set(child.identifier, childElement);
        splitChildren++;
      }
    }
  }

  if (splitCollections > 0) {
    console.log(
      `Added ${splitChildren} split elements from ${splitCollections} collection pages`
    );
  }

  // A collection page is not a playable element: it lives in `collections`
  // (metadata) and its children carry the content.
  if (collectionParents.size > 0) {
    allOutputs.elements = allOutputs.elements.filter(
      (element) => !collectionParents.has(element.identifier)
    );
    allOutputs.collections = collections.sort((a, b) =>
      a.id.localeCompare(b.id)
    );
  }

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
    e.markdown = truncateMarkdown(md);
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
    splitCollections,
    splitChildren,
  };

  // Layer 2 + 3 of the published model: normalized content and the work
  // aggregation. Both are optional so a scrape before the first normalization
  // still produces a valid v1 artifact.
  const normalized = [
    ...(await loadNormalized()),
    ...(await loadSplitNormalized()),
  ];
  const publishedIds = new Set(allOutputs.elements.map((e) => e.identifier));
  const usableNormalized = normalized.filter((element) =>
    publishedIds.has(element.identifier)
  );

  // One merged extraction per work, copied onto every member so an element
  // consumer sees the same walkthrough as the work.
  const workNormalizations = await loadWorkNormalizations();
  const withWorkNormalizations = applyWorkNormalizations(
    usableNormalized,
    workNormalizations
  );

  if (withWorkNormalizations.length > 0) {
    const overrides = await loadOverrides(
      path.join(process.cwd(), "graph-overrides.json")
    );
    const { elements: overriddenElements } = applyDedupOverrides(
      withWorkNormalizations,
      overrides
    );
    const parentLinks = overrides
      .filter(
        (
          override
        ): override is Override & {
          type: "add_variationOf";
          fromElementId: string;
          toElementId: string;
        } => override.type === "add_variationOf"
      )
      .map((override) => ({
        childElementId: override.fromElementId,
        parentElementId: override.toElementId,
      }));

    const works = buildWorks(overriddenElements, {
      parentLinks,
      mergeGroups: await loadWorkMergeGroups(),
    });
    const published = buildPublishedArtifact({
      elements: allOutputs.elements,
      normalized: overriddenElements,
      works,
    });

    allOutputs.elements = published.elements;
    allOutputs.works = published.works;
    allOutputs.meta.schemaVersion = 2;
    allOutputs.meta.works = {
      workCount: published.works.length,
      translationGroupCount: new Set(
        published.works
          .map((work) => work.translationId)
          .filter((id): id is string => Boolean(id))
      ).size,
      variantCount: published.works.filter((work) => work.parentWorkId).length,
      normalizedElementCount: overriddenElements.length,
    };
  } else {
    allOutputs.meta.schemaVersion = 1;
  }

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

  return {
    ...parsed,
    meta: allOutputs.meta,
    works: allOutputs.works,
    collections: allOutputs.collections,
  };
}
