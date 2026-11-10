import { z } from "zod";
import { SKILL_IDS, toSkillId, type SkillId } from "./skills";

const TipCategory = z.string();
const MechanicCategory = z.string();
const Difficulty = z.enum(["beginner", "intermediate", "advanced"]);
const EnergyLevel = z.enum(["low", "medium", "high"]);
/**
 * Legacy free-text field from before the fixed skill vocabulary and the
 * usage split. Kept optional so entries extracted earlier still parse; it is
 * no longer asked for and no longer published.
 */
const SuitableFor = z.string();
const SkillId = z.enum(SKILL_IDS);
/**
 * Where a work is used. "rehearsal" is the German "Probe" — the vocabulary
 * avoids "workshop" on purpose, because the rehearsal is what a group
 * actually plans.
 */
const Usage = z.enum(["rehearsal", "show"]);
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

/**
 * A skill is an id from the fixed vocabulary (`./skills.ts`). Older
 * extractions stored free-text objects (`{name, category}`); accepting them
 * and mapping them to ids keeps a stored file readable after the vocabulary
 * change instead of failing the schema of the whole element.
 */
const legacySkillSchema = z.object({
  name: z.string(),
  originalName: z.string().optional(),
  category: z.string().optional(),
});

const skillsSchema = z
  .array(z.union([SkillId, legacySkillSchema]))
  .transform((items): SkillId[] => {
    const ids = new Set<SkillId>();
    for (const item of items) {
      const id =
        typeof item === "string" ? toSkillId(item) : toSkillId(item.name);
      if (id) ids.add(id);
    }
    return [...ids];
  });

const practicalSchema = z.object({
  difficulty: Difficulty.optional(),
  typicalDurationMinutes: z.number().positive().optional(),
  energyLevel: EnergyLevel.optional(),
  groupSize: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  /** @deprecated replaced by `usage`; only present on older extractions. */
  requiresPreparation: z.boolean().optional(),
  /** @deprecated replaced by `usage`; only present on older extractions. */
  suitableFor: z.array(SuitableFor).optional(),
  /** Where the work is used: rehearsal ("Probe"), show, or both. */
  usage: z.array(Usage).optional(),
  /**
   * What must be in place before the work can start — material and
   * prerequisites in one line, at most twelve words. Empty when nothing is
   * needed. Deliberately a single field: "Material" and "Voraussetzung" were
   * two labels for the same information.
   */
  requires: z.string().optional(),
});

const normalizedSchema = z.object({
  summary: z.string().min(10),
  description: z.string().min(20),
  howToPlay: howToPlaySchema,
  variations: z.array(variationSchema),
  tips: z.array(tipSchema),
  referencedElements: z.array(referencedElementSchema),
  mechanics: z.array(mechanicSchema),
  skills: skillsSchema,
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
    usage: sanitizeUsage(practical.usage) ?? usageFromLegacy(practical.suitableFor),
    requires: sanitizeRequires(practical.requires),
  };
}

/** Only the three words the UI understands, de-duplicated, in a stable order. */
export function sanitizeUsage(value: unknown): ("rehearsal" | "show")[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<"rehearsal" | "show">();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim().toLowerCase();
    if (normalized === "rehearsal" || normalized === "probe") seen.add("rehearsal");
    if (
      normalized === "show" ||
      normalized === "performance" ||
      normalized === "stage"
    ) {
      seen.add("show");
    }
  }
  if (seen.size === 0) return undefined;
  return (["rehearsal", "show"] as const).filter((usage) => seen.has(usage));
}

/**
 * Maps the old free-text `suitableFor` onto the two usages. The old values
 * mixed the setting with the purpose (`warmup`, `exercise`, `workshop`); all
 * of them are rehearsal contexts, `performance` and `encore` are the show.
 */
function usageFromLegacy(
  suitableFor: unknown
): ("rehearsal" | "show")[] | undefined {
  if (!Array.isArray(suitableFor)) return undefined;
  const usages = new Set<"rehearsal" | "show">();
  for (const item of suitableFor) {
    if (typeof item !== "string") continue;
    const value = item.trim().toLowerCase();
    if (["performance", "encore", "show", "stage"].includes(value)) {
      usages.add("show");
    }
    if (["warmup", "exercise", "workshop", "rehearsal", "probe"].includes(value)) {
      usages.add("rehearsal");
    }
  }
  if (usages.size === 0) return undefined;
  return (["rehearsal", "show"] as const).filter((usage) => usages.has(usage));
}

const EMPTY_REQUIRES = new Set(["", "nichts", "keine", "kein", "none", "nothing", "no"]);

/**
 * The single prerequisite line. Empty answers mean "nothing needed" and are
 * dropped, so the UI does not show a line that says nothing.
 */
export function sanitizeRequires(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/[.\s]+$/, "");
  if (EMPTY_REQUIRES.has(trimmed.toLowerCase())) return undefined;
  return trimmed || undefined;
}

/** Skill ids only, de-duplicated, unknown phrases dropped. */
export function sanitizeSkills(value: unknown): SkillId[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<SkillId>();
  for (const item of value) {
    const id =
      typeof item === "string"
        ? toSkillId(item)
        : item && typeof item === "object" && "name" in item
          ? toSkillId((item as { name: unknown }).name)
          : undefined;
    if (id) ids.add(id);
  }
  return [...ids];
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
 *
 * Bumped again for the vocabulary contract: skills are ids from
 * `normalize/skills.ts`, and `practical.usage` / `practical.requires` replace
 * the free-text `suitableFor` and the separate preparation flag.
 */
const NORMALIZED_CONTRACT_VERSION = "7e2f4a9c1b6d8053c4e7a2f9b1d63058";

export function getNormalizedBy(): string {
  return NORMALIZED_CONTRACT_VERSION;
}
