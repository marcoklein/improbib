import { describe, expect, it } from "bun:test";
import { normalizedElementSchema, normalizedSourceSchema } from "../normalized-schema";

const ID = "012345678901234567890123456789ab";
const ID2 = "112345678901234567890123456789ab";
const ID3 = "212345678901234567890123456789ab";
const ID4 = "312345678901234567890123456789ab";
const ID5 = "412345678901234567890123456789ab";
const ID6 = "512345678901234567890123456789ab";
const ID7 = "612345678901234567890123456789ab";

function makeNorm(overrides: Record<string, any> = {}) {
  return {
    summary: "A one-sentence summary.",
    description: "A test game with enough characters to pass validation.",
    howToPlay: { steps: [{ action: "Do it" }] },
    variations: [],
    tips: [],
    referencedElements: [],
    mechanics: [],
    skills: [],
    practical: {},
    contentHash: "abc",
    extractedAt: "2026-01-01",
    normalizedBy: "test",
    ...overrides,
  };
}

describe("normalized schema", () => {
  it("validates a well-structured element", () => {
    const el = {
      identifier: ID, name: "Test", url: "https://example.com/test",
      sourceName: "improwiki", languageCode: "en" as const, tags: ["game"],
      htmlContent: "<p>test</p>",
      normalized: makeNorm(),
      derivedElements: [],
      relatedIdentifiers: [],
    };
    expect(normalizedElementSchema.safeParse(el).success).toBe(true);
  });

  it("validates a concept with null howToPlay", () => {
    const el = {
      identifier: ID, name: "Concept", url: "https://example.com/c",
      sourceName: "ircwiki", languageCode: "en" as const, tags: ["concept"],
      htmlContent: "<p>concept</p>",
      normalized: makeNorm({ howToPlay: null, tips: [{ text: "Tip", category: "general" as const }], skills: [{ name: "skill", category: "social" as const }] }),
      derivedElements: [], relatedIdentifiers: [],
    };
    expect(normalizedElementSchema.safeParse(el).success).toBe(true);
  });

  it("validates source-level output", () => {
    const source = {
      meta: { sourceName: "improwiki", elementCount: 1, derivedElementCount: 0, splitElementCount: 0, normalizedAt: "2026-01-01T00:00:00.000Z" },
      elements: [{
        identifier: ID, name: "Test", url: "https://example.com/test",
        sourceName: "improwiki", languageCode: "en" as const, tags: [],
        htmlContent: "<p>test</p>",
        normalized: makeNorm(),
        derivedElements: [], relatedIdentifiers: [],
      }],
    };
    expect(normalizedSourceSchema.safeParse(source).success).toBe(true);
  });

  it("validates element with all optional fields", () => {
    const el = {
      identifier: ID, name: "Full Game", url: "https://example.com/full",
      sourceName: "learnimprov", languageCode: "en" as const, tags: ["game"],
      htmlContent: "<p>full</p>", splitFrom: ID2,
      translationLinkEn: "https://example.com/en", translationLinkDe: "https://example.com/de",
      translationLinkEnIdentifier: ID3, translationLinkDeIdentifier: ID4,
      playerCountMin: 2, playerCountMax: 10,
      categories: ["warmup"], postTags: ["beginner"], lastModified: "2026-01-01",
      normalized: makeNorm({
        summary: "One sentence summary here.",
        description: "A fully specified game with all optional fields populated for testing.",
        howToPlay: { steps: [{ action: "Step one", role: "leader", constraint: "no talking" }, { action: "Step two" }] },
        variations: [{ name: "V", description: "D", differsBy: ["x"] }],
        tips: [{ text: "Tip", category: "pedagogical" as const }],
        referencedElements: [{ name: "Other", identifier: ID5, confidence: 0.9 }],
        mechanics: [{ name: "mech", originalName: "orig", category: "signal" as const }],
        skills: [{ name: "skill", originalName: "orig", category: "social" as const }],
        practical: { difficulty: "beginner" as const, typicalDurationMinutes: 10, energyLevel: "high" as const, groupSize: { min: 2, max: 10 }, requiresPreparation: false, suitableFor: ["warmup", "performance"] as ("warmup" | "performance")[] },
      }),
      derivedElements: [{ name: "Derived", description: "A variant", parentIdentifier: ID }],
      relatedIdentifiers: [{ identifier: ID6, confidence: 0.8 }, { identifier: ID7, confidence: 1.0 }],
    };
    expect(normalizedElementSchema.safeParse(el).success).toBe(true);
  });

  it("rejects short description", () => {
    const el = {
      identifier: ID, name: "Bad", url: "https://example.com/bad",
      sourceName: "improwiki", languageCode: "en" as const, tags: [],
      htmlContent: "<p>b</p>",
      normalized: makeNorm({ description: "Too short" }),
      derivedElements: [], relatedIdentifiers: [],
    };
    expect(normalizedElementSchema.safeParse(el).success).toBe(false);
  });

  it("rejects short summary", () => {
    const el = {
      identifier: ID, name: "Bad", url: "https://example.com/bad",
      sourceName: "improwiki", languageCode: "en" as const, tags: [],
      htmlContent: "<p>b</p>",
      normalized: makeNorm({ summary: "short" }),
      derivedElements: [], relatedIdentifiers: [],
    };
    expect(normalizedElementSchema.safeParse(el).success).toBe(false);
  });
});
