import { resolveTagIds } from "../shared/tag-vocabulary";

/**
 * Resolves a single raw label to its canonical concept id.
 *
 * @deprecated use {@link resolveTagIds} — one label can map to several concepts
 * (for example "Music and Singing"). Kept for callers that only need a single
 * match.
 */
export function findTranslationId(text: string): string | null {
  return resolveTagIds([text]).ids[0] ?? null;
}
