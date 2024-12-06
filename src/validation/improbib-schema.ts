import { z, type TypeOf } from "zod";

const MD5_LENGTH = 32;

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

        markdown: z.string().min(10).max(10000),
        tagIds: z.array(z.string()).min(1),
        licenseUrl: z.string().url(),
        translatedTags: z.array(z.string().min(2).max(40)).nonempty(),
        licenseSpdxIdentifier: z.string().includes("CC-BY-SA-3.0-DE"),
        licenseName: z.string(),
      })
    )
    .min(400)
    .max(1000),
});

export type ImprobibSchema = TypeOf<typeof improbibSchema>;
