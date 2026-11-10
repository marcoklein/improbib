import { describe, expect, it } from "bun:test";
import { deriveCategories } from "./categories";
import type { NormalizedElement } from "../normalize/normalized-schema";

type Practical = NormalizedElement["normalized"]["practical"];

describe("deriveCategories", () => {
  it("keeps the category the source tags state", () => {
    expect(deriveCategories(["exercise"], {})).toEqual(["exercise"]);
    expect(deriveCategories(["longform", "show"], {})).toEqual(["format"]);
    expect(deriveCategories(["askFor"], {})).toEqual(["audienceQuestion"]);
    expect(deriveCategories(["concept"], {})).toEqual(["concept"]);
  });

  it("returns the categories in a stable order", () => {
    expect(deriveCategories(["game", "warmup", "exercise"], {})).toEqual([
      "warmup",
      "exercise",
      "game",
    ]);
  });

  it("treats name games and icebreakers as warm-ups", () => {
    expect(deriveCategories(["nameGames", "game"], {})).toEqual([
      "warmup",
      "game",
    ]);
    expect(deriveCategories(["icebreaker", "game"], {})).toEqual([
      "warmup",
      "game",
    ]);
  });

  it("falls back to no category when nothing provides one", () => {
    expect(deriveCategories([], {})).toEqual([]);
  });

  it("adds the warm-up for a short, simple, energetic work", () => {
    // Freeze Tag: beginner, energetic, no duration in the source.
    const freezeTag: Practical = { difficulty: "beginner", energyLevel: "high" };
    expect(deriveCategories(["game", "chainGames"], freezeTag)).toEqual([
      "warmup",
      "game",
    ]);
  });

  it("does not add the warm-up to a calm, long or advanced work", () => {
    expect(
      deriveCategories(["exercise"], { difficulty: "beginner", energyLevel: "low" })
    ).toEqual(["exercise"]);
    expect(
      deriveCategories(["exercise"], {
        difficulty: "beginner",
        energyLevel: "high",
        typicalDurationMinutes: 30,
      })
    ).toEqual(["exercise"]);
    expect(
      deriveCategories(["exercise"], { difficulty: "intermediate", energyLevel: "high" })
    ).toEqual(["exercise"]);
  });

  it("does not duplicate the warm-up when a tag already states it", () => {
    expect(deriveCategories(["warmup"], { difficulty: "beginner", energyLevel: "high" })).toEqual([
      "warmup",
    ]);
  });
});
