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
      mechanics: [{ name: "circle formation", category: "setup" }, { name: "turn order", category: "structure" }],
      skills: [{ name: "focus", category: "cognitive" }, { name: "spontaneity", category: "performance" }],
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

describe("deriveGraph — basic structure", () => {
  it("produces empty graph with no elements", () => {
    const graph = deriveGraph([], { mechanics: [], skills: [] });
    expect(graph.nodes.length).toBe(0);
    expect(graph.edges.length).toBe(0);
    expect(graph.meta.elementCount).toBe(0);
  });

  it("creates source element node with sourcedFrom edge", () => {
    const el = makeMockElement();
    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    const elementNode = graph.nodes.find(n => n.type === "Element");
    expect(elementNode).toBeDefined();
    expect(elementNode!.label).toBe("Test Game");

    const sourceEdge = graph.edges.find(e => e.type === "sourcedFrom");
    expect(sourceEdge).toBeDefined();
    expect(sourceEdge!.from).toBe(el.identifier);
  });

  it("creates mechanic and skill edges for a source element", () => {
    const el = makeMockElement();
    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    const mechEdges = graph.edges.filter(e => e.type === "hasMechanic");
    expect(mechEdges.length).toBe(2);

    const skillEdges = graph.edges.filter(e => e.type === "trainsSkill");
    expect(skillEdges.length).toBe(2);

    const tagEdges = graph.edges.filter(e => e.type === "hasTag");
    expect(tagEdges.length).toBe(1);

    // Mechanic and Skill nodes should be created
    const mechanicNodes = graph.nodes.filter(n => n.type === "Mechanic");
    expect(mechanicNodes.length).toBe(2);

    const skillNodes = graph.nodes.filter(n => n.type === "Skill");
    expect(skillNodes.length).toBe(2);
  });

  it("applies vocabulary canonicalization to mechanics/skills", () => {
    const el = makeMockElement({
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "Circle Formation", category: "setup" }],
      },
    });
    const vocab = {
      mechanics: [
        { canonical: "circle formation", variants: ["circle formation", "circle", "form a circle"] },
      ],
      skills: [],
    };
    const graph = deriveGraph([el], vocab);

    const mechNode = graph.nodes.find(n => n.type === "Mechanic");
    expect(mechNode!.label).toBe("circle formation");
  });
});

describe("deriveGraph — clustering and canonicalOf", () => {
  it("creates canonical element from two matched elements", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Circle Game",
      sourceName: "sourceA",
      url: "https://sourcea.com/circle",
      relatedIdentifiers: [{ identifier: "ddddccccbbbbaaaa4444333322221111", confidence: 0.95 }],
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Game with Circles",
      sourceName: "sourceB",
      url: "https://sourceb.com/circles",
      relatedIdentifiers: [{ identifier: "aaaaabbbccccdddd1111222233334444", confidence: 0.95 }],
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] });

    // Should have 2 source elements + 1 canonical = 3 element nodes
    const elementNodes = graph.nodes.filter(n => n.type === "Element");
    expect(elementNodes.length).toBe(3);

    const canonicalNode = elementNodes.find(n => (n as any).canonical === true);
    expect(canonicalNode).toBeDefined();

    // Should have 2 canonicalOf edges
    const canonicalEdges = graph.edges.filter(e => e.type === "canonicalOf");
    expect(canonicalEdges.length).toBe(2);

    // canonicalOf edges should have confidence
    expect(canonicalEdges[0].confidence).toBeDefined();
    expect(canonicalEdges[0].confidence).toBe(0.95);
  });

  it("canonical node inherits mechanics from all members", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Circle Game A",
      sourceName: "sourceA",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }],
        skills: [{ name: "focus", category: "cognitive" }],
      },
      relatedIdentifiers: [{ identifier: "ddddccccbbbbaaaa4444333322221111", confidence: 1.0 }],
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Circle Game B",
      sourceName: "sourceB",
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "turn order", category: "structure" }],
        skills: [{ name: "spontaneity", category: "performance" }],
      },
      relatedIdentifiers: [{ identifier: "aaaaabbbccccdddd1111222233334444", confidence: 1.0 }],
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] });

    // Canonical element should have 2 mechanic edges and 2 skill edges
    const canonicalNode = graph.nodes.find(n => n.type === "Element" && (n as any).canonical) as any;
    const canonicalEdges = graph.edges.filter(e => e.from === canonicalNode!.id);

    const mechEdges = canonicalEdges.filter((e: { type: string }) => e.type === "hasMechanic");
    expect(mechEdges.length).toBe(2);

    const skillEdges = canonicalEdges.filter((e: { type: string }) => e.type === "trainsSkill");
    expect(skillEdges.length).toBe(2);
  });

  it("handles translation links for clustering", () => {
    const elA = makeMockElement({
      identifier: "en111111111111111111111111111111",
      name: "Hello Game",
      languageCode: "en",
      sourceName: "sourceA",
      translationLinkDeIdentifier: "de222222222222222222222222222222",
    });
    const elB = makeMockElement({
      identifier: "de222222222222222222222222222222",
      name: "Hallo Spiel",
      languageCode: "de",
      sourceName: "sourceB",
      translationLinkEnIdentifier: "en111111111111111111111111111111",
    });

    const graph = deriveGraph([elA, elB], { mechanics: [], skills: [] });

    // Should create a cross-language cluster with both EN and DE canonicals
    const canonicalNodes = graph.nodes.filter(n => n.type === "Element" && (n as any).canonical);
    expect(canonicalNodes.length).toBe(2); // one EN, one DE

    // Should have translationOf edge between canonicals
    const translationEdge = graph.edges.find(
      e => e.type === "translationOf" &&
        e.confidence === 1.0 &&
        canonicalNodes.some(n => n.id === e.from) &&
        canonicalNodes.some(n => n.id === e.to)
    );
    expect(translationEdge).toBeDefined();
  });
});

describe("deriveGraph — overrides", () => {
  it("reject_match removes clustering between two elements", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Different Game A",
      sourceName: "sourceA",
      relatedIdentifiers: [{ identifier: "ddddccccbbbbaaaa4444333322221111", confidence: 0.95 }],
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }],
      },
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Different Game B",
      sourceName: "sourceB",
      relatedIdentifiers: [{ identifier: "aaaaabbbccccdddd1111222233334444", confidence: 0.95 }],
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "stage layout", category: "setup" }],
      },
    });

    const graphWithReject = deriveGraph([elA, elB], { mechanics: [], skills: [] }, [
      { type: "reject_match", elementA: elA.identifier, elementB: elB.identifier },
    ]);

    // With reject_match, they should NOT be in the same cluster
    const canonicalNodes = graphWithReject.nodes.filter(
      n => n.type === "Element" && (n as any).canonical,
    );
    expect(canonicalNodes.length).toBe(0); // each is a singleton
  });

  it("add_match creates clustering between unmatched elements", () => {
    const elA = makeMockElement({
      identifier: "aaaaabbbccccdddd1111222233334444",
      name: "Game X",
      sourceName: "sourceA",
      relatedIdentifiers: [], // no automatic match
    });
    const elB = makeMockElement({
      identifier: "ddddccccbbbbaaaa4444333322221111",
      name: "Game Y",
      sourceName: "sourceB",
      relatedIdentifiers: [], // no automatic match
    });

    const graphWithAdd = deriveGraph([elA, elB], { mechanics: [], skills: [] }, [
      { type: "add_match", elementA: elA.identifier, elementB: elB.identifier },
    ]);

    // With add_match, they should be clustered
    const canonicalNodes = graphWithAdd.nodes.filter(
      n => n.type === "Element" && (n as any).canonical,
    );
    expect(canonicalNodes.length).toBe(1);

    const canonicalEdges = graphWithAdd.edges.filter(e => e.type === "canonicalOf");
    expect(canonicalEdges.length).toBe(2);
  });

  it("remove_edge strips a mechanic from an element", () => {
    const el = makeMockElement({
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }, { name: "turn order", category: "structure" }],
      },
    });

    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    const circleNodeId = graph.nodes.find(n => n.type === "Mechanic" && n.label === "circle formation")?.id!;

    const graphWithRemove = deriveGraph([el], { mechanics: [], skills: [] }, [
      { type: "remove_edge", elementId: el.identifier, edgeType: "hasMechanic", targetId: circleNodeId },
    ]);

    const removedEdges = graphWithRemove.edges.filter(
      e => e.type === "hasMechanic" && e.from === el.identifier && e.to === circleNodeId,
    );
    expect(removedEdges.length).toBe(0);

    // Other mechanic should remain
    const remaining = graphWithRemove.edges.filter(
      e => e.type === "hasMechanic" && e.from === el.identifier,
    );
    expect(remaining.length).toBe(1);
    expect(remaining[0].to).toBe(graph.nodes.find(n => n.type === "Mechanic" && n.label === "turn order")?.id);
  });

  it("add_edge injects a mechanic on an element", () => {
    const el = makeMockElement({
      normalized: {
        ...makeMockElement().normalized,
        mechanics: [{ name: "circle formation", category: "setup" }],
      },
    });

    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    const fakeMechNodeId = "44444444444444444444444444444444";
    // Need the node to exist in the graph for the edge to be meaningful
    // add_edge just creates the edge; the node won't exist unless it's referenced
    // This edge will be added but the node may not be in the graph

    const graphWithAdd = deriveGraph([el], { mechanics: [], skills: [] }, [
      { type: "add_edge", elementId: el.identifier, edgeType: "hasMechanic", targetId: fakeMechNodeId },
    ]);

    const addedEdge = graphWithAdd.edges.find(
      e => e.type === "hasMechanic" && e.from === el.identifier && e.to === fakeMechNodeId,
    );
    expect(addedEdge).toBeDefined();
    expect(addedEdge!.confidence).toBe(1.0);
  });

  it("reports override stats in meta", () => {
    const el = makeMockElement();
    const graph = deriveGraph([el], { mechanics: [], skills: [] }, [
      { type: "reject_match", elementA: el.identifier, elementB: "nonexistent" },
      { type: "add_match", elementA: el.identifier, elementB: "nonexistent" },
    ]);

    expect(graph.meta.overridesApplied).toBeDefined();
    expect(graph.meta.overridesStale).toBeDefined();
  });
});

describe("deriveGraph — node counts and meta", () => {
  it("includes correct source and element counts", () => {
    const el = makeMockElement({ sourceName: "testsource" });
    const graph = deriveGraph([el], { mechanics: [], skills: [] });

    expect(graph.meta.sourceElementCount).toBe(1);
    expect(graph.meta.canonicalElementCount).toBe(0);
    expect(graph.meta.sourceCount).toBe(1);
    expect(graph.meta.mechanicCount).toBe(2);
    expect(graph.meta.skillCount).toBe(2);
    expect(graph.meta.tagCount).toBe(1);
  });

  it("includes derivedAt timestamp", () => {
    const graph = deriveGraph([], { mechanics: [], skills: [] });
    expect(graph.meta.derivedAt).toBeDefined();
    expect(Date.parse(graph.meta.derivedAt)).not.toBeNaN();
  });

  it("node IDs are stable MD5 hashes", () => {
    const graph1 = deriveGraph([makeMockElement({ name: "Stable Name", sourceName: "s" })], { mechanics: [], skills: [] });
    const graph2 = deriveGraph([makeMockElement({ name: "Stable Name", sourceName: "s" })], { mechanics: [], skills: [] });

    const node1 = graph1.nodes.find(n => n.type === "Mechanic" && n.label === "circle formation");
    const node2 = graph2.nodes.find(n => n.type === "Mechanic" && n.label === "circle formation");
    expect(node1!.id).toBe(node2!.id);
  });
});
