import { describe, expect, it } from "bun:test";
import { seedTranslationPairs, buildMatchBatches } from "../cross-source-matching";
import type { MatchCandidate } from "../llm-client";

describe("normalize pipeline", () => {
  it("seedTranslationPairs creates pairs from translation links", () => {
    const elements = [
      { identifier: "a1234567890123456789012345678a", translationLinkEnIdentifier: "b1234567890123456789012345678b" },
      { identifier: "b1234567890123456789012345678b" },
      { identifier: "c1234567890123456789012345678c", translationLinkDeIdentifier: "d1234567890123456789012345678d" },
    ] as any;

    const pairs = seedTranslationPairs(elements);
    expect(pairs.length).toBe(2);

    const pair1 = pairs.find(p => p.a === "a1234567890123456789012345678a");
    expect(pair1).toBeTruthy();
    expect(pair1!.confidence).toBe(1.0);
    expect(pair1!.b).toBe("b1234567890123456789012345678b");
  });

  it("buildMatchBatches splits by source", () => {
    const candidates: MatchCandidate[] = [
      { identifier: "a1", name: "Game A1", description: "desc", sourceName: "improwiki", languageCode: "en" },
      { identifier: "a2", name: "Game A2", description: "desc", sourceName: "improwiki", languageCode: "en" },
      { identifier: "b1", name: "Game B1", description: "desc", sourceName: "learnimprov", languageCode: "en" },
      { identifier: "c1", name: "Game C1", description: "desc", sourceName: "ircwiki", languageCode: "en" },
    ];

    const batches = buildMatchBatches(candidates, 100);
    // Should have 3 pairs: improwiki↔learnimprov, improwiki↔ircwiki, learnimprov↔ircwiki
    expect(batches.length).toBe(3);

    // Each batch should have elements from two different sources
    for (const batch of batches) {
      const sourceNames = new Set(batch.sourceA.map(c => c.sourceName));
      sourceNames.add(batch.sourceB[0]?.sourceName || "");
      expect(sourceNames.size).toBe(2);
    }
  });

  it("buildMatchBatches respects batch size", () => {
    const candidates: MatchCandidate[] = [];
    for (let i = 0; i < 150; i++) {
      candidates.push({ identifier: `a${i}`, name: `A${i}`, description: "desc", sourceName: "improwiki", languageCode: "en" });
      candidates.push({ identifier: `b${i}`, name: `B${i}`, description: "desc", sourceName: "learnimprov", languageCode: "en" });
    }

    const batches = buildMatchBatches(candidates, 50);
    // 150 improwiki × 150 learnimprov, batch size 50 → (150/50 rounded up) × (150/50 rounded up) = 3×3 = 9 batches
    // But round-up is: 3×3 = 9
    expect(batches.length).toBe(9);

    for (const batch of batches) {
      expect(batch.sourceA.length).toBeLessThanOrEqual(50);
      expect(batch.sourceB.length).toBeLessThanOrEqual(50);
    }
  });

  it("buildMatchBatches returns empty for single source", () => {
    const candidates: MatchCandidate[] = [
      { identifier: "a1", name: "A1", description: "desc", sourceName: "improwiki", languageCode: "en" },
      { identifier: "a2", name: "A2", description: "desc", sourceName: "improwiki", languageCode: "en" },
    ];

    const batches = buildMatchBatches(candidates, 100);
    expect(batches.length).toBe(0);
  });
});
