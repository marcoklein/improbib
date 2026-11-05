import fs from "node:fs/promises";
import path from "path";
import {
  challengeFileSchema,
  normalizeForMatch,
  type ChallengeAnnotation,
  type ChallengeIndex,
} from "./challenge/challenge-schema";
import { applyDedupOverrides, loadOverrides } from "./graph/overrides";
import type { Override } from "./graph/overrides";
import type { NormalizedElement } from "./normalize/normalized-schema";
import { buildPublishedArtifact } from "./publish/build-artifact";
import type { ArtifactWork } from "./publish/build-artifact";
import { buildWorks } from "./publish/build-works";
import type { ElementType } from "./scraping/shared/element-type";
import { mergeElements } from "./scraping/shared/merge-elements";
import { convertHtmlToMarkdown } from "./scraping/shared/process-markdown";
import {
  transformAndTranslateTags,
} from "./scraping/shared/transform-and-translate-tags";
import { improbibSchema } from "./validation/improbib-schema";

const SOURCES = ["improwiki", "learnimprov", "ircwiki"] as const;

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

interface ChallengeLoadResult {
  index: ChallengeIndex;
  stats: {
    elements: number;
    variations: number;
    easier: number;
    harder: number;
    lateral: number;
    unknown: number;
    model: string;
  };
}

/**
 * Loads the variation classification written by
 * `bun run challenge` (`output/challenge/*.json`).
 *
 * Missing files simply mean the artifact stays at v2 without adjustments.
 */
async function loadChallenge(): Promise<ChallengeLoadResult | undefined> {
  const challengeDir = path.join(process.cwd(), "output", "challenge");
  const index: ChallengeIndex = new Map();
  const stats = {
    elements: 0,
    variations: 0,
    easier: 0,
    harder: 0,
    lateral: 0,
    unknown: 0,
    model: "",
  };

  for (const sourceName of SOURCES) {
    try {
      const raw = JSON.parse(
        await fs.readFile(
          path.join(challengeDir, `${sourceName}.json`),
          "utf-8"
        )
      );
      const parsed = challengeFileSchema.parse(raw);
      stats.model = stats.model || parsed.meta.model;

      for (const [identifier, entry] of Object.entries(parsed.elements)) {
        const annotations = new Map<string, ChallengeAnnotation>();
        for (const annotation of entry.variations) {
          annotations.set(normalizeForMatch(annotation.name), annotation);
          stats.variations++;
          stats[annotation.direction]++;
        }
        index.set(identifier, annotations);
        stats.elements++;
      }
    } catch {
      // No classification for this source.
    }
  }

  if (index.size === 0) return undefined;
  return { index, stats };
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

  // Layer 2 + 3 of the published model: normalized content and the work
  // aggregation. Both are optional so a scrape before the first normalization
  // still produces a valid v1 artifact.
  const normalized = await loadNormalized();
  const publishedIds = new Set(allOutputs.elements.map((e) => e.identifier));
  const usableNormalized = normalized.filter((element) =>
    publishedIds.has(element.identifier)
  );

  if (usableNormalized.length > 0) {
    const overrides = await loadOverrides(
      path.join(process.cwd(), "graph-overrides.json")
    );
    const { elements: overriddenElements } = applyDedupOverrides(
      usableNormalized,
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

    const challenge = await loadChallenge();
    const works = buildWorks(overriddenElements, {
      parentLinks,
      challenge: challenge?.index,
    });
    const published = buildPublishedArtifact({
      elements: allOutputs.elements,
      normalized: overriddenElements,
      works,
    });

    allOutputs.elements = published.elements;
    allOutputs.works = published.works;
    allOutputs.meta.schemaVersion = challenge ? 3 : 2;
    if (challenge) {
      allOutputs.meta.challenge = challenge.stats;
    }
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

  return { ...parsed, meta: allOutputs.meta, works: allOutputs.works };
}
