import { z } from "zod";

const TipCategory = z.string();
const MechanicCategory = z.string();
const SkillCategory = z.string();
const Difficulty = z.enum(["beginner", "intermediate", "advanced"]);
const EnergyLevel = z.enum(["low", "medium", "high"]);
const SuitableFor = z.string();
const howToPlayStepSchema = z.object({
  action: z.string(),
  role: z.string().optional(),
  constraint: z.string().optional(),
});

const howToPlaySchema = z.object({
  steps: z.array(howToPlayStepSchema),
}).nullable();

const variationSchema = z.object({
  name: z.string(),
  description: z.string(),
  differsBy: z.array(z.string()),
});

const tipSchema = z.object({
  text: z.string(),
  category: TipCategory,
});

const referencedElementSchema = z.object({
  name: z.string(),
  identifier: z.string().length(32).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const mechanicSchema = z.object({
  name: z.string(),
  originalName: z.string().optional(),
  category: MechanicCategory.optional(),
});

const skillSchema = z.object({
  name: z.string(),
  originalName: z.string().optional(),
  category: SkillCategory.optional(),
});

const practicalSchema = z.object({
  difficulty: Difficulty.optional(),
  typicalDurationMinutes: z.number().positive().optional(),
  energyLevel: EnergyLevel.optional(),
  groupSize: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  requiresPreparation: z.boolean().optional(),
  suitableFor: z.array(SuitableFor).optional(),
});

const normalizedSchema = z.object({
  summary: z.string().min(10),
  description: z.string().min(20),
  howToPlay: howToPlaySchema,
  variations: z.array(variationSchema),
  tips: z.array(tipSchema),
  referencedElements: z.array(referencedElementSchema),
  mechanics: z.array(mechanicSchema),
  skills: z.array(skillSchema),
  practical: practicalSchema,
  contentHash: z.string(),
  extractedAt: z.string(),
  normalizedBy: z.string(),

  /**
   * Provenance: which model produced this extraction. Optional because
   * entries written before provenance was recorded have no value.
   */
  model: z.string().optional(),
  /** Hash of the extraction prompt, so prompt changes are traceable. */
  promptHash: z.string().optional(),
});

const derivedElementSchema = z.object({
  name: z.string(),
  description: z.string(),
  parentIdentifier: z.string(),
});

const relatedIdentifierSchema = z.object({
  identifier: z.string().length(32),
  confidence: z.number().min(0).max(1),
});

export const normalizedElementSchema = z.object({
  identifier: z.string().length(32),
  name: z.string(),
  url: z.string().url(),
  sourceName: z.string(),
  languageCode: z.enum(["de", "en"]),
  tags: z.array(z.string()),
  htmlContent: z.string(),

  splitFrom: z.string().length(32).optional(),

  translationLinkEn: z.string().url().optional(),
  translationLinkDe: z.string().url().optional(),
  translationLinkEnIdentifier: z.string().length(32).optional(),
  translationLinkDeIdentifier: z.string().length(32).optional(),

  playerCountMin: z.number().optional(),
  playerCountMax: z.number().optional(),
  categories: z.array(z.string()).optional(),
  postTags: z.array(z.string()).optional(),
  lastModified: z.string().optional(),

  normalized: normalizedSchema,

  derivedElements: z.array(derivedElementSchema),

  relatedIdentifiers: z.array(relatedIdentifierSchema),
});

export type NormalizedElement = z.infer<typeof normalizedElementSchema>;

/**
 * `practical.difficulty` and `practical.energyLevel` are closed enums, but the
 * model occasionally answers with the source language ("fortgeschritten",
 * "lebhaft"). Left as-is, one such value fails validation of the whole
 * assembled artifact, so nothing is published until it is corrected by hand.
 */
const DIFFICULTY_ALIASES: Record<string, z.infer<typeof Difficulty>> = {
  beginner: "beginner",
  anfänger: "beginner",
  anfaenger: "beginner",
  leicht: "beginner",
  intermediate: "intermediate",
  fortgeschritten: "intermediate",
  mittel: "intermediate",
  advanced: "advanced",
  profi: "advanced",
  professional: "advanced",
  experte: "advanced",
};

const ENERGY_ALIASES: Record<string, z.infer<typeof EnergyLevel>> = {
  low: "low",
  ruhig: "low",
  calm: "low",
  medium: "medium",
  mittel: "medium",
  high: "high",
  hoch: "high",
  lebhaft: "high",
  energetic: "high",
  lively: "high",
  wild: "high",
};

function normalizeAlias<T extends string>(
  value: unknown,
  aliases: Record<string, T>
): T | undefined {
  if (typeof value !== "string") return undefined;
  return aliases[value.trim().toLowerCase()];
}

export function normalizeDifficulty(
  value: unknown
): z.infer<typeof Difficulty> | undefined {
  return normalizeAlias(value, DIFFICULTY_ALIASES);
}

export function normalizeEnergyLevel(
  value: unknown
): z.infer<typeof EnergyLevel> | undefined {
  return normalizeAlias(value, ENERGY_ALIASES);
}

/**
 * Drops enum values the schema cannot represent. Applied when publishing, so
 * an entry that was stored before the enum normalization existed cannot block
 * the publication of all other elements.
 */
export function sanitizePractical(
  practical: NormalizedElement["normalized"]["practical"]
): NormalizedElement["normalized"]["practical"] {
  return {
    ...practical,
    difficulty:
      normalizeDifficulty(practical.difficulty) ?? undefined,
    energyLevel:
      normalizeEnergyLevel(practical.energyLevel) ?? undefined,
  };
}

/**
 * Whether an extraction satisfies the field contract closely enough to be
 * stored.
 *
 * The values mirror the limits of `normalizedSchema`: a summary below 10
 * characters or a description below 20 means the model returned an empty or
 * truncated answer. Such an answer is a failed extraction, not a result — the
 * pipeline retries it and never caches it, otherwise a single bad response
 * would stick forever (the cache key is content hash + contract version).
 */
export function isUsableNormalization(
  normalized: NormalizedElement["normalized"]
): boolean {
  return (
    normalized.summary.trim().length >= 10 &&
    normalized.description.trim().length >= 20
  );
}

export const normalizedSourceSchema = z.object({
  meta: z.object({
    sourceName: z.string(),
    elementCount: z.number(),
    derivedElementCount: z.number(),
    splitElementCount: z.number(),
    normalizedAt: z.string(),
  }).passthrough(),
  elements: z.array(normalizedElementSchema),
});

export type NormalizedSource = z.infer<typeof normalizedSourceSchema>;

/**
 * Identifies the extraction *contract*: the prompt and the meaning of the
 * fields it produces. Cached normalizations are reused only when this value
 * matches the one stored with them.
 *
 * It used to be derived from the Zod schema shape. That made adding a
 * provenance field (`model`) invalidate every cached result, i.e. a cheap
 * metadata change would trigger a full, paid re-extraction. The value is now
 * an explicit constant: bump it when the contract changes, not when the
 * schema grows a field that does not affect the extraction.
 *
 * The current value is a fixed constant. It was bumped for the voice contract
 * change (the prompt now demands a single addressed voice — "ihr", plural
 * imperative) and again for the tips contract: a tip must be advice the source
 * actually gives, never a restatement of a step or the description. Without a
 * bump the old extractions would stay cached forever, because the cache key is
 * content hash + contract version, not the prompt hash.
 */
const NORMALIZED_CONTRACT_VERSION = "b41c7d0e5f8a4962a1d3c6e9f0b27d54";

export function getNormalizedBy(): string {
  return NORMALIZED_CONTRACT_VERSION;
}
