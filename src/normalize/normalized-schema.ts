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

export const normalizedSourceSchema = z.object({
  meta: z.object({
    sourceName: z.string(),
    elementCount: z.number(),
    derivedElementCount: z.number(),
    splitElementCount: z.number(),
    normalizedAt: z.string(),
  }),
  elements: z.array(normalizedElementSchema),
});

export type NormalizedSource = z.infer<typeof normalizedSourceSchema>;

let _normalizedBy = "";
export function getNormalizedBy(): string {
  if (!_normalizedBy) {
    _normalizedBy = Bun.hash(JSON.stringify(normalizedElementSchema.shape)).toString(16).padStart(32, "0");
  }
  return _normalizedBy;
}
