import { WARMUP_OVERRIDES } from "./warmup-overrides";

/**
 * The category shown as the first badge on a work page.
 *
 * A work can have several: Freeze Tag is a warm-up *and* a game, a long form
 * is a format. They answer different questions ("where does it fit?" and
 * "what is it?"), so an array is the honest shape.
 *
 * The category is derived from the source tags, never extracted. A source that
 * calls a work a game gets `game`; a source that calls it a warm-up gets
 * `warmup`. There is deliberately no "short + beginner = warm-up" heuristic:
 * that rule turned every short beginner game into a warm-up, including games
 * that need an audience suggestion and a genre list.
 *
 * A small curated list (`warmup-overrides.ts`) covers classics that carry no
 * warm-up tag. It is reviewed by hand and kept short.
 */
export const WORK_CATEGORIES = [
  "warmup",
  "exercise",
  "game",
  "format",
  "concept",
  "audienceQuestion",
] as const;

export type WorkCategory = (typeof WORK_CATEGORIES)[number];

/**
 * Tags that make a work a show format. `show` alone is the tag a performance
 * page carries; the others name a concrete long or short form structure.
 */
export const FORMAT_TAGS = new Set([
  "show",
  "longform",
  "improvForms",
  "shortform",
  "opening",
  "handle",
  "stringOfPearls",
  "musicalImprov",
  "organicImprov",
]);

export function deriveCategories(
  tagIds: string[],
  identifier?: string
): WorkCategory[] {
  const found = new Set<WorkCategory>();

  for (const tag of tagIds) {
    if (tag === "warmup" || tag === "nameGames" || tag === "icebreaker") {
      found.add("warmup");
    } else if (tag === "exercise") {
      found.add("exercise");
    } else if (tag === "game") {
      found.add("game");
    } else if (tag === "askFor") {
      found.add("audienceQuestion");
    } else if (tag === "concept") {
      found.add("concept");
    } else if (FORMAT_TAGS.has(tag)) {
      found.add("format");
    }
  }

  if (identifier && WARMUP_OVERRIDES.has(identifier)) {
    found.add("warmup");
  }

  return WORK_CATEGORIES.filter((category) => found.has(category));
}
