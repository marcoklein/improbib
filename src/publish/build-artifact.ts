import type { NormalizedElement } from "../normalize/normalized-schema";
import { sanitizePractical, sanitizeSkills } from "../normalize/normalized-schema";
import { SKILLS } from "../normalize/skills";
import type { SkillId } from "../normalize/skills";
import { dropRedundantTips } from "../normalize/tip-redundancy";
import type { ElementType } from "../scraping/shared/element-type";
import type { PublishedVariation, PublishedWork } from "./build-works";
import { deriveWorkFit, isPlayableKind, isVariantIndexPage } from "./work-fit";
import type { WorkFit, WorkKind, WorkRole } from "./work-fit";

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
  /**
   * What the work is, derived from the source tags and the page body. See
   * `work-fit.ts` and `product/features/work-fit-taxonomy.md`.
   */
  kind: WorkKind;
  /** Where a playable work fits. Empty for concepts and collections. */
  roles: WorkRole[];
  /**
   * Derived for the app's category badges. Kept as the display fallback while
   * consumers move to `kind`/`roles`.
   */
  categories: string[];
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

/**
 * One entry of the fixed skill vocabulary. Published alongside the elements so
 * a consumer can render the label and definition of every `normalized.skills`
 * id without hard-coding the list.
 */
export interface ArtifactSkill {
  id: SkillId;
  de: string;
  en: string;
  definitionDe: string;
  definitionEn: string;
}

export interface PublishedArtifact {
  elements: ElementType[];
  works: ArtifactWork[];
  skills: ArtifactSkill[];
}

function toArtifactNormalized(
  normalized: NormalizedElement["normalized"],
  fit: WorkFit
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

  // A concept has no difficulty, player count or "Einsatz". Publishing them
  // made a glossary entry look like a game (see the element-quality evidence).
  const practical = isPlayableKind(fit.kind)
    ? {
        ...sanitizePractical(normalized.practical),
        usage: fit.usage.length > 0 ? fit.usage : undefined,
      }
    : {};

  return {
    summary: normalized.summary,
    description: normalized.description,
    howToPlay: normalized.howToPlay,
    practical,
    mechanics: normalized.mechanics.map((mechanic) => mechanic.name),
    skills: sanitizeSkills(normalized.skills),
    kind: fit.kind,
    roles: fit.roles,
    categories: fit.categories,
    // Entries extracted before the tips rule existed can still contain a tip
    // that repeats a step. Filtering here cleans the old data too.
    tips: dropRedundantTips(
      (normalized.howToPlay?.steps ?? []).map((step) => step.action),
      normalized.tips
    ),
    referencedElements: normalized.referencedElements,
    contentHash: normalized.contentHash,
    normalizedBy: normalized.normalizedBy,
    extractedAt: normalized.extractedAt,
    model: normalized.model,
    promptHash: normalized.promptHash,
  };
}

/**
 * Derive the taxonomy once per work and apply it to every member, so two
 * sources of the same work cannot publish contradictory kinds or roles.
 *
 * Tags are pooled: a glossary page merged with an exercise page is an
 * exercise, because one source states a playable identity. The markdown of an
 * index page stays link-only, which is how `collection` is detected.
 */
function buildWorkFits(params: {
  elements: ElementType[];
  normalizedById: Map<string, NormalizedElement>;
  works: PublishedWork[];
}): Map<string, WorkFit> {
  const elementById = new Map(
    params.elements.map((element) => [element.identifier, element])
  );
  const fits = new Map<string, WorkFit>();

  for (const work of params.works) {
    const members = work.memberIds
      .map((id) => elementById.get(id))
      .filter((element): element is ElementType => Boolean(element));
    if (members.length === 0) continue;

    const canonical =
      elementById.get(work.canonicalElementId) ?? members[0];
    const tagIds = [
      ...new Set(
        members.flatMap((member) => member.tagIds ?? member.tags ?? [])
      ),
    ].sort();

    const usage = new Set<"rehearsal" | "show">();
    for (const member of members) {
      const normalized = params.normalizedById.get(member.identifier);
      const sanitized = normalized
        ? sanitizePractical(normalized.normalized.practical).usage
        : undefined;
      for (const value of sanitized ?? []) usage.add(value);
    }

    // Only a work whose members are all link-only index pages is a collection;
    // an index page merged with a playable page keeps the playable content.
    const allIndexPages = members.every((member) =>
      isVariantIndexPage(member.name, member.markdown ?? "")
    );

    fits.set(
      work.id,
      deriveWorkFit({
        tagIds,
        memberIds: work.memberIds,
        name: canonical.name,
        markdown: allIndexPages ? canonical.markdown ?? "" : "",
        usage: [...usage],
      })
    );
  }

  return fits;
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
 * The skill vocabulary exactly as `src/normalize/skills.ts` defines it. Copy,
 * not reference: the artifact is serialized, and consumers get a plain array.
 */
function toArtifactSkills(): ArtifactSkill[] {
  return SKILLS.map((skill) => ({
    id: skill.id,
    de: skill.de,
    en: skill.en,
    definitionDe: skill.definitionDe,
    definitionEn: skill.definitionEn,
  }));
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

  const workFits = buildWorkFits({
    elements: params.elements,
    normalizedById,
    works: params.works,
  });

  for (const element of params.elements) {
    const normalized = normalizedById.get(element.identifier);
    const work = workByMember.get(element.identifier);
    if (!work) continue;

    if (normalized) {
      const fit =
        workFits.get(work.id) ??
        deriveWorkFit({
          tagIds: element.tagIds ?? element.tags ?? [],
          memberIds: work.memberIds,
          name: element.name,
          markdown: element.markdown ?? "",
          usage: sanitizePractical(normalized.normalized.practical).usage,
        });
      const published = toArtifactNormalized(normalized.normalized, fit);
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

  return { elements: params.elements, works, skills: toArtifactSkills() };
}
