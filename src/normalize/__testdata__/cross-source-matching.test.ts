import { describe, expect, it } from "bun:test";
import { seedTranslationPairs, buildMatchBatches } from "../cross-source-matching";
import type { MatchCandidate } from "../llm-client";

describe("cross-source matching", () => {
  it("seeds translation-link pairs", () => {
    const elements = [
      { identifier: "a1234567890123456789012345678a", translationLinkEnIdentifier: "b1234567890123456789012345678b" },
      { identifier: "b1234567890123456789012345678b", translationLinkDeIdentifier: "a1234567890123456789012345678a" },
      { identifier: "c1234567890123456789012345678c" },
    ] as any;

    const pairs = seedTranslationPairs(elements);
    // Both elements describe the same pair (a↔b), deduplicated to 1 unique pair
    expect(pairs.length).toBe(1);
    const pair = pairs[0];
    expect(pair.confidence).toBe(1.0);
    expect(pair.a).toBe("a1234567890123456789012345678a");
    expect(pair.b).toBe("b1234567890123456789012345678b");
  });

  it("builds batches across sources", () => {
    const candidates: MatchCandidate[] = [
      { identifier: "a1", name: "A1", description: "desc", sourceName: "improwiki", languageCode: "en" },
      { identifier: "a2", name: "A2", description: "desc", sourceName: "improwiki", languageCode: "en" },
      { identifier: "b1", name: "B1", description: "desc", sourceName: "ircwiki", languageCode: "en" },
    ];

    const batches = buildMatchBatches(candidates, 2);
    expect(batches.length).toBeGreaterThan(0);
    expect(batches[0].sourceA.length).toBeGreaterThan(0);
    expect(batches[0].sourceB.length).toBeGreaterThan(0);
  });

  it("does not match within same source", () => {
    const candidates: MatchCandidate[] = [
      { identifier: "a1", name: "A1", description: "desc", sourceName: "improwiki", languageCode: "en" },
      { identifier: "a2", name: "A2", description: "desc", sourceName: "improwiki", languageCode: "en" },
    ];

    const batches = buildMatchBatches(candidates, 10);
    expect(batches.length).toBe(0);
  });
});
