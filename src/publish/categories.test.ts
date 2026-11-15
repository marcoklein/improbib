import { describe, expect, it } from "bun:test";
import { deriveCategories } from "./categories";

describe("deriveCategories", () => {
  it("keeps the category the source tags state", () => {
    expect(deriveCategories(["exercise"])).toEqual(["exercise"]);
    expect(deriveCategories(["longform", "show"])).toEqual(["format"]);
    expect(deriveCategories(["askFor"])).toEqual(["audienceQuestion"]);
    expect(deriveCategories(["concept"])).toEqual(["concept"]);
  });

  it("returns the categories in a stable order", () => {
    expect(deriveCategories(["game", "warmup", "exercise"])).toEqual([
      "warmup",
      "exercise",
      "game",
    ]);
  });

  it("treats name games and icebreakers as warm-ups", () => {
    expect(deriveCategories(["nameGames", "game"])).toEqual([
      "warmup",
      "game",
    ]);
    expect(deriveCategories(["icebreaker", "game"])).toEqual([
      "warmup",
      "game",
    ]);
  });

  it("does not infer a warm-up from a short beginner game", () => {
    // Märchenreplay: the source calls it a game, not a warm-up. The old
    // "beginner + short + energetic" heuristic added `warmup` here.
    expect(deriveCategories(["game", "replay", "beginner"])).toEqual(["game"]);
  });

  it("keeps a curated warm-up that carries no warm-up tag", () => {
    // Freeze Tag (de): a classic opener, but the source only tags it as a game.
    expect(
      deriveCategories(
        ["game", "chainGames"],
        "b495669fefdc338b2baa16f4bc3ba761"
      )
    ).toEqual(["warmup", "game"]);
  });

  it("ignores an unknown identifier", () => {
    expect(deriveCategories(["game"], "not-a-known-identifier")).toEqual([
      "game",
    ]);
  });

  it("does not duplicate the warm-up when a tag already states it", () => {
    expect(
      deriveCategories(["warmup"], "b495669fefdc338b2baa16f4bc3ba761")
    ).toEqual(["warmup"]);
  });

  it("falls back to no category when nothing provides one", () => {
    expect(deriveCategories([])).toEqual([]);
  });
});
