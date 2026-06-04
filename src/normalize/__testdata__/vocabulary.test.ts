import { describe, expect, it } from "bun:test";
import { collectTerms, applyCanonicalTerms } from "../vocabulary";
import type { NormalizedElement } from "../normalized-schema";
import type { VocabularyMap } from "../llm-client";

function makeElement(mechanics: string[], skills: string[]): NormalizedElement {
  return {
    identifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab",
    name: "Test",
    url: "https://example.com",
    sourceName: "improwiki",
    languageCode: "en",
    tags: [],
    htmlContent: "",
    normalized: {
      description: "A test game with enough characters for validation.",
      howToPlay: { steps: [{ action: "do it" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: mechanics.map(m => ({ name: m })),
      skills: skills.map(s => ({ name: s })),
      practical: {},
      contentHash: "",
      extractedAt: "",
    },
    derivedElements: [],
    relatedIdentifiers: [],
  };
}

describe("vocabulary", () => {
  it("collects unique terms", () => {
    const elements = [
      makeElement(["freeze", "tap out"], ["listening", "spontaneity"]),
      makeElement(["freeze", "stop signal"], ["active listening", "listening"]),
    ];

    const terms = collectTerms(elements);
    expect(terms.mechanics.sort()).toEqual(["freeze", "stop signal", "tap out"]);
    expect(terms.skills.sort()).toEqual(["active listening", "listening", "spontaneity"]);
  });

  it("collects empty when no terms present", () => {
    const elements = [makeElement([], [])];
    const terms = collectTerms(elements);
    expect(terms.mechanics).toEqual([]);
    expect(terms.skills).toEqual([]);
  });

  it("applies canonical terms", () => {
    const elements = [
      makeElement(["freeze", "stop signal"], ["listening"]),
      makeElement(["tap out"], ["active listening"]),
    ];

    const vocab: VocabularyMap = {
      mechanics: [
        { canonical: "freeze signal", variants: ["freeze", "stop signal"] },
        { canonical: "tap out", variants: ["tap out"] },
      ],
      skills: [
        { canonical: "active listening", variants: ["listening", "active listening"] },
      ],
    };

    const result = applyCanonicalTerms(elements, vocab);

    expect(result[0].normalized.mechanics[0].name).toBe("freeze signal");
    expect(result[0].normalized.mechanics[0].originalName).toBe("freeze");
    expect(result[0].normalized.mechanics[1].name).toBe("freeze signal");
    expect(result[0].normalized.mechanics[1].originalName).toBe("stop signal");
    expect(result[1].normalized.mechanics[0].name).toBe("tap out");
    expect(result[1].normalized.mechanics[0].originalName).toBeUndefined();

    expect(result[0].normalized.skills[0].name).toBe("active listening");
    expect(result[0].normalized.skills[0].originalName).toBe("listening");
    expect(result[1].normalized.skills[0].name).toBe("active listening");
    expect(result[1].normalized.skills[0].originalName).toBeUndefined();
  });

  it("does not modify already-canonical terms", () => {
    const elements = [makeElement(["tap out"], [])];
    const vocab: VocabularyMap = {
      mechanics: [{ canonical: "tap out", variants: ["tap out"] }],
      skills: [],
    };

    const result = applyCanonicalTerms(elements, vocab);
    expect(result[0].normalized.mechanics[0].name).toBe("tap out");
    expect(result[0].normalized.mechanics[0].originalName).toBeUndefined();
  });

  it("handles empty vocabulary", () => {
    const elements = [makeElement(["freeze"], ["listening"])];
    const vocab: VocabularyMap = { mechanics: [], skills: [] };

    const result = applyCanonicalTerms(elements, vocab);
    expect(result[0].normalized.mechanics[0].name).toBe("freeze");
    expect(result[0].normalized.mechanics[0].originalName).toBeUndefined();
    expect(result[0].normalized.skills[0].name).toBe("listening");
  });
});
