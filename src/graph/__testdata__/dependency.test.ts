import { describe, it, expect } from "bun:test";
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

describe("deriveGraph — variationOf edges", () => {
  it("adds variationOf edge for derived elements", () => {
    const el = makeMockElement({
      derivedElements: [
        { name: "Test Game - Harder", description: "A harder version of Test Game.", parentIdentifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      ],
    });
    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    const varEdges = graph.edges.filter(e => e.type === "variationOf");
    expect(varEdges.length).toBe(1);
    expect(varEdges[0].to).toBe(el.identifier);

    const derivedNode = graph.nodes.find(n => n.id === varEdges[0].from);
    expect(derivedNode).toBeDefined();
    expect(derivedNode!.label).toBe("Test Game - Harder");
    expect((derivedNode as any).canonical).toBe(false);
  });

  it("creates source element nodes for derived elements", () => {
    const el = makeMockElement({
      derivedElements: [
        { name: "Variant A", description: "Variant A description.", parentIdentifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        { name: "Variant B", description: "Variant B description.", parentIdentifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      ],
    });
    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    const elementNodes = graph.nodes.filter(n => n.type === "Element" && !(n as any).canonical);
    expect(elementNodes.length).toBe(3);
  });

  it("variationOf has confidence 1.0", () => {
    const el = makeMockElement({
      derivedElements: [
        { name: "Variant", description: "A variant.", parentIdentifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      ],
    });
    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    const varEdge = graph.edges.find(e => e.type === "variationOf");
    expect(varEdge!.confidence).toBe(1.0);
  });
});

describe("deriveGraph — buildsOn edges", () => {
  it("adds buildsOn when B has superset mechanics of A with same difficulty and duration", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Simple Game",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }],
        practical: { difficulty: "beginner", typicalDurationMinutes: 5 },
      },
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Complex Game",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }, { name: "turn order", category: "structure" }],
        practical: { difficulty: "intermediate", typicalDurationMinutes: 10 },
      },
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] });

    const buildsEdges = graph.edges.filter(e => e.type === "buildsOn");
    expect(buildsEdges.length).toBe(1);
    expect(buildsEdges[0].from).toBe(elB.identifier);
    expect(buildsEdges[0].to).toBe(elA.identifier);
  });

  it("does NOT add buildsOn when A has higher difficulty than B", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Hard Simple",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }],
        practical: { difficulty: "advanced", typicalDurationMinutes: 5 },
      },
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Easy Complex",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }, { name: "turn order", category: "structure" }],
        practical: { difficulty: "beginner", typicalDurationMinutes: 5 },
      },
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] });

    const buildsEdges = graph.edges.filter(e => e.type === "buildsOn");
    expect(buildsEdges.length).toBe(0);
  });

  it("does NOT add buildsOn for same mechanic set sizes", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Game Alpha",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }],
      },
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Game Beta",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "turn order", category: "structure" }],
      },
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] });

    const buildsEdges = graph.edges.filter(e => e.type === "buildsOn");
    expect(buildsEdges.length).toBe(0);
  });

  it("does NOT add buildsOn across different sources", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Source A Game",
      sourceName: "sourceA",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }],
      },
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Source B Game",
      sourceName: "sourceB",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }, { name: "turn order", category: "structure" }],
        practical: { difficulty: "intermediate", typicalDurationMinutes: 10 },
      },
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] });

    const buildsEdges = graph.edges.filter(e => e.type === "buildsOn");
    expect(buildsEdges.length).toBe(0);
  });

  it("does NOT add buildsOn for elements with same name", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Same Name",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }],
      },
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Same Name",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }, { name: "turn order", category: "structure" }],
        practical: { difficulty: "intermediate", typicalDurationMinutes: 10 },
      },
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] });

    const buildsEdges = graph.edges.filter(e => e.type === "buildsOn");
    expect(buildsEdges.length).toBe(0);
  });

  it("respects duration ordering when both have duration set", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Short Game",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }],
        practical: { difficulty: "beginner", typicalDurationMinutes: 3 },
      },
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Long Game",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }, { name: "turn order", category: "structure" }],
        practical: { difficulty: "intermediate", typicalDurationMinutes: 15 },
      },
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] });

    const buildsEdges = graph.edges.filter(e => e.type === "buildsOn");
    expect(buildsEdges.length).toBe(1);
    expect(buildsEdges[0].from).toBe(elB.identifier);
    expect(buildsEdges[0].to).toBe(elA.identifier);
  });
});

describe("deriveGraph — buildsOn and variationOf overrides", () => {
  it("add_buildsOn override adds a buildsOn edge", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Game A",
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Game B",
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] }, [
      { type: "add_buildsOn", fromElementId: elB.identifier, toElementId: elA.identifier },
    ]);

    const buildsEdges = graph.edges.filter(e => e.type === "buildsOn");
    expect(buildsEdges.length).toBe(1);
    expect(buildsEdges[0].from).toBe(elB.identifier);
    expect(buildsEdges[0].to).toBe(elA.identifier);
    expect(buildsEdges[0].confidence).toBe(1.0);
  });

  it("remove_buildsOn override removes a buildsOn edge", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Simple Game",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }],
        practical: { difficulty: "beginner", typicalDurationMinutes: 5 },
      },
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Complex Game",
      sourceName: "testsource",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }, { name: "turn order", category: "structure" }],
        practical: { difficulty: "intermediate", typicalDurationMinutes: 10 },
      },
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] }, [
      { type: "remove_buildsOn", fromElementId: elB.identifier, toElementId: elA.identifier },
    ]);

    const buildsEdges = graph.edges.filter(e => e.type === "buildsOn");
    expect(buildsEdges.length).toBe(0);
  });

  it("add_variationOf override adds a variationOf edge", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Parent Game",
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Child Game",
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] }, [
      { type: "add_variationOf", fromElementId: elB.identifier, toElementId: elA.identifier },
    ]);

    const varEdges = graph.edges.filter(e => e.type === "variationOf");
    expect(varEdges.length).toBe(1);
    expect(varEdges[0].from).toBe(elB.identifier);
    expect(varEdges[0].to).toBe(elA.identifier);
    expect(varEdges[0].confidence).toBe(1.0);
  });

  it("remove_variationOf override removes an auto-derived variationOf edge", () => {
    const el = makeMockElement({
      derivedElements: [
        { name: "Variant", description: "A variant.", parentIdentifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      ],
    });
    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    const derivedNode = graph.nodes.find(
      n => n.type === "Element" && !(n as any).canonical && n.label === "Variant",
    );
    expect(derivedNode).toBeDefined();

    const graphWithRemove = deriveGraph([el], { mechanics: [], skills: [] }, [
      { type: "remove_variationOf", fromElementId: derivedNode!.id, toElementId: el.identifier },
    ]);

    const varEdges = graphWithRemove.edges.filter(e => e.type === "variationOf");
    expect(varEdges.length).toBe(0);
  });
});
