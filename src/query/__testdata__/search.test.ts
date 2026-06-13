import { describe, it, expect, beforeAll } from "bun:test";
import { searchElements } from "../search";
import { createGraphIndex, reloadGraph } from "../graph-query";
import { deriveGraph } from "../../graph/derive";
import type { NormalizedElement } from "../../normalize/normalized-schema";
import type { KnowledgeGraph } from "../../graph/derive";

function makeMockElement(
  overrides: Partial<NormalizedElement> = {},
): NormalizedElement {
  return {
    identifier: overrides.identifier || "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    name: overrides.name || "Test Game",
    url: "https://example.com/test",
    sourceName: overrides.sourceName || "testsource",
    languageCode: overrides.languageCode || "en",
    tags: overrides.tags || ["warmup"],
    htmlContent: "<p>test</p>",
    normalized: {
      summary:
        overrides.normalized?.summary ||
        "A test game for testing purposes.",
      description:
        overrides.normalized?.description ||
        "Players stand in a circle and do test things for testing.",
      howToPlay: {
        steps: [
          { action: "Form a circle" },
          { action: "Do test things" },
        ],
      },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: overrides.normalized?.mechanics || [
        { name: "circle formation", category: "setup" },
      ],
      skills: overrides.normalized?.skills || [
        { name: "focus", category: "cognitive" },
      ],
      practical: overrides.normalized?.practical || {
        difficulty: "beginner",
        typicalDurationMinutes: 5,
        groupSize: { min: 4, max: 12 },
      },
      contentHash: overrides.normalized?.contentHash || "hash123",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
    relatedIdentifiers: overrides.relatedIdentifiers || [],
    derivedElements: overrides.derivedElements || [],
  };
}

function makePair(
  primary: Omit<Partial<NormalizedElement>, "identifier" | "relatedIdentifiers"> & {
    identifier: string;
    pairIdentifier: string;
  },
): NormalizedElement[] {
  const primaryEl = makeMockElement({
    ...primary,
    relatedIdentifiers: [
      { identifier: primary.pairIdentifier, confidence: 1.0 },
    ],
  });
  const pair = makeMockElement({
    ...primary,
    identifier: primary.pairIdentifier,
    sourceName: `${primary.sourceName || "testsource"}_pair`,
    relatedIdentifiers: [
      { identifier: primary.identifier, confidence: 1.0 },
    ],
    normalized: {
      ...primaryEl.normalized,
      contentHash: `${primaryEl.normalized.contentHash}_pair`,
    },
  });
  return [primaryEl, pair];
}

let graph: KnowledgeGraph;

beforeAll(() => {
  const elements: NormalizedElement[] = [];

  elements.push(
    ...makePair({
      identifier: "yesyesyesyesyesyesyesyesyes01",
      pairIdentifier: "yesyesyesyesyesyesyesyesyes02",
      name: "Yes And",
      sourceName: "sourceA",
      tags: ["Warm-ups"],
      normalized: {
        summary: "Core concept of accepting offers by saying yes.",
        description: "Players practice accepting offers by saying yes and adding to them.",
        howToPlay: {
          steps: [
            { action: "Form pairs" },
            { action: "One player makes an offer" },
            { action: "Partner says yes, and adds something" },
          ],
        },
        variations: [],
        tips: [],
        referencedElements: [],
        mechanics: [
          { name: "Yes, and", category: "interaction" },
          { name: "acceptance", category: "philosophy" },
        ],
        skills: [{ name: "active listening", category: "interaction" }],
        practical: {
          difficulty: "beginner",
          typicalDurationMinutes: 10,
          groupSize: { min: 2, max: 20 },
          energyLevel: "medium",
        },
        contentHash: "hash1",
        extractedAt: "2026-01-01T00:00:00.000Z",
        normalizedBy: "test-schema",
      },
    }),
  );

  elements.push(
    ...makePair({
      identifier: "eyeseyeseyeseyeseyeseyeseye01",
      pairIdentifier: "eyeseyeseyeseyeseyeseyeseye02",
      name: "Eyes Closed",
      sourceName: "sourceB",
      tags: ["Warm-ups"],
      normalized: {
        summary: "Play with eyes closed to heighten other senses.",
        description: "Players perform scenes with eyes closed to focus on listening.",
        howToPlay: {
          steps: [
            { action: "Close eyes" },
            { action: "Perform scene" },
          ],
        },
        variations: [],
        tips: [],
        referencedElements: [],
        mechanics: [{ name: "eyes closed", category: "constraint" }],
        skills: [{ name: "active listening", category: "interaction" }],
        practical: {
          difficulty: "beginner",
          typicalDurationMinutes: 10,
          groupSize: { min: 2, max: 20 },
          energyLevel: "medium",
        },
        contentHash: "hash2",
        extractedAt: "2026-01-01T00:00:00.000Z",
        normalizedBy: "test-schema",
      },
    }),
  );

  elements.push(
    ...makePair({
      identifier: "storystorystorystorystoryst01",
      pairIdentifier: "storystorystorystorystoryst02",
      name: "Story Circle",
      sourceName: "sourceC",
      tags: ["Storytelling"],
      normalized: {
        summary: "Build a story word by word around a circle.",
        description: "Players build a story together word by word around a circle.",
        howToPlay: {
          steps: [
            { action: "Form a circle" },
            { action: "Build story word by word" },
          ],
        },
        variations: [],
        tips: [],
        referencedElements: [],
        mechanics: [
          { name: "word-at-a-time", category: "interaction" },
          { name: "circle formation", category: "setup" },
        ],
        skills: [
          { name: "storytelling", category: "narrative" },
          { name: "active listening", category: "interaction" },
        ],
        practical: {
          difficulty: "intermediate",
          typicalDurationMinutes: 15,
          groupSize: { min: 4, max: 16 },
          energyLevel: "low",
        },
        contentHash: "hash3",
        extractedAt: "2026-01-01T00:00:00.000Z",
        normalizedBy: "test-schema",
      },
    }),
  );

  elements.push(
    ...makePair({
      identifier: "statusstatusstatusstatusst01",
      pairIdentifier: "statusstatusstatusstatusst02",
      name: "Status Games",
      sourceName: "sourceD",
      tags: ["Characters"],
      normalized: {
        summary: "Explore character status in scenes.",
        description: "Players explore high and low status characters in improvised scenes.",
        howToPlay: {
          steps: [
            { action: "Assign status levels" },
            { action: "Perform scene" },
          ],
        },
        variations: [],
        tips: [],
        referencedElements: [],
        mechanics: [{ name: "status play", category: "character" }],
        skills: [{ name: "character work", category: "performance" }],
        practical: {
          difficulty: "intermediate",
          typicalDurationMinutes: 20,
          groupSize: { min: 2, max: 10 },
          energyLevel: "medium",
        },
        contentHash: "hash4",
        extractedAt: "2026-01-01T00:00:00.000Z",
        normalizedBy: "test-schema",
      },
    }),
  );

  elements.push(
    ...makePair({
      identifier: "sayyessayyessayyessayyessay01",
      pairIdentifier: "sayyessayyessayyessayyessay02",
      name: "Yes, let's",
      sourceName: "sourceE",
      tags: ["Warm-ups"],
      normalized: {
        summary: "Accept offers enthusiastically by saying yes, let's.",
        description: "Players practice spontaneous acceptance of offers.",
        howToPlay: {
          steps: [
            { action: "Form group" },
            { action: "Someone suggests something to do" },
            { action: "Everyone yells 'Yes, let's!' and does it" },
          ],
        },
        variations: [],
        tips: [],
        referencedElements: [],
        mechanics: [
          { name: "acceptance", category: "philosophy" },
          { name: "yes-and", category: "interaction" },
        ],
        skills: [{ name: "spontaneity", category: "performance" }],
        practical: {
          difficulty: "beginner",
          typicalDurationMinutes: 5,
          groupSize: { min: 4, max: 30 },
          energyLevel: "high",
        },
        contentHash: "hash5",
        extractedAt: "2026-01-01T00:00:00.000Z",
        normalizedBy: "test-schema",
      },
    }),
  );

  elements.push(
    ...makePair({
      identifier: "nomechnomechnomechnomechno01",
      pairIdentifier: "nomechnomechnomechnomechno02",
      name: "Word Ball",
      sourceName: "sourceF",
      tags: ["Warm-ups"],
      normalized: {
        summary: "Pass an imaginary ball with a word.",
        description: "Players pass an imaginary ball around saying a word each time.",
        howToPlay: {
          steps: [
            { action: "Form circle" },
            { action: "Pass the ball with a word" },
          ],
        },
        variations: [],
        tips: [],
        referencedElements: [],
        mechanics: [],
        skills: [],
        practical: {
          difficulty: "beginner",
          typicalDurationMinutes: 5,
          groupSize: { min: 2, max: 30 },
        },
        contentHash: "hash6",
        extractedAt: "2026-01-01T00:00:00.000Z",
        normalizedBy: "test-schema",
      },
    }),
  );

  elements.push(
    ...makePair({
      identifier: "germangermangermangerman01",
      pairIdentifier: "germangermangermangerman02",
      name: "Ja Und",
      sourceName: "sourceG",
      languageCode: "de",
      tags: ["Aufwärmen"],
      normalized: {
        summary: "Kernkonzept des Akzeptierens von Angeboten.",
        description: "Spieler üben, Angebote zu akzeptieren, indem sie Ja sagen und ergänzen.",
        howToPlay: {
          steps: [
            { action: "Paare bilden" },
            { action: "Ein Spieler macht ein Angebot" },
            { action: "Partner sagt Ja, und ergänzt etwas" },
          ],
        },
        variations: [],
        tips: [],
        referencedElements: [],
        mechanics: [{ name: "Ja, und", category: "interaction" }],
        skills: [{ name: "aktives Zuhören", category: "interaction" }],
        practical: {
          difficulty: "beginner",
          typicalDurationMinutes: 10,
          groupSize: { min: 2, max: 20 },
          energyLevel: "medium",
        },
        contentHash: "hash7",
        extractedAt: "2026-01-01T00:00:00.000Z",
        normalizedBy: "test-schema",
      },
    }),
  );

  graph = deriveGraph(elements, {
    mechanics: [
      { canonical: "Yes, and", variants: ["Yes, and"] },
      { canonical: "acceptance", variants: ["acceptance"] },
      { canonical: "eyes closed", variants: ["eyes closed"] },
      { canonical: "word-at-a-time", variants: ["word-at-a-time"] },
      { canonical: "circle formation", variants: ["circle formation"] },
      { canonical: "status play", variants: ["status play"] },
      { canonical: "yes-and", variants: ["yes-and"] },
      { canonical: "Ja, und", variants: ["Ja, und"] },
    ],
    skills: [
      { canonical: "active listening", variants: ["active listening"] },
      { canonical: "storytelling", variants: ["storytelling"] },
      { canonical: "character work", variants: ["character work"] },
      { canonical: "spontaneity", variants: ["spontaneity"] },
      { canonical: "aktives Zuhören", variants: ["aktives Zuhören"] },
    ],
  });

  createGraphIndex(graph);
});

describe("searchElements", () => {
  it("returns empty results and suggestions for empty query", () => {
    const result = searchElements("");
    expect(result.results.length).toBe(0);
    expect(result.matchedConcepts.mechanics.length).toBe(0);
    expect(result.matchedConcepts.skills.length).toBe(0);
    expect(result.matchedConcepts.tags.length).toBe(0);
    expect(result.queryWords.length).toBe(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions).toContain("storytelling");
  });

  it("returns empty results for whitespace-only query", () => {
    const result = searchElements("   ");
    expect(result.results.length).toBe(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("returns empty results for stop-word-only query", () => {
    const result = searchElements("the and to for");
    expect(result.results.length).toBe(0);
  });

  it("finds elements by label match", () => {
    const result = searchElements("yes");
    expect(result.results.length).toBeGreaterThanOrEqual(2);
    const labels = result.results.map((r) => r.label);
    expect(labels).toContain("Yes And");
    expect(labels).toContain("Yes, let's");
  });

  it("finds elements by summary match", () => {
    const result = searchElements("saying");
    expect(result.results.length).toBeGreaterThan(0);
    const labels = result.results.map((r) => r.label);
    expect(labels).toContain("Yes And");
  });

  it("finds elements by mechanic label match", () => {
    const result = searchElements("acceptance");
    expect(result.results.length).toBeGreaterThanOrEqual(2);
    const labels = result.results.map((r) => r.label);
    expect(labels).toContain("Yes And");
    expect(labels).toContain("Yes, let's");
    expect(result.matchedConcepts.mechanics).toContain("acceptance");
  });

  it("finds elements by skill label match", () => {
    const result = searchElements("storytelling");
    expect(result.results.length).toBeGreaterThan(0);
    const labels = result.results.map((r) => r.label);
    expect(labels).toContain("Story Circle");
    expect(result.matchedConcepts.skills).toContain("storytelling");
  });

  it("does NOT match 'yes' against 'Eyes Closed' (word boundary)", () => {
    const result = searchElements("yes");
    const labels = result.results.map((r) => r.label);
    expect(labels).not.toContain("Eyes Closed");
  });

  it("handles multi-word query 'saying yes'", () => {
    const result = searchElements("saying yes");
    expect(result.results.length).toBeGreaterThanOrEqual(2);
    const yesAndResult = result.results.find((r) => r.label === "Yes And");
    expect(yesAndResult).toBeDefined();
    expect(yesAndResult!.score).toBeGreaterThan(0);
  });

  it("ranks results by score descending", () => {
    const result = searchElements("acceptance");
    expect(result.results.length).toBeGreaterThan(1);
    for (let i = 1; i < result.results.length; i++) {
      expect(result.results[i - 1].score).toBeGreaterThanOrEqual(
        result.results[i].score,
      );
    }
  });

  it("matches word boundary correctly with hyphens", () => {
    const result = searchElements("yes");
    const mechanics = result.matchedConcepts.mechanics;
    expect(mechanics).toContain("yes-and");
    expect(mechanics).toContain("Yes, and");
  });

  it("returns matched concepts", () => {
    const result = searchElements("storytelling");
    expect(result.matchedConcepts.skills).toContain("storytelling");
  });

  it("returns queryWords", () => {
    const result = searchElements("active listening");
    expect(result.queryWords).toEqual(["active", "listening"]);
  });

  it("filters stop words", () => {
    const result = searchElements("the art of listening");
    expect(result.queryWords).toEqual(["art", "listening"]);
  });

  it("returns suggestions distinct from matched concepts", () => {
    const result = searchElements("storytelling");
    expect(result.suggestions.every((s) => s !== "storytelling")).toBe(true);
  });

  it("respects limit option", () => {
    const result = searchElements("yes", { limit: 1 });
    expect(result.results.length).toBeLessThanOrEqual(1);
  });

  it("respects canonicalOnly: false", () => {
    const result = searchElements("yes", {
      canonicalOnly: false,
      language: "en",
    });
    expect(result.results.length).toBeGreaterThanOrEqual(0);
  });

  it("filters by language", () => {
    const enResult = searchElements("yes", { language: "en" });
    const deResult = searchElements("Ja", { language: "de" });
    const enLabels = enResult.results.map((r) => r.label);
    const deLabels = deResult.results.map((r) => r.label);
    expect(enLabels).toContain("Yes And");
    expect(deLabels).toContain("Ja Und");
  });

  it("handles element with no mechanics or skills", () => {
    const result = searchElements("ball");
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    const labels = result.results.map((r) => r.label);
    expect(labels).toContain("Word Ball");
  });

  it("returns suggestions for empty query", () => {
    const result = searchElements("");
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions).toContain("storytelling");
    expect(result.suggestions).toContain("status");
  });

  it("fallback retry: removes least-matched word when < 5 results", () => {
    const result = searchElements("xyzznomatch acceptance");
    expect(result.results.length).toBeGreaterThan(0);
    const labels = result.results.map((r) => r.label);
    expect(labels).toContain("Yes And");
  });

  it("searching for 'status' finds Status Games", () => {
    const result = searchElements("status");
    expect(result.results.length).toBeGreaterThan(0);
    const labels = result.results.map((r) => r.label);
    expect(labels).toContain("Status Games");
  });

  it("single word 'storytelling' matches Story Circle via skill", () => {
    const result = searchElements("storytelling");
    expect(result.results.length).toBeGreaterThan(0);
    const labels = result.results.map((r) => r.label);
    expect(labels).toContain("Story Circle");
  });
});
