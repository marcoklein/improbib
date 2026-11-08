import type { NormalizedElement } from "../normalize/normalized-schema";
import { sanitizePractical } from "../normalize/normalized-schema";
import type { ElementType } from "../scraping/shared/element-type";
import type { PublishedVariation, PublishedWork } from "./build-works";

/**
 * The normalized subset that is published per source element.
 *
 * Kept deliberately smaller than `output/normalized/*.json`: no raw HTML, no
 * `relatedIdentifiers`, no duplicated variations. The aggregation lives in
 * `works`, the content lives here.
 */
export interface ArtifactNormalized {
  summary: string;
  description: string;
  howToPlay: NormalizedElement["normalized"]["howToPlay"];
  practical: NormalizedElement["normalized"]["practical"];
  mechanics: string[];
  skills: string[];
  tips: NormalizedElement["normalized"]["tips"];
  referencedElements: NormalizedElement["normalized"]["referencedElements"];
  contentHash: string;
  normalizedBy: string;
  extractedAt: string;
  /** Which model produced the extraction (absent on older entries). */
  model?: string;
  /** Hash of the extraction prompt (absent on older entries). */
  promptHash?: string;
}

export interface ArtifactSource {
  sourceName: string;
  identifier: string;
  url: string;
  licenseName?: string;
  licenseSpdxIdentifier?: string;
  licenseUrl?: string;
  authors: string[];
  lastModified?: string;
}

export interface ArtifactWork {
  id: string;
  languageCode: "de" | "en";
  canonicalElementId: string;
  memberIds: string[];
  name: string;
  translationId: string | null;
  parentWorkId: string | null;
  parentConfidence: number | null;
  sources: ArtifactSource[];
  variations: PublishedVariation[];
}

export interface PublishedArtifact {
  elements: ElementType[];
  works: ArtifactWork[];
}

function toArtifactNormalized(
  normalized: NormalizedElement["normalized"]
): ArtifactNormalized | undefined {
  // A block without a summary is a failed extraction: consumers use the
  // summary as the element's one-line description. The other fields are
  // independent — an element can have a complete walkthrough while the model
  // returned no description (Fischer, Fischer, wie tief ist das Wasser?), and
  // dropping the whole block would throw away its 8 valid steps.
  if (!normalized.summary.trim()) {
    return undefined;
  }
  const hasContent =
    normalized.description.trim() !== "" ||
    (normalized.howToPlay?.steps.length ?? 0) > 0 ||
    normalized.tips.length > 0 ||
    normalized.variations.length > 0;
  if (!hasContent) {
    return undefined;
  }

  return {
    summary: normalized.summary,
    description: normalized.description,
    howToPlay: normalized.howToPlay,
    practical: sanitizePractical(normalized.practical),
    mechanics: normalized.mechanics.map((mechanic) => mechanic.name),
    skills: normalized.skills.map((skill) => skill.name),
    tips: normalized.tips,
    referencedElements: normalized.referencedElements,
    contentHash: normalized.contentHash,
    normalizedBy: normalized.normalizedBy,
    extractedAt: normalized.extractedAt,
    model: normalized.model,
    promptHash: normalized.promptHash,
  };
}

function toArtifactSource(element: {
  sourceName: string;
  identifier: string;
  url: string;
  licenseName?: string;
  licenseSpdxIdentifier?: string;
  licenseUrl?: string;
  authors?: string[];
  lastModified?: string;
}): ArtifactSource {
  return {
    sourceName: element.sourceName,
    identifier: element.identifier,
    url: element.url,
    licenseName: element.licenseName,
    licenseSpdxIdentifier: element.licenseSpdxIdentifier,
    licenseUrl: element.licenseUrl,
    authors: element.authors ?? [],
    lastModified: element.lastModified,
  };
}

/**
 * Joins the raw artifact elements with the normalized content and the work
 * aggregation.
 *
 * Every element keeps its identity and content (backwards compatible), and
 * gains the normalized block plus the links that let a consumer collapse
 * duplicate sources (`canonicalId`), pair languages (`translationId`) and show
 * variants (`variationOf`). The `works` array is the same information from the
 * other direction.
 */
export function buildPublishedArtifact(params: {
  elements: ElementType[];
  normalized: NormalizedElement[];
  works: PublishedWork[];
}): PublishedArtifact {
  const normalizedById = new Map(
    params.normalized.map((element) => [element.identifier, element])
  );
  const elementById = new Map(
    params.elements.map((element) => [element.identifier, element])
  );
  const workByMember = new Map<string, PublishedWork>();
  for (const work of params.works) {
    for (const memberId of work.memberIds) {
      workByMember.set(memberId, work);
    }
  }

  for (const element of params.elements) {
    const normalized = normalizedById.get(element.identifier);
    const work = workByMember.get(element.identifier);
    if (!work) continue;

    if (normalized) {
      const published = toArtifactNormalized(normalized.normalized);
      if (published) {
        element.normalized = published;
      }
    }
    element.canonicalId = work.id;
    element.translationId = work.translationId ?? undefined;
    element.variationOf = work.parentWorkId ?? undefined;
    element.workKind = work.parentWorkId ? "variation" : "element";
    element.isCanonicalMember =
      element.identifier === work.canonicalElementId;
  }

  const works: ArtifactWork[] = params.works
    .map((work) => {
      const members = work.memberIds
        .map((id) => elementById.get(id))
        .filter((element): element is ElementType => Boolean(element));
      const canonical = elementById.get(work.canonicalElementId);

      return {
        id: work.id,
        languageCode: work.languageCode,
        canonicalElementId: work.canonicalElementId,
        memberIds: members.map((member) => member.identifier),
        name: canonical?.name ?? "",
        translationId: work.translationId,
        parentWorkId: work.parentWorkId,
        parentConfidence: work.parentConfidence,
        sources: members.map(toArtifactSource),
        variations: work.variations,
      } satisfies ArtifactWork;
    })
    // A work whose members were all merged away has no content to publish.
    .filter((work) => work.memberIds.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  // Drop links that point at a work that is not published.
  const publishedWorkIds = new Set(works.map((work) => work.id));
  for (const work of works) {
    if (work.parentWorkId && !publishedWorkIds.has(work.parentWorkId)) {
      work.parentWorkId = null;
      work.parentConfidence = null;
    }
    work.variations = work.variations.filter(
      (variation) =>
        variation.kind === "inline" ||
        (variation.elementId !== undefined &&
          publishedWorkIds.has(variation.elementId))
    );
  }

  // Mirror the cleanup onto the elements.
  for (const element of params.elements) {
    if (
      typeof element.variationOf === "string" &&
      !publishedWorkIds.has(element.variationOf)
    ) {
      element.variationOf = undefined;
      element.workKind = "element";
    }
    if (
      typeof element.canonicalId === "string" &&
      !publishedWorkIds.has(element.canonicalId)
    ) {
      element.canonicalId = undefined;
    }
  }

  return { elements: params.elements, works };
}
