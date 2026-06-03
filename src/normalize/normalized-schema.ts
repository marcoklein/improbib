import { z } from "zod";

export const normalizedElementSchema = z.object({
  identifier: z.string().length(32),
  name: z.string(),
  url: z.string().url(),
  sourceName: z.string(),
  languageCode: z.enum(["de", "en"]),
  tags: z.array(z.string()),
  htmlContent: z.string(),

  translationLinkEn: z.string().url().optional(),
  translationLinkDe: z.string().url().optional(),
  translationLinkEnIdentifier: z.string().length(32).optional(),
  translationLinkDeIdentifier: z.string().length(32).optional(),

  playerCountMin: z.number().optional(),
  playerCountMax: z.number().optional(),
  categories: z.array(z.string()).optional(),
  postTags: z.array(z.string()).optional(),
  lastModified: z.string().optional(),

  normalized: z.object({
    description: z.string().min(10),
    howToPlay: z.string().nullable(),
    variations: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
      }),
    ),
    tips: z.array(z.string()),
    referencedElements: z.array(z.string()),
    contentHash: z.string(),
    extractedAt: z.string(),
  }),

  relatedIdentifiers: z.array(z.string().length(32)),

  derivedElements: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      parentIdentifier: z.string(),
    }),
  ),
});

export type NormalizedElement = z.infer<typeof normalizedElementSchema>;

export const normalizedSourceSchema = z.object({
  meta: z.object({
    sourceName: z.string(),
    elementCount: z.number(),
    derivedElementCount: z.number(),
    normalizedAt: z.string(),
  }),
  elements: z.array(normalizedElementSchema),
});

export type NormalizedSource = z.infer<typeof normalizedSourceSchema>;
