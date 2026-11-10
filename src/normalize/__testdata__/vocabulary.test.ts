import { describe, expect, it } from "bun:test";
import { collectTerms, applyCanonicalTerms } from "../vocabulary";
import { canonicalizeVocabulary } from "../vocab-cluster";
import type { NormalizedElement } from "../normalized-schema";
import type { VocabularyMap } from "../llm-client";

function makeElement(
  mechanics: string[] | { name: string; category?: string }[],
  skills: NormalizedElement["normalized"]["skills"],
  overrides: Partial<NormalizedElement> = {},
): NormalizedElement {
  const mechArr = Array.isArray(mechanics)
    ? mechanics.map(m => typeof m === "string" ? { name: m } : m)
    : [];

  return {
    identifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab",
    name: "Test",
    url: "https://example.com",
    sourceName: "improwiki",
    languageCode: "en",
    tags: [],
    htmlContent: "",
    normalized: {
      summary: "test summary text required",
      description: "A test game with enough characters for validation.",
      howToPlay: { steps: [{ action: "do it" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: mechArr.map(m => ({ name: m.name, category: m.category as any })),
      skills,
      practical: {},
      contentHash: "",
      extractedAt: "",
      normalizedBy: "",
    },
    derivedElements: [],
    relatedIdentifiers: [],
    ...overrides,
  };
}

describe("vocabulary", () => {
  it("collects unique terms", () => {
    const elements = [
      makeElement(["freeze", "tap out"], ["attention", "impulse"]),
      makeElement(["freeze", "stop signal"], ["attention", "impulse"]),
    ];

    const terms = collectTerms(elements);
    expect(terms.mechanics.sort()).toEqual(["freeze", "stop signal", "tap out"]);
    // Skills are ids from the fixed vocabulary — nothing left to cluster.
    expect(terms.skills).toEqual([]);
  });

  it("collects empty when no terms present", () => {
    const elements = [makeElement([], [])];
    const terms = collectTerms(elements);
    expect(terms.mechanics).toEqual([]);
    expect(terms.skills).toEqual([]);
  });

  it("applies canonical terms", () => {
    const elements = [
      makeElement(["freeze", "stop signal"], ["attention"]),
      makeElement(["tap out"], ["impulse"]),
    ];

    const vocab: VocabularyMap = {
      mechanics: [
        { canonical: "freeze signal", variants: ["freeze", "stop signal"], parent: null },
        { canonical: "tap out", variants: ["tap out"], parent: null },
      ],
      skills: [
        { canonical: "active listening", variants: ["listening", "active listening"], parent: null },
      ],
    };

    const result = applyCanonicalTerms(elements, vocab);

    expect(result[0].normalized.mechanics[0].name).toBe("freeze signal");
    expect(result[0].normalized.mechanics[0].originalName).toBe("freeze");
    expect(result[0].normalized.mechanics[1].name).toBe("freeze signal");
    expect(result[0].normalized.mechanics[1].originalName).toBe("stop signal");
    expect(result[1].normalized.mechanics[0].name).toBe("tap out");
    expect(result[1].normalized.mechanics[0].originalName).toBeUndefined();

    // Ids are the canonical form; the vocabulary map never rewrites them.
    expect(result[0].normalized.skills).toEqual(["attention"]);
    expect(result[1].normalized.skills).toEqual(["impulse"]);
  });

  it("does not modify already-canonical terms", () => {
    const elements = [makeElement(["tap out"], [])];
    const vocab: VocabularyMap = {
      mechanics: [{ canonical: "tap out", variants: ["tap out"], parent: null }],
      skills: [],
    };

    const result = applyCanonicalTerms(elements, vocab);
    expect(result[0].normalized.mechanics[0].name).toBe("tap out");
    expect(result[0].normalized.mechanics[0].originalName).toBeUndefined();
  });

  it("handles empty vocabulary", () => {
    const elements = [makeElement(["freeze"], ["attention"])];
    const vocab: VocabularyMap = { mechanics: [], skills: [] };

    const result = applyCanonicalTerms(elements, vocab);
    expect(result[0].normalized.mechanics[0].name).toBe("freeze");
    expect(result[0].normalized.mechanics[0].originalName).toBeUndefined();
    expect(result[0].normalized.skills).toEqual(["attention"]);
  });
});

describe("canonicalizeVocabulary", () => {
  it("clusters synonym mechanics via Jaccard token similarity", () => {
    const elements = [
      makeElement(["freeze signal"], []),
      makeElement(["freeze"], []),
    ];

    const result = canonicalizeVocabulary(elements);

    expect(result.mechanics.length).toBe(1);
    const cluster = result.mechanics[0];
    const allTerms = [cluster.canonical, ...cluster.variants].map(t => t.toLowerCase());
    expect(allTerms).toContain("freeze");
    expect(allTerms).toContain("freeze signal");
  });

  it("clusters inflection variants via Levenshtein", () => {
    const elements = [
      makeElement(["freeze"], []),
      makeElement(["freezing"], []),
    ];

    const result = canonicalizeVocabulary(elements);

    const cluster = result.mechanics.find(c =>
      c.variants.includes("freeze") || c.variants.includes("freezing") || c.canonical === "freeze" || c.canonical === "freezing",
    );
    expect(cluster).toBeDefined();
    const allTerms = [cluster!.canonical, ...cluster!.variants].map(t => t.toLowerCase());
    expect(allTerms.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps dissimilar mechanics separate", () => {
    const elements = [
      makeElement(["freeze signal"], []),
      makeElement(["tap out"], []),
      makeElement(["alphabet constraint"], []),
    ];

    const result = canonicalizeVocabulary(elements);

    expect(result.mechanics.length).toBeGreaterThanOrEqual(3);
  });

  it("picks most frequent term as canonical", () => {
    const elements = [
      makeElement(["freeze signal"], []),
      makeElement(["freeze signal"], []),
      makeElement(["freeze signal"], []),
      makeElement(["freeze"], []),
    ];

    const result = canonicalizeVocabulary(elements);

    const cluster = result.mechanics[0];
    expect(cluster.canonical).toBe("freeze signal");
    expect(cluster.variants.map(v => v.toLowerCase())).toContain("freeze");
  });

  it("handles empty input", () => {
    const result = canonicalizeVocabulary([]);
    expect(result.mechanics).toEqual([]);
    expect(result.skills).toEqual([]);
  });

  it("does not cluster skill ids", () => {
    const elements = [
      makeElement(["freeze"], ["attention"]),
      makeElement(["tap out"], ["impulse"]),
    ];

    const result = canonicalizeVocabulary(elements);
    expect(result.mechanics.length).toBe(2);
    expect(result.skills).toEqual([]);
  });

  it("seeds translation-linked German→English mechanics", () => {
    const deId = "dddddddddddddddddddddddddddddddd";
    const enId = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    const elements: NormalizedElement[] = [
      makeElement([{ name: "Einfrieren", category: "signal" }], [], {
        identifier: deId as any,
        languageCode: "de",
        sourceName: "improwiki",
        translationLinkEn: "https://example.com/en/freeze",
        translationLinkEnIdentifier: enId as any,
      }),
      makeElement([{ name: "freeze signal", category: "signal" }], [], {
        identifier: enId as any,
        languageCode: "en",
        sourceName: "improwiki",
      }),
    ];

    const result = canonicalizeVocabulary(elements);
    const freezeCluster = result.mechanics.find(c => c.canonical === "freeze signal");
    expect(freezeCluster).toBeDefined();
    expect(freezeCluster!.variants.map(v => v.toLowerCase())).toContain("einfrieren");
  });

  it("thesaurus overrides automated clustering", () => {
    const elements = [
      makeElement(["freeze signal"], []),
      makeElement(["freezing"], []),
      makeElement(["stop signal"], []),
    ];
    const thesaurus: VocabularyMap = {
      mechanics: [
        { canonical: "freeze mechanic", variants: ["freeze signal", "stop signal", "freezing"], parent: null },
      ],
      skills: [],
    };

    const result = canonicalizeVocabulary(elements, thesaurus);
    expect(result.mechanics.length).toBe(1);
    expect(result.mechanics[0].canonical).toBe("freeze mechanic");
  });

  it("preserves parent field from thesaurus", () => {
    const elements = [
      makeElement(["freeze"], []),
    ];
    const thesaurus: VocabularyMap = {
      mechanics: [
        { canonical: "freeze signal", variants: ["freeze"], parent: "interrupt signal" },
      ],
      skills: [],
    };

    const result = canonicalizeVocabulary(elements, thesaurus);
    expect(result.mechanics[0].parent).toBe("interrupt signal");
  });

  it("assigns parent: null to automated clusters", () => {
    const elements = [
      makeElement(["freeze signal"], []),
      makeElement(["freeze"], []),
    ];

    const result = canonicalizeVocabulary(elements);
    expect(result.mechanics[0].parent).toBeNull();
  });

  it("does not cluster constraint-suffixed mechanics via stop-word filtering", () => {
    const elements = [
      makeElement(["letter avoidance constraint"], []),
      makeElement(["dialogue constraint"], []),
      makeElement(["singing constraint"], []),
      makeElement(["alphabet constraint"], []),
    ];

    const result = canonicalizeVocabulary(elements);
    // Each constraint mechanic should be its own cluster since "constraint" is a stop word
    expect(result.mechanics.length).toBe(4);
  });
});
