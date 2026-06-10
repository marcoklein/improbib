import { describe, it, expect } from "bun:test";
import { deriveRequirements } from "../requirement-mapping";
import { deriveGraph } from "../derive";
import type { NormalizedElement } from "../../normalize/normalized-schema";

function makeMockElement(overrides: Partial<NormalizedElement> = {}): NormalizedElement {
  return {
    identifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    name: "Test Game",
    url: "https://example.com/test",
    sourceName: "testsource",
    languageCode: "en",
    tags: ["game"],
    htmlContent: "<p>test</p>",
    normalized: {
      summary: "A test game for testing purposes.",
      description: "Players stand in a circle and do test things for testing. This is a longer description.",
      howToPlay: { steps: [{ action: "Form a circle" }, { action: "Do test things" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "circle formation", category: "setup" }],
      skills: [{ name: "focus", category: "cognitive" }],
      practical: { difficulty: "beginner", typicalDurationMinutes: 5, groupSize: { min: 4, max: 12 } },
      contentHash: "hash123",
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-schema",
    },
    relatedIdentifiers: [],
    derivedElements: [],
    ...overrides,
  };
}

describe("deriveRequirements", () => {
  it("detects audience_input from audience suggestion mechanic", () => {
    const reqs = deriveRequirements(["audience suggestion"], []);
    expect(reqs).toContain("audience_input");
  });

  it("detects audience_input from audience voting mechanic", () => {
    const reqs = deriveRequirements(["audience voting"], []);
    expect(reqs).toContain("audience_input");
  });

  it("detects audience_input from Ask For tag", () => {
    const reqs = deriveRequirements([], ["Ask For"]);
    expect(reqs).toContain("audience_input");
  });

  it("detects physical_contact from physical contact mechanic", () => {
    const reqs = deriveRequirements(["physical contact"], []);
    expect(reqs).toContain("physical_contact");
  });

  it("detects physical_contact from touch to speak mechanic", () => {
    const reqs = deriveRequirements(["touch to speak"], []);
    expect(reqs).toContain("physical_contact");
  });

  it("detects music_singing from singing constraint mechanic", () => {
    const reqs = deriveRequirements(["singing constraint"], []);
    expect(reqs).toContain("music_singing");
  });

  it("detects music_singing from Musik und Gesang tag", () => {
    const reqs = deriveRequirements([], ["Musik und Gesang"]);
    expect(reqs).toContain("music_singing");
  });

  it("detects props_objects from object prompt mechanic", () => {
    const reqs = deriveRequirements(["object prompt"], []);
    expect(reqs).toContain("props_objects");
  });

  it("detects audience_on_stage from Audience on stage tag", () => {
    const reqs = deriveRequirements([], ["Audience on stage"]);
    expect(reqs).toContain("audience_on_stage");
  });

  it("returns empty array when no matches", () => {
    const reqs = deriveRequirements(["circle formation", "turn order"], []);
    expect(reqs).toEqual([]);
  });

  it("does case-insensitive matching for mechanics", () => {
    const reqs = deriveRequirements(["Audience Suggestion"], []);
    expect(reqs).toContain("audience_input");
  });

  it("does case-insensitive matching for tags", () => {
    const reqs = deriveRequirements([], ["ask for"]);
    expect(reqs).toContain("audience_input");
  });
});

describe("deriveGraph — requires edges", () => {
  it("adds requires edge for audience_input triggered by mechanic", () => {
    const el = makeMockElement({
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "audience suggestion", category: "setup" }],
      },
    });
    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    const reqEdges = graph.edges.filter(e => e.type === "requires");
    expect(reqEdges.length).toBe(1);
    expect(reqEdges[0].from).toBe(el.identifier);

    const reqNode = graph.nodes.find(n => n.type === "Requirement");
    expect(reqNode).toBeDefined();
    expect(reqNode!.label).toBe("audience_input");
  });

  it("adds requires edge for audience_input triggered by tag", () => {
    const el = makeMockElement({
      tags: ["Ask For"],
    });
    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    const reqEdges = graph.edges.filter(e => e.type === "requires");
    expect(reqEdges.length).toBe(1);

    const reqNode = graph.nodes.find(n => n.type === "Requirement");
    expect(reqNode!.label).toBe("audience_input");
  });

  it("adds no requires edge when no requirements match", () => {
    const el = makeMockElement({
      tags: ["Warm-ups"],
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }],
      },
    });
    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    const reqEdges = graph.edges.filter(e => e.type === "requires");
    expect(reqEdges.length).toBe(0);
  });

  it("adds requirement nodes to graph node count", () => {
    const el = makeMockElement({
      tags: ["Ask For", "Physical Contact"],
    });
    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    expect(graph.meta.requirementCount).toBe(2);
  });

  it("deduplicates requirement nodes across elements", () => {
    const elA = makeMockElement({
      identifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      tags: ["Ask For"],
    });
    const elB = makeMockElement({
      identifier: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      tags: ["Ask For"],
      sourceName: "sourceB",
    });
    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] });

    const reqNodes = graph.nodes.filter(n => n.type === "Requirement");
    expect(reqNodes.length).toBe(1);

    const reqEdges = graph.edges.filter(e => e.type === "requires");
    expect(reqEdges.length).toBe(2);
  });

  it("add_requires override adds a requires edge", () => {
    const el = makeMockElement();
    const graph = deriveGraph([el], { mechanics: [], skills: [] }, [
      { type: "add_requires", elementId: el.identifier, requirementLabel: "audience_input" },
    ]);

    const reqEdges = graph.edges.filter(e => e.type === "requires");
    expect(reqEdges.length).toBe(1);
    expect(reqEdges[0].from).toBe(el.identifier);
    expect(reqEdges[0].confidence).toBe(1.0);
  });

  it("remove_requires override removes an auto-detected requires edge", () => {
    const el = makeMockElement({
      tags: ["Ask For"],
    });
    const graph = deriveGraph([el], { mechanics: [], skills: [] }, [
      { type: "remove_requires", elementId: el.identifier, requirementLabel: "audience_input" },
    ]);

    const reqEdges = graph.edges.filter(e => e.type === "requires");
    expect(reqEdges.length).toBe(0);
  });
});
