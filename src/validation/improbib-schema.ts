import { z, type TypeOf } from "zod";
import { MARKDOWN_MAX_CHARS } from "../scraping/shared/markdown-limit";
import { SKILL_IDS } from "../normalize/skills";

const MD5_LENGTH = 32;

const artifactPracticalSchema = z.object({
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  typicalDurationMinutes: z.number().positive().optional(),
  energyLevel: z.enum(["low", "medium", "high"]).optional(),
  groupSize: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  requiresPreparation: z.boolean().optional(),
  suitableFor: z.array(z.string()).optional(),
  usage: z.array(z.enum(["rehearsal", "show"])).optional(),
  requires: z.string().optional(),
});

const artifactStepSchema = z.object({
  action: z.string(),
  role: z.string().optional(),
  constraint: z.string().optional(),
});

/**
 * The normalized subset published per element. The full normalization output
 * (`output/normalized/*.json`) is an internal artifact; this is the contract
 * consumers may rely on.
 */
export const artifactNormalizedSchema = z.object({
  summary: z.string().min(1),
  description: z.string(),
  howToPlay: z
    .object({ steps: z.array(artifactStepSchema) })
    .nullable(),
  practical: artifactPracticalSchema,
  mechanics: z.array(z.string()),
  skills: z.array(z.enum(SKILL_IDS)),
  categories: z.array(
    z.enum(["warmup", "exercise", "game", "format", "concept", "audienceQuestion"])
  ),
  tips: z.array(z.object({ text: z.string(), category: z.string() })),
  referencedElements: z.array(
    z.object({
      name: z.string(),
      identifier: z.string().length(MD5_LENGTH).optional(),
      confidence: z.number().min(0).max(1).optional(),
    })
  ),
  contentHash: z.string(),
  normalizedBy: z.string(),
  extractedAt: z.string(),
  /** Which model produced the extraction (absent on older entries). */
  model: z.string().optional(),
  /** Hash of the extraction prompt (absent on older entries). */
  promptHash: z.string().optional(),
});

const artifactVariationSchema = z.object({
  id: z.string(),
  kind: z.enum(["inline", "standalone"]),
  name: z.string(),
  description: z.string(),
  differsBy: z.array(z.string()),
  elementId: z.string().optional(),
});

const artifactSourceSchema = z.object({
  sourceName: z.string(),
  identifier: z.string().length(MD5_LENGTH),
  url: z.string().url(),
  licenseName: z.string().optional(),
  licenseSpdxIdentifier: z.string().optional(),
  licenseUrl: z.string().url().optional(),
  authors: z.array(z.string()),
  lastModified: z.string().optional(),
});

/**
 * A logical work: all source pages of the same exercise in one language.
 *
 * `translationId` pairs the DE and EN work, `parentWorkId` marks a standalone
 * variation. The elements referenced here carry the same `canonicalId`.
 */
export const artifactWorkSchema = z.object({
  id: z.string(),
  languageCode: z.enum(["de", "en"]),
  canonicalElementId: z.string().length(MD5_LENGTH),
  memberIds: z.array(z.string().length(MD5_LENGTH)).min(1),
  name: z.string(),
  translationId: z.string().nullable(),
  parentWorkId: z.string().nullable(),
  parentConfidence: z.number().nullable(),
  sources: z.array(artifactSourceSchema),
  variations: z.array(artifactVariationSchema),
});

export const improbibSchema = z.object({
  elements: z
    .array(
      z.object({
        url: z.string().url(),
        identifier: z.string().length(MD5_LENGTH),
        name: z.string(),
        sourceName: z.string().min(2).max(40),
        languageCode: z.enum(["de", "en"]),
        translationLinkEn: z.string().url().optional(),
        translationLinkDe: z.string().url().optional(),
        translationLinkEnIdentifier: z.string().length(MD5_LENGTH).optional(),
        translationLinkDeIdentifier: z.string().length(MD5_LENGTH).optional(),

        markdown: z.string().min(10).max(MARKDOWN_MAX_CHARS),
        tagIds: z.array(z.string()).default([]),
        licenseUrl: z.string().url(),
        translatedTags: z.array(z.string().min(2).max(40)).default([]),
        licenseSpdxIdentifier: z.enum([
          "CC-BY-SA-3.0-DE",
          "CC-BY-SA-4.0",
          "GFDL-1.2",
        ]),
        licenseName: z.string(),

        playerCountMin: z.number().optional(),
        playerCountMax: z.number().optional(),

        // Attribution (v2)
        authors: z.array(z.string()).optional(),
        lastModified: z.string().optional(),

        // Published model (v2)
        normalized: artifactNormalizedSchema.optional(),
        canonicalId: z.string().optional(),
        translationId: z.string().optional(),
        variationOf: z.string().optional(),
        workKind: z.enum(["element", "variation"]).optional(),
        isCanonicalMember: z.boolean().optional(),
        isCollection: z.boolean().optional(),
        splitFrom: z.string().length(MD5_LENGTH).optional(),
      })
    )
    .min(400)
    .max(3000),
  works: z.array(artifactWorkSchema).optional(),
  collections: z
    .array(
      z.object({
        id: z.string().length(MD5_LENGTH),
        name: z.string(),
        url: z.string(),
        sourceName: z.string(),
        languageCode: z.string(),
        childIds: z.array(z.string().length(MD5_LENGTH)).min(1),
      })
    )
    .optional(),
});

export type ImprobibSchema = TypeOf<typeof improbibSchema>;
