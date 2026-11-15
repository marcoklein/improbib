/**
 * Works that are warm-ups in practice but carry no warm-up tag.
 *
 * The list is reviewed by hand and deliberately small. Identifiers are the
 * stable source identifiers from the artifact, so a title change does not
 * silently drop the exception.
 *
 * This replaces the old "short + beginner = warm-up" heuristic. That rule
 * caught Freeze Tag, but also every short beginner game — including games that
 * need an audience suggestion and a genre list.
 */
export const WARMUP_OVERRIDES = new Set<string>([
  "4b96bcb7d2d86c597e0a0c786e6ad5a2", // Freeze Tag (en, improwiki)
  "b495669fefdc338b2baa16f4bc3ba761", // Freeze Tag (de, improwiki)
]);
