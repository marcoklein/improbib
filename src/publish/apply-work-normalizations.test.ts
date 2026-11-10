import { describe, expect, test } from "bun:test";
import type { NormalizedElement } from "../normalize/normalized-schema";
import { applyWorkNormalizations } from "./apply-work-normalizations";

function element(identifier: string, summary: string): NormalizedElement {
  return {
    identifier,
    name: `Element ${identifier}`,
    url: `https://example.com/${identifier}`,
    sourceName: "improwiki",
    languageCode: "de",
    tags: [],
    htmlContent: "<p>content</p>",
    normalized: {
      summary,
      description: `Description of ${identifier}`,
      howToPlay: { steps: [{ action: "Spielt das Spiel" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [],
      skills: [],
      practical: {},
      contentHash: `hash-${identifier}`,
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test",
    },
    derivedElements: [],
    relatedIdentifiers: [],
  };
}

const workBlock: NormalizedElement["normalized"] = {
  ...element("0".repeat(32), "Merged summary").normalized,
  summary: "Merged summary of the work",
  description: "One walkthrough shared by every source page of the work",
  contentHash: "work-hash",
};

describe("applyWorkNormalizations", () => {
  test("replaces the block of every work member", () => {
    const a = "a".repeat(32);
    const b = "b".repeat(32);
    const c = "c".repeat(32);

    const result = applyWorkNormalizations(
      [element(a, "Page A"), element(b, "Page B"), element(c, "Page C")],
      [{ memberIds: [a, b], normalized: workBlock }]
    );

    expect(result[0].normalized).toEqual(workBlock);
    expect(result[1].normalized).toEqual(workBlock);
    // An element outside the merge keeps its own extraction.
    expect(result[2].normalized.summary).toBe("Page C");
  });

  test("ignores identifiers that are not in the elements", () => {
    const a = "a".repeat(32);

    const result = applyWorkNormalizations(
      [element(a, "Page A")],
      [
        {
          memberIds: [a, "f".repeat(32)],
          normalized: workBlock,
        },
      ]
    );

    expect(result).toHaveLength(1);
    expect(result[0].normalized).toEqual(workBlock);
  });
});
