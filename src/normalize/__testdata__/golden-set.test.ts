import { describe, expect, it } from "bun:test";
import TurndownService from "turndown";
import { goldenSet } from "./golden-set";
import type { GoldenEntry, GoldenOutput } from "./golden-set";

const turndown = new TurndownService({ headingStyle: "atx" });

/**
 * Converts HTML content to markdown using the same turndown config
 * as the main pipeline (src/scraping/shared/process-markdown.ts)
 */
function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
}

/**
 * The normalization function that any LLM-backed implementation
 * should replicate. In tests, this is replaced with a mock or
 * actual LLM call. The expected outputs in golden-set.ts are
 * the ground truth.
 */
export type NormalizeFn = (entry: GoldenEntry) => Promise<GoldenOutput>;

// ── Structural validations on the golden set itself ──

describe("golden set integrity", () => {
  it("contains exactly 15 test cases", () => {
    expect(goldenSet.length).toBe(15);
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

  it("howToPlay is null for concept pages, non-null for games/exercises", () => {
    for (const entry of goldenSet) {
      if (entry.id === "game-concept" || entry.id === "what-did-you-want") {
        expect(entry.expectedOutput.howToPlay).toBeNull();
      } else {
        expect(entry.expectedOutput.howToPlay).toBeTruthy();
        expect((entry.expectedOutput.howToPlay as string).length).toBeGreaterThan(10);
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
    expect(minimal.length).toBeGreaterThanOrEqual(1);
  });

  it("includes edge case: very long html content (> 2000 chars)", () => {
    const long = goldenSet.filter((e) => e.input.htmlContent.length > 2000);
    expect(long.length).toBeGreaterThanOrEqual(1);
  });

  it("includes edge case: empty tags array", () => {
    const emptyTags = goldenSet.filter((e) => e.input.tags.length === 0);
    expect(emptyTags.length).toBeGreaterThanOrEqual(1);
  });

  it("all inputs convert to valid markdown via turndown", () => {
    for (const entry of goldenSet) {
      const md = htmlToMarkdown(entry.input.htmlContent);
      expect(typeof md).toBe("string");
      // The ask-for edge case has blank htmlContent — markdown will be empty
      if (entry.id !== "what-did-you-want") {
        expect(md.length).toBeGreaterThan(0);
      }
    }
  });

  it("all entries have at least one expected output field populated", () => {
    for (const entry of goldenSet) {
      const o = entry.expectedOutput;
      const hasContent =
        o.description.length > 0 ||
        o.howToPlay !== null ||
        o.variations.length > 0 ||
        o.tips.length > 0;
      expect(hasContent).toBeTrue();
    }
  });

  it("referencedElements contains plausible game names when present", () => {
    for (const entry of goldenSet) {
      for (const ref of entry.expectedOutput.referencedElements) {
        // Referenced element names should be plain text, not URLs
        expect(ref).not.toContain("http");
        expect(ref).not.toContain("/");
        expect(ref.length).toBeGreaterThan(1);
      }
    }
  });
});

// ── Model comparison harness ──

/**
 * Run the given normalize function against all golden elements
 * and return per-element results with diff information.
 *
 * Usage:
 *   import { runGoldenBenchmark } from "./golden-set.test";
 *   const results = await runGoldenBenchmark(myNormalizeFn);
 */
export async function runGoldenBenchmark(
  normalize: NormalizeFn,
): Promise<
  {
    id: string;
    category: string;
    name: string;
    passed: boolean;
    failures: string[];
    output: GoldenOutput;
  }[]
> {
  const results = [];
  for (const entry of goldenSet) {
    const output = await normalize(entry);
    const failures: string[] = [];

    // Check description exists and is non-trivial
    if (!output.description || output.description.length < 10) {
      failures.push("description too short or missing");
    }

    // Check howToPlay consistency
    if (entry.expectedOutput.howToPlay === null && output.howToPlay !== null) {
      failures.push("howToPlay should be null but got a value");
    }
    if (entry.expectedOutput.howToPlay !== null && output.howToPlay === null) {
      failures.push("howToPlay should have a value but got null");
    }

    // Check variation count is reasonable
    if (
      Math.abs(
        output.variations.length - entry.expectedOutput.variations.length,
      ) > 3
    ) {
      failures.push(
        `variation count mismatch: expected ${entry.expectedOutput.variations.length}, got ${output.variations.length}`,
      );
    }

    results.push({
      id: entry.id,
      category: entry.category,
      name: entry.input.name,
      passed: failures.length === 0,
      failures,
      output,
    });
  }
  return results;
}

// ── Snapshot-like reference test (skipped by default) ──

/**
 * This test is marked as TODO because it requires an actual LLM to run.
 * It serves as documentation of how to validate a normalization implementation
 * against the golden set.
 *
 * To use with a real LLM:
 *   const normalize = async (entry: GoldenEntry): Promise<GoldenOutput> => {
 *     const markdown = htmlToMarkdown(entry.input.htmlContent);
 *     const prompt = buildExtractionPrompt(entry.input.name, markdown, entry.input.languageCode);
 *     const result = await callLlm(prompt); // your LLM client
 *     return result;
 *   };
 *   const results = await runGoldenBenchmark(normalize);
 *   console.table(results);
 */
describe.skip("llm extraction vs golden set", () => {
  it("all 15 elements extract correctly", async () => {
    // Placeholder — replace with actual LLM call
    const normalize: NormalizeFn = async (entry) => {
      throw new Error(
        `Not implemented: plug in your LLM client for ${entry.id}`,
      );
    };

    const results = await runGoldenBenchmark(normalize);
    const failures = results.filter((r) => !r.passed);
    if (failures.length > 0) {
      console.table(
        failures.map((f) => ({
          id: f.id,
          category: f.category,
          failures: f.failures.join("; "),
        })),
      );
    }
    expect(failures.length).toBe(0);
  });
});
