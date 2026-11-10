import type { NormalizedElement } from "../normalize/normalized-schema";
import { deriveSuitableFor } from "../query/suitable-for";

/**
 * The category shown as the first badge on a work page.
 *
 * A work can have several: Freeze Tag is a warm-up *and* a game, a long form
 * is a format. They answer different questions ("where does it fit?" and
 * "what is it?"), so an array is the honest shape.
 *
 * The category is derived, never extracted. Two reasons:
 *
 * - The source tags already carry it (`game`, `exercise`, `warmup`, `show`,
 *   `longform`, `icebreaker`, `askFor`, …).
 * - A derived value cannot drift from the tag it comes from, and a new
 *   category does not require another paid extraction.
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
const FORMAT_TAGS = new Set([
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
  practical: NormalizedElement["normalized"]["practical"]
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

  // Not every warm-up is tagged as one — Freeze Tag only carries "game" and
  // "chainGames", yet it is exactly what a group starts with. A short, simple,
  // energetic work is a warm-up in practice, which is the rule the rehearsal
  // planner already uses (`query/suitable-for.ts`).
  if (
    !found.has("warmup") &&
    deriveSuitableFor(
      practical.difficulty,
      practical.typicalDurationMinutes,
      practical.energyLevel
    ) === "warmup"
  ) {
    found.add("warmup");
  }

  return WORK_CATEGORIES.filter((category) => found.has(category));
}
