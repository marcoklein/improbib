import { describe, expect, it } from "bun:test";
import { normalizedElementSchema, normalizedSourceSchema } from "../normalized-schema";

const ID = "012345678901234567890123456789ab";
const ID2 = "112345678901234567890123456789ab";
const ID3 = "212345678901234567890123456789ab";
const ID4 = "312345678901234567890123456789ab";
const ID5 = "412345678901234567890123456789ab";
const ID6 = "512345678901234567890123456789ab";
const ID7 = "612345678901234567890123456789ab";

describe("normalized schema", () => {
  it("validates a well-structured element", () => {
    const el = {
      identifier: ID,
      name: "Test Game",
      url: "https://example.com/test",
      sourceName: "improwiki",
      languageCode: "en" as const,
      tags: ["game"],
      htmlContent: "<p>test</p>",
      normalized: {
        description: "A test game with enough characters to pass validation.",
        howToPlay: { steps: [{ action: "Form a circle" }, { action: "Start playing" }] },
        variations: [],
        tips: [],
        referencedElements: [],
        mechanics: [],
        skills: [],
        practical: {},
        contentHash: "abc123",
        extractedAt: "2026-01-01T00:00:00.000Z",
        normalizedBy: "test",
      },
      derivedElements: [],
      relatedIdentifiers: [],
    };

    const result = normalizedElementSchema.safeParse(el);
    expect(result.success).toBe(true);
  });

  it("validates an element with all optional fields", () => {
    const el = {
      identifier: ID,
      name: "Full Game",
      url: "https://example.com/full",
      sourceName: "learnimprov",
      languageCode: "en" as const,
      tags: ["game", "warmup"],
      htmlContent: "<p>full content</p>",
      splitFrom: ID2,
      translationLinkEn: "https://example.com/en",
      translationLinkDe: "https://example.com/de",
      translationLinkEnIdentifier: ID3,
      translationLinkDeIdentifier: ID4,
      playerCountMin: 2,
      playerCountMax: 10,
      categories: ["warmup", "circle"],
      postTags: ["beginner"],
      lastModified: "2026-01-01",
      normalized: {
        description: "A fully specified game with all optional fields populated for testing.",
        howToPlay: {
          steps: [
            { action: "Step one", role: "leader", constraint: "no talking" },
            { action: "Step two" },
          ],
        },
        variations: [
          { name: "Variant A", description: "A different version", differsBy: ["no constraint"] },
        ],
        tips: [
          { text: "A teaching tip", category: "pedagogical" as const },
          { text: "A staging tip", category: "staging" as const },
        ],
        referencedElements: [
          { name: "Other Game", identifier: ID5, confidence: 0.9 },
          { name: "Unknown Game" },
        ],
        mechanics: [
          { name: "freeze signal", originalName: "stop", category: "signal" as const },
          { name: "tap out", category: "interaction" as const },
        ],
        skills: [
          { name: "active listening", originalName: "listening", category: "social" as const },
          { name: "physicality", category: "physical" as const },
        ],
        practical: {
          difficulty: "beginner" as const,
          typicalDurationMinutes: 10,
          energyLevel: "high" as const,
          groupSize: { min: 2, max: 10 },
          requiresPreparation: false,
          suitableFor: ["warmup", "performance"] as ("warmup" | "performance")[],
        },
        contentHash: "abc123",
        extractedAt: "2026-01-01T00:00:00.000Z",
        normalizedBy: "test",
      },
      derivedElements: [
        { name: "Derived Variant", description: "A distinct variant", parentIdentifier: ID },
      ],
      relatedIdentifiers: [
        { identifier: ID6, confidence: 0.8 },
        { identifier: ID7, confidence: 1.0 },
      ],
    };

    const result = normalizedElementSchema.safeParse(el);
    expect(result.success).toBe(true);
  });

  it("validates a concept element with null howToPlay", () => {
    const el = {
      identifier: ID,
      name: "Status",
      url: "https://example.com/status",
      sourceName: "ircwiki",
      languageCode: "en" as const,
      tags: ["concept"],
      htmlContent: "<p>A concept</p>",
      normalized: {
        description: "Status is an improv concept about power dynamics between characters.",
        howToPlay: null,
        variations: [],
        tips: [{ text: "A tip", category: "general" as const }],
        referencedElements: [],
        mechanics: [],
        skills: [{ name: "status play", category: "social" as const }],
        practical: {},
        contentHash: "abc123",
        extractedAt: "2026-01-01T00:00:00.000Z",
        normalizedBy: "test",
      },
      derivedElements: [],
      relatedIdentifiers: [],
    };

    const result = normalizedElementSchema.safeParse(el);
    expect(result.success).toBe(true);
  });

  it("rejects short description", () => {
    const el = {
      identifier: ID,
      name: "Bad",
      url: "https://example.com/bad",
      sourceName: "improwiki",
      languageCode: "en" as const,
      tags: [],
      htmlContent: "<p>b</p>",
      normalized: {
        description: "Too short",
        howToPlay: null,
        variations: [],
        tips: [],
        referencedElements: [],
        mechanics: [],
        skills: [],
        practical: {},
        contentHash: "abc",
        extractedAt: "2026-01-01",
      },
      derivedElements: [],
      relatedIdentifiers: [],
    };

    const result = normalizedElementSchema.safeParse(el);
    expect(result.success).toBe(false);
  });

  it("validates source-level output", () => {
    const source = {
      meta: {
        sourceName: "improwiki",
        elementCount: 1,
        derivedElementCount: 0,
        splitElementCount: 0,
        normalizedAt: "2026-01-01T00:00:00.000Z",
      },
      elements: [{
        identifier: ID,
        name: "Test",
        url: "https://example.com/test",
        sourceName: "improwiki",
        languageCode: "en" as const,
        tags: [],
        htmlContent: "<p>test</p>",
        normalized: {
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
        },
        derivedElements: [],
        relatedIdentifiers: [],
      }],
    };

    const result = normalizedSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });
});
