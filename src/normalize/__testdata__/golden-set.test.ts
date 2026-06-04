import { describe, expect, it } from "bun:test";
import type { GoldenEntry, GoldenOutput } from "./golden-set";
import { goldenSet } from "./golden-set";

describe("golden set integrity", () => {
  it("contains exactly 11 test cases", () => {
    expect(goldenSet.length).toBe(11);
  });

  it("all entries have unique IDs", () => {
    const ids = goldenSet.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all categories are represented", () => {
    const categories = new Set(goldenSet.map((e) => e.category));
    expect(categories.size).toBeGreaterThanOrEqual(7);
  });

  it("all expected outputs have valid description", () => {
    for (const entry of goldenSet) {
      expect(entry.expectedOutput.description.length).toBeGreaterThanOrEqual(20);
      expect(entry.expectedOutput.description).toBeTruthy();
    }
  });

  it("howToPlay is null for concept pages and index pages, non-null for games/exercises/show formats", () => {
    for (const entry of goldenSet) {
      if (entry.id === "game-concept" || entry.id === "what-did-you-want" || entry.id === "tag-games-index" || entry.id === "vocabulary-clusters") {
        expect(entry.expectedOutput.howToPlay).toBeNull();
      } else {
        expect(entry.expectedOutput.howToPlay).toBeTruthy();
        expect(entry.expectedOutput.howToPlay!.steps.length).toBeGreaterThan(0);
      }
    }
  });

  it("covers all 3 source types", () => {
    const sources = new Set(goldenSet.map((e) => e.input.sourceName));
    expect(sources.has("improwiki")).toBeTrue();
    expect(sources.has("learnimprov")).toBeTrue();
    expect(sources.has("ircwiki")).toBeTrue();
  });

  it("includes both English and German content", () => {
    const langs = new Set(goldenSet.map((e) => e.input.languageCode));
    expect(langs.has("en")).toBeTrue();
    expect(langs.has("de")).toBeTrue();
  });

  it("includes edge case: minimal html content (< 100 chars)", () => {
    const minimal = goldenSet.filter((e) => e.input.htmlContent.length < 100);
    expect(minimal.length).toBeGreaterThanOrEqual(2);
  });

  it("includes edge case: very long html content (> 2000 chars)", () => {
    const long = goldenSet.filter((e) => e.input.htmlContent.length > 2000);
    expect(long.length).toBeGreaterThanOrEqual(1);
  });

  it("includes edge case: empty tags array", () => {
    const emptyTags = goldenSet.filter((e) => e.input.tags.length === 0);
    expect(emptyTags.length).toBeGreaterThanOrEqual(1);
  });

  it("all entries have at least one expected output field populated", () => {
    for (const entry of goldenSet) {
      const o = entry.expectedOutput;
      const hasContent =
        o.description.length > 0 ||
        o.howToPlay !== null ||
        o.variations.length > 0 ||
        o.tips.length > 0 ||
        o.mechanics.length > 0;
      expect(hasContent).toBeTrue();
    }
  });

  it("referencedElements contains plausible names when present", () => {
    for (const entry of goldenSet) {
      for (const ref of entry.expectedOutput.referencedElements) {
        expect(ref.name).not.toContain("http");
        expect(ref.name).not.toContain("/");
        expect(ref.name.length).toBeGreaterThan(1);
      }
    }
  });

  it("show format has non-null howToPlay with steps", () => {
    const decon = goldenSet.find((e) => e.id === "deconstruction");
    expect(decon).toBeTruthy();
    expect(decon!.expectedOutput.howToPlay).toBeTruthy();
    expect(decon!.expectedOutput.howToPlay!.steps.length).toBeGreaterThan(1);
  });

  it("multi-element parent has null howToPlay", () => {
    const parent = goldenSet.find((e) => e.id === "tag-games-index");
    expect(parent).toBeTruthy();
    expect(parent!.expectedOutput.howToPlay).toBeNull();
  });

  it("multi-element children have non-null howToPlay", () => {
    const child = goldenSet.find((e) => e.id === "alphabet-tag");
    expect(child).toBeTruthy();
    expect(child!.expectedOutput.howToPlay).toBeTruthy();
    expect(child!.expectedOutput.howToPlay!.steps.length).toBeGreaterThan(0);
  });
});
