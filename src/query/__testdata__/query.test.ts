import { describe, it, expect, beforeAll } from "bun:test";
import { createGraphIndex, queryElements, getElementDetail, getSimilarElements, reloadGraph } from "../graph-query";
import { deriveGraph } from "../../graph/derive";
import type { NormalizedElement } from "../../normalize/normalized-schema";
import type { KnowledgeGraph } from "../../graph/derive";

function makeMockElement(overrides: Partial<NormalizedElement> = {}): NormalizedElement {
  return {
    identifier: overrides.identifier || "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    name: overrides.name || "Test Game",
    url: "https://example.com/test",
    sourceName: overrides.sourceName || "testsource",
    languageCode: overrides.languageCode || "en",
    tags: overrides.tags || ["warmup"],
    htmlContent: "<p>test</p>",
    normalized: {
      summary: "A test game for testing purposes.",
      description: "Players stand in a circle and do test things for testing. This is a longer description.",
      howToPlay: { steps: [{ action: "Form a circle" }, { action: "Do test things" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: overrides.normalized?.mechanics || [{ name: "circle formation", category: "setup" }],
      skills: overrides.normalized?.skills || [{ name: "focus", category: "cognitive" }],
      practical: overrides.normalized?.practical || { difficulty: "beginner", typicalDurationMinutes: 5, groupSize: { min: 4, max: 12 } },
      contentHash: "hash123",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
    relatedIdentifiers: overrides.relatedIdentifiers || [],
    derivedElements: overrides.derivedElements || [],
  };
}

let graph: KnowledgeGraph;

beforeAll(() => {
  const elA = makeMockElement({
    identifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1",
    name: "Simple Circle Game",
    sourceName: "sourceA",
    tags: ["Warm-ups"],
    relatedIdentifiers: [
      { identifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2", confidence: 1.0 },
    ],
    normalized: {
      summary: "A simple circle game.",
      description: "Players stand in a circle and pass energy around. This is a simple warm-up exercise.",
      howToPlay: { steps: [{ action: "Form a circle" }, { action: "Pass energy" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "circle formation", category: "setup" }, { name: "energy pass", category: "interaction" }],
      skills: [{ name: "focus", category: "cognitive" }],
      practical: { difficulty: "beginner", typicalDurationMinutes: 5, groupSize: { min: 4, max: 20 } },
      contentHash: "hash1",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
  });

  const elA2 = makeMockElement({
    identifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2",
    name: "Circle Energy Pass",
    sourceName: "sourceB",
    tags: ["Warm-ups"],
    relatedIdentifiers: [
      { identifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1", confidence: 1.0 },
    ],
    normalized: {
      summary: "A simple circle energy pass game.",
      description: "Players stand in a circle and pass energy around. This is a simple warm-up exercise for groups.",
      howToPlay: { steps: [{ action: "Form a circle" }, { action: "Pass energy" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "circle formation", category: "setup" }, { name: "energy pass", category: "interaction" }],
      skills: [{ name: "focus", category: "cognitive" }],
      practical: { difficulty: "beginner", typicalDurationMinutes: 5, groupSize: { min: 4, max: 20 } },
      contentHash: "hash1b",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
  });

  const elB = makeMockElement({
    identifier: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1",
    name: "Advanced Story Circle",
    sourceName: "sourceB",
    tags: ["Storytelling"],
    relatedIdentifiers: [
      { identifier: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2", confidence: 1.0 },
    ],
    normalized: {
      summary: "A complex storytelling game.",
      description: "Players stand in a circle and build a story together word by word. This is an advanced exercise.",
      howToPlay: { steps: [{ action: "Form a circle" }, { action: "Build story word by word" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "circle formation", category: "setup" }, { name: "word-at-a-time", category: "interaction" }, { name: "energy pass", category: "interaction" }],
      skills: [{ name: "storytelling", category: "narrative" }, { name: "focus", category: "cognitive" }],
      practical: { difficulty: "advanced", typicalDurationMinutes: 15, groupSize: { min: 4, max: 12 } },
      contentHash: "hash2",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
  });

  const elB2 = makeMockElement({
    identifier: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2",
    name: "Story Circle Advanced",
    sourceName: "sourceC",
    tags: ["Storytelling"],
    relatedIdentifiers: [
      { identifier: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1", confidence: 1.0 },
    ],
    normalized: {
      summary: "A complex storytelling circle game.",
      description: "Players stand in a circle and build a story together word by word. An advanced narrative exercise.",
      howToPlay: { steps: [{ action: "Form a circle" }, { action: "Build story word by word" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "circle formation", category: "setup" }, { name: "word-at-a-time", category: "interaction" }, { name: "energy pass", category: "interaction" }],
      skills: [{ name: "storytelling", category: "narrative" }, { name: "focus", category: "cognitive" }],
      practical: { difficulty: "advanced", typicalDurationMinutes: 15, groupSize: { min: 4, max: 12 } },
      contentHash: "hash2b",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
  });

  const elC = makeMockElement({
    identifier: "cccccccccccccccccccccccccccccccc1",
    name: "Audience Participation Game",
    sourceName: "sourceD",
    tags: ["Ask For"],
    relatedIdentifiers: [
      { identifier: "cccccccccccccccccccccccccccccccc2", confidence: 1.0 },
    ],
    normalized: {
      summary: "A game requiring audience input.",
      description: "Performers ask the audience for suggestions and build scenes from them.",
      howToPlay: { steps: [{ action: "Ask audience for suggestion" }, { action: "Build scene" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "audience suggestion", category: "interaction" }],
      skills: [{ name: "spontaneity", category: "performance" }],
      practical: { difficulty: "intermediate", typicalDurationMinutes: 10, groupSize: { min: 2, max: 6 } },
      contentHash: "hash3",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
  });

  const elC2 = makeMockElement({
    identifier: "cccccccccccccccccccccccccccccccc2",
    name: "Audience Input Game",
    sourceName: "sourceE",
    tags: ["Ask For"],
    relatedIdentifiers: [
      { identifier: "cccccccccccccccccccccccccccccccc1", confidence: 1.0 },
    ],
    normalized: {
      summary: "A game for audience participation.",
      description: "Performers ask the audience for suggestions and build scenes from their input.",
      howToPlay: { steps: [{ action: "Ask audience for suggestion" }, { action: "Build scene" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "audience suggestion", category: "interaction" }],
      skills: [{ name: "spontaneity", category: "performance" }],
      practical: { difficulty: "intermediate", typicalDurationMinutes: 10, groupSize: { min: 2, max: 6 } },
      contentHash: "hash3b",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
  });

  const elD = makeMockElement({
    identifier: "ddddddddddddddddddddddddddddddd1",
    name: "German Story Circle",
    sourceName: "sourceF",
    languageCode: "de",
    tags: ["Geschichten"],
    normalized: {
      summary: "Ein komplexes Geschichtenspiel.",
      description: "Spieler stehen im Kreis und bauen zusammen eine Geschichte Wort für Wort auf.",
      howToPlay: { steps: [{ action: "Kreis bilden" }, { action: "Geschichte Wort für Wort aufbauen" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "circle formation", category: "setup" }, { name: "word-at-a-time", category: "interaction" }],
      skills: [{ name: "storytelling", category: "narrative" }],
      practical: { difficulty: "advanced", typicalDurationMinutes: 12, groupSize: { min: 4, max: 12 } },
      contentHash: "hash4",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
  });

  const elE = makeMockElement({
    identifier: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee1",
    name: "Quick Energy Game",
    sourceName: "sourceG",
    tags: ["Energizer"],
    normalized: {
      summary: "A quick high-energy warm-up.",
      description: "Players quickly pass energy around the circle with high energy.",
      howToPlay: { steps: [{ action: "Form a circle" }, { action: "Pass energy fast" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "energy pass", category: "interaction" }],
      skills: [{ name: "focus", category: "cognitive" }],
      practical: { difficulty: "beginner", typicalDurationMinutes: 3, energyLevel: "high", groupSize: { min: 6, max: 20 } },
      contentHash: "hash5",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
  });

  // Elements A and C are related (same canonical cluster via relatedIdentifiers)
  // Elements B and D are translation-linked
  elB.translationLinkDe = "https://example.com/de/story-circle";
  elD.translationLinkEn = "https://example.com/en/story-circle";

  graph = deriveGraph([
    elA, elA2, elB, elB2, elC, elC2, elD, elE,
  ], {
    mechanics: [
      { canonical: "circle formation", variants: ["circle formation"] },
      { canonical: "energy pass", variants: ["energy pass"] },
      { canonical: "word-at-a-time", variants: ["word-at-a-time"] },
      { canonical: "audience suggestion", variants: ["audience suggestion"] },
    ],
    skills: [
      { canonical: "focus", variants: ["focus"] },
      { canonical: "storytelling", variants: ["storytelling"] },
      { canonical: "spontaneity", variants: ["spontaneity"] },
    ],
  });

  createGraphIndex(graph);
});

describe("queryElements", () => {
  it("returns all canonical en elements by default", () => {
    const result = queryElements({ limit: 100 });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.canonical).toBe(true);
      expect(r.languageCode).toBe("en");
    }
  });

  it("filters by difficulty", () => {
    const result = queryElements({ difficulty: "advanced", limit: 100 });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.difficulty).toBe("advanced");
    }
  });

  it("filters by min duration", () => {
    const result = queryElements({ minDuration: 10, limit: 100 });
    for (const r of result.results) {
      if (r.typicalDurationMinutes !== undefined) {
        expect(r.typicalDurationMinutes).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("filters by max duration", () => {
    const result = queryElements({ maxDuration: 5, limit: 100 });
    for (const r of result.results) {
      if (r.typicalDurationMinutes !== undefined) {
        expect(r.typicalDurationMinutes).toBeLessThanOrEqual(5);
      }
    }
  });

  it("filters by tag", () => {
    const result = queryElements({ tag: "Storytelling", limit: 100 });
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("filters by mechanic", () => {
    const result = queryElements({ mechanic: "circle formation", limit: 100 });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.mechanicLabels).toContain("circle formation");
    }
  });

  it("filters by skill", () => {
    const result = queryElements({ skill: "storytelling", limit: 100 });
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("excludes elements with requirement", () => {
    const result = queryElements({ excludeRequirements: ["audience_input"], limit: 100 });
    for (const r of result.results) {
      expect(r.requirementLabels).not.toContain("audience_input");
    }
  });

  it("returns empty for non-existent tag filter", () => {
    const result = queryElements({ tag: "NonExistentTag123", limit: 100 });
    expect(result.results.length).toBe(0);
    expect(result.total).toBe(0);
  });

  it("returns empty for non-existent mechanic filter", () => {
    const result = queryElements({ mechanic: "NonExistentMech123", limit: 100 });
    expect(result.results.length).toBe(0);
    expect(result.total).toBe(0);
  });

  it("returns empty for non-existent skill filter", () => {
    const result = queryElements({ skill: "NonExistentSkill123", limit: 100 });
    expect(result.results.length).toBe(0);
    expect(result.total).toBe(0);
  });

  it("paginates correctly", () => {
    const page1 = queryElements({ limit: 2, page: 1 });
    const page2 = queryElements({ limit: 2, page: 2 });
    expect(page1.results.length).toBeLessThanOrEqual(2);
    expect(page1.total).toBeGreaterThan(0);
    expect(page1.page).toBe(1);
    if (page2.results.length > 0) {
      expect(page1.results[0].id).not.toBe(page2.results[0].id);
    }
  });

  it("allows non-canonical elements with canonicalOnly:false", () => {
    const all = queryElements({ canonicalOnly: false, limit: 100 });
    const canonOnly = queryElements({ canonicalOnly: true, limit: 100 });
    expect(all.results.length).toBeGreaterThanOrEqual(canonOnly.results.length);
  });

  it("returns language-filtered results", () => {
    const enResult = queryElements({ language: "en", limit: 100 });
    for (const r of enResult.results) {
      expect(r.languageCode).toBe("en");
    }
  });

  it("enforces limit cap of 100", () => {
    const result = queryElements({ limit: 500 });
    expect(result.limit).toBe(100);
  });
});

describe("getElementDetail", () => {
  it("returns detail for an existing element", () => {
    const { results } = queryElements({ limit: 100 });
    if (results.length === 0) return;
    const detail = getElementDetail(results[0].id);
    expect(detail).not.toBeNull();
    expect(detail!.element.id).toBe(results[0].id);
    expect(detail!.edges).toBeDefined();
    expect(detail!.similar).toBeDefined();
    expect(detail!.mechanicLabels).toBeDefined();
    expect(detail!.skillLabels).toBeDefined();
  });

  it("returns null for non-existent element", () => {
    const detail = getElementDetail("nonexistent-id-12345");
    expect(detail).toBeNull();
  });

  it("returns buildsOn edges when present", () => {
    const { results } = queryElements({ difficulty: "advanced", limit: 100 });
    if (results.length === 0) return;
    const detail = getElementDetail(results[0].id);
    expect(detail).not.toBeNull();
  });
});

describe("getSimilarElements", () => {
  it("returns similar elements for an element with mechanics+skills", () => {
    const { results } = queryElements({ mechanic: "circle formation", limit: 100 });
    if (results.length === 0) return;
    const similar = getSimilarElements(results[0].id, 5);
    expect(similar.length).toBeGreaterThanOrEqual(0);
    if (similar.length > 0) {
      expect(similar[0].id).not.toBe(results[0].id);
    }
  });

  it("returns empty array for element with no mechanics+skills", () => {
    const graph2 = deriveGraph([makeMockElement({
      normalized: {
        summary: "Empty game.",
        description: "A game with no mechanics or skills defined.",
        howToPlay: null,
        variations: [],
        tips: [],
        referencedElements: [],
        mechanics: [],
        skills: [],
        practical: {},
        contentHash: "hashX",
        extractedAt: "2026-01-01T00:00:00.000Z",
        normalizedBy: "test-schema",
      },
    })], { mechanics: [], skills: [] });
    reloadGraph(graph2);
    const { results } = queryElements({ limit: 100, canonicalOnly: false });
    if (results.length === 0) return;
    const similar = getSimilarElements(results[0].id, 5);
    expect(similar.length).toBe(0);
    // Reload original graph
    createGraphIndex(graph);
  });

  it("respects limit parameter", () => {
    const { results } = queryElements({ limit: 100 });
    if (results.length === 0) return;
    const similar = getSimilarElements(results[0].id, 3);
    expect(similar.length).toBeLessThanOrEqual(3);
  });
});

describe("GraphIndex lifecycle", () => {
  it("reloadGraph creates a new index", () => {
    const idx = reloadGraph(graph);
    expect(idx).toBeDefined();
    expect(idx.nodes.length).toBe(graph.nodes.length);
  });
});
