import { z, type TypeOf } from "zod";

export const improbibSchema = z.object({
  elements: z
    .array(
      z.object({
        tagIds: z.array(z.string()).min(1),
        licenseUrl: z.string().url(),
        translatedTags: z.array(z.string().min(2).max(20)).nonempty(),
        licenseSpdxIdentifier: z.string().includes("CC-BY-SA-3.0-DE"),
        licenseName: z.string(),
      })
    )
    .min(1),
});

export type ImprobibSchema = TypeOf<typeof improbibSchema>;
