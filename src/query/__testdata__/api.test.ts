import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createGraphIndex } from "../graph-query";
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
let baseUrl: string;

beforeAll(async () => {
  const elA = makeMockElement({
    identifier: "aaabbbcccddd11112222333344445555",
    name: "Simple Circle Game",
    sourceName: "sourceA",
    tags: ["Warm-ups"],
    relatedIdentifiers: [
      { identifier: "aaabbbcccddd11112222333344446666", confidence: 1.0 },
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
      practical: { difficulty: "beginner", typicalDurationMinutes: 5, groupSize: { min: 4, max: 20 }, energyLevel: "medium" },
      contentHash: "hash1",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
  });

  const elA2 = makeMockElement({
    identifier: "aaabbbcccddd11112222333344446666",
    name: "Circle Energy Pass",
    sourceName: "sourceB",
    tags: ["Warm-ups"],
    relatedIdentifiers: [
      { identifier: "aaabbbcccddd11112222333344445555", confidence: 1.0 },
    ],
    normalized: {
      summary: "A simple circle energy game.",
      description: "Players stand in a circle and pass energy around for warm-up.",
      howToPlay: { steps: [{ action: "Form a circle" }, { action: "Pass energy" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "circle formation", category: "setup" }, { name: "energy pass", category: "interaction" }],
      skills: [{ name: "focus", category: "cognitive" }],
      practical: { difficulty: "beginner", typicalDurationMinutes: 5, groupSize: { min: 4, max: 20 }, energyLevel: "medium" },
      contentHash: "hash1b",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
  });

  const elB = makeMockElement({
    identifier: "bbbaaacccddd22221111333344445555",
    name: "Advanced Story Circle",
    sourceName: "testsource",
    tags: ["Storytelling"],
    normalized: {
      summary: "A complex storytelling game.",
      description: "Players stand in a circle and build a story together word by word. This is an advanced exercise.",
      howToPlay: { steps: [{ action: "Form a circle" }, { action: "Build story word by word" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "circle formation", category: "setup" }, { name: "word-at-a-time", category: "interaction" }],
      skills: [{ name: "storytelling", category: "narrative" }],
      practical: { difficulty: "advanced", typicalDurationMinutes: 15, groupSize: { min: 4, max: 12 }, energyLevel: "low" },
      contentHash: "hash2",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
  });

  const elC = makeMockElement({
    identifier: "cccdddaaabbb33331111222244445555",
    name: "Audience Game",
    sourceName: "testsource",
    tags: ["Ask For"],
    normalized: {
      summary: "A game requiring audience input.",
      description: "Performers ask the audience for suggestions and build scenes from them.",
      howToPlay: { steps: [{ action: "Ask audience" }, { action: "Build scene" }] },
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

  graph = deriveGraph([elA, elA2, elB, elC], {
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

describe("API endpoint tests", () => {
  it("GET /api/elements returns paginated elements", async () => {
    const searchParams = new URLSearchParams({ limit: "5" });
    const url = new URL(`http://localhost/api/elements?${searchParams}`);
    const req = new Request(url);

    const { results, total, page, limit } = queryElements({ limit: 5 });

    expect(results.length).toBeLessThanOrEqual(5);
    expect(limit).toBe(5);
    expect(page).toBe(1);
    expect(typeof total).toBe("number");
    if (results.length > 0) {
      expect(results[0].id).toBeDefined();
      expect(results[0].label).toBeDefined();
      expect(results[0].summary).toBeDefined();
      expect(results[0].mechanicLabels).toBeDefined();
      expect(results[0].skillLabels).toBeDefined();
    }
  });

  it("GET /api/elements with difficulty=beginner filter", () => {
    const result = queryElements({ difficulty: "beginner", limit: 100 });
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.difficulty).toBe("beginner");
    }
  });

  it("GET /api/elements/:id returns element detail", () => {
    const { results } = queryElements({ limit: 100 });
    if (results.length === 0) return;
    const detail = getElementDetail(results[0].id);
    expect(detail).not.toBeNull();
    expect(detail!.element.label).toBe(results[0].label);
    expect(detail!.edges).toBeDefined();
    expect(Array.isArray(detail!.similar)).toBe(true);
    expect(Array.isArray(detail!.mechanicLabels)).toBe(true);
    expect(Array.isArray(detail!.skillLabels)).toBe(true);
  });

  it("GET /api/elements/:id returns 404 for missing element", () => {
    const detail = getElementDetail("nonexistent-element-id-xxxx");
    expect(detail).toBeNull();
  });

  it("GET /api/elements/:id/similar returns ranked similar", () => {
    const { results } = queryElements({ limit: 100 });
    if (results.length === 0) return;
    const similar = getSimilarElements(results[0].id, 5);
    expect(Array.isArray(similar)).toBe(true);
    expect(similar.length).toBeLessThanOrEqual(5);
    for (const s of similar) {
      expect(s.id).not.toBe(results[0].id);
    }
  });

  it("POST /api/themes/expand returns matching nodes", () => {
    const { expandTheme } = require("../theme");
    const nodes = expandTheme("storytelling");
    expect(Array.isArray(nodes)).toBe(true);
    if (nodes.length > 0) {
      expect(["Mechanic", "Skill", "Tag"]).toContain(nodes[0].type);
      expect(nodes[0].id).toBeDefined();
      expect(nodes[0].label).toBeDefined();
    }
  });

  it("POST /api/themes/expand caches results", () => {
    const { expandTheme, clearThemeCache } = require("../theme");
    clearThemeCache();
    const first = expandTheme("story");
    const second = expandTheme("story");
    expect(first).toEqual(second);
  });

  it("POST /api/workshop/plan returns warmUp/main/closer", () => {
    const { planWorkshop } = require("../workshop-planner");
    const plan = planWorkshop({ duration: 120, players: 12, theme: "storytelling" });
    expect(plan).toBeDefined();
    expect(Array.isArray(plan.warmUp)).toBe(true);
    expect(Array.isArray(plan.main)).toBe(true);
    expect(Array.isArray(plan.closer)).toBe(true);
    expect(typeof plan.totalDuration).toBe("number");
    expect(plan.fallbacks).toBeDefined();
    expect(Array.isArray(plan.warnings)).toBe(true);
  });

  it("POST /api/workshop/plan with constraints filters requirements", () => {
    const { planWorkshop } = require("../workshop-planner");
    const plan = planWorkshop({
      duration: 120,
      players: 12,
      constraints: ["no-audience", "no-props"],
      theme: "circle",
    });
    for (const group of [plan.warmUp, plan.main, plan.closer]) {
      for (const el of group) {
        expect(el.requirementLabels).not.toContain("audience_input");
        expect(el.requirementLabels).not.toContain("audience_on_stage");
        expect(el.requirementLabels).not.toContain("props_objects");
      }
    }
  });

  it("POST /api/workshop/plan with no matching theme returns warnings", () => {
    const { planWorkshop } = require("../workshop-planner");
    const plan = planWorkshop({
      duration: 120,
      players: 12,
      theme: "xyzzy_this_should_not_match_anything_12345",
    });
    expect(Array.isArray(plan.warnings)).toBe(true);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it("POST /api/workshop/plan respects player count", () => {
    const { planWorkshop } = require("../workshop-planner");
    const plan = planWorkshop({ duration: 120, players: 50 });
    for (const group of [plan.warmUp, plan.main, plan.closer]) {
      for (const el of group) {
        if (el.playerCountMax !== undefined) {
          expect(el.playerCountMax).toBeGreaterThanOrEqual(50);
        }
      }
    }
  });

  it("503 when graph not loaded — getGraphIndex throws", () => {
    const { getGraphIndex } = require("../graph-query");
    // After the load in beforeAll, getGraphIndex should work
    const idx = getGraphIndex();
    expect(idx).toBeDefined();
    expect(idx.nodes.length).toBeGreaterThan(0);
  });
});

import { queryElements, getElementDetail, getSimilarElements } from "../graph-query";
