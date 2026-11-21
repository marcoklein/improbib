import { beforeEach, describe, expect, test } from "bun:test";
import { deriveGraph } from "../../graph/derive";
import type { KnowledgeGraph } from "../../graph/derive";
import type { NormalizedElement } from "../../normalize/normalized-schema";
import { reloadGraph } from "../graph-query";
import { planWorkshop } from "../workshop-planner";

/**
 * Duration provenance in the workshop planner.
 *
 * The planner fits a time budget from durations the model guessed. A strict
 * fit may only use numbers a source states; otherwise "these seven fill 90
 * minutes" is a claim nobody measured (ticket ip-bupf, AC2).
 */
function makeElement(input: {
  id: string;
  name: string;
  durationMinutes: number;
  stated?: boolean;
  sourceName?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  energy?: "low" | "medium" | "high";
}): NormalizedElement {
  const id = input.id.padEnd(32, "0");
  const duration = input.durationMinutes;
  return {
    identifier: id,
    name: input.name,
    url: `https://example.com/${id}`,
    sourceName: input.sourceName ?? "testsource",
    languageCode: "en",
    tags: ["game"],
    htmlContent: input.stated
      ? `<p>It usually takes about ${duration} minutes.</p>`
      : "<p>A game with no duration in the text.</p>",
    normalized: {
      summary: `A summary of ${input.name}.`,
      description: `Description of ${input.name} that is long enough for the schema.`,
      howToPlay: { steps: [{ action: "Play the game" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "freeze signal" }],
      skills: ["attention"],
      practical: {
        difficulty: input.difficulty ?? "beginner",
        typicalDurationMinutes: duration,
        energyLevel: input.energy ?? "medium",
        groupSize: { min: 2, max: 20 },
      },
      contentHash: `hash-${id}`,
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-model",
    },
    derivedElements: [],
    relatedIdentifiers: [],
  };
}

/**
 * Two pages of one work. The graph derives canonical nodes for clusters of at
 * least two elements, and works are language-homogeneous with one page per
 * source, so the pair needs two source names.
 */
function cluster(input: {
  key: string;
  name: string;
  durationMinutes: number;
  stated?: boolean;
  difficulty?: "beginner" | "intermediate" | "advanced";
  energy?: "low" | "medium" | "high";
}): NormalizedElement[] {
  const first = makeElement({
    id: `${input.key}a`,
    name: input.name,
    durationMinutes: input.durationMinutes,
    stated: input.stated,
    sourceName: "sourceA",
    difficulty: input.difficulty,
    energy: input.energy,
  });
  const second = makeElement({
    id: `${input.key}b`,
    name: input.name,
    durationMinutes: input.durationMinutes,
    stated: input.stated,
    sourceName: "sourceB",
    difficulty: input.difficulty,
    energy: input.energy,
  });
  first.relatedIdentifiers = [{ identifier: second.identifier, confidence: 1 }];
  second.relatedIdentifiers = [{ identifier: first.identifier, confidence: 1 }];
  return [first, second];
}

function graphOf(groups: NormalizedElement[][]): KnowledgeGraph {
  return deriveGraph(groups.flat(), { mechanics: [], skills: [] });
}

function plan(input: { strictTime?: boolean }, duration = 120) {
  return planWorkshop({
    duration,
    players: 10,
    strictTime: input.strictTime,
  });
}

describe("workshop planner duration provenance", () => {
  beforeEach(() => {
    reloadGraph(
      graphOf([
        cluster({ key: "wa", name: "Stated Warmup", durationMinutes: 10, stated: true }),
        cluster({ key: "ea", name: "Stated Exercise A", durationMinutes: 15, stated: true }),
        cluster({ key: "eb", name: "Stated Exercise B", durationMinutes: 20, stated: true }),
        cluster({
          key: "ca",
          name: "Stated Closer",
          durationMinutes: 20,
          stated: true,
          difficulty: "intermediate",
        }),
        cluster({ key: "wb", name: "Inferred Warmup", durationMinutes: 10 }),
        cluster({ key: "ec", name: "Inferred Exercise", durationMinutes: 15 }),
        cluster({
          key: "cb",
          name: "Inferred Closer",
          durationMinutes: 20,
          difficulty: "intermediate",
        }),
      ])
    );
  });

  test("a strict plan never contains an inferred work (AC2)", () => {
    const strict = plan({ strictTime: true });

    const planned = [...strict.warmUp, ...strict.main, ...strict.closer];
    expect(planned.length).toBeGreaterThan(0);
    for (const element of planned) {
      expect(element.durationSource).toBe("stated");
    }
    expect(strict.durationConfidence).toBe("stated");
  });

  test("a non-strict plan keeps the inferred works and reports the weaker confidence", () => {
    const loose = plan({});

    expect(loose.durationConfidence).toBe("inferred");
    const planned = [...loose.warmUp, ...loose.main, ...loose.closer];
    expect(planned.length).toBeGreaterThan(0);
    // Without the flag the behaviour is unchanged: inferred durations fill the
    // budget together with stated ones.
    expect(
      planned.some((element) => element.durationSource === "inferred")
    ).toBe(true);
  });

  test("a strict plan returns a warning instead of padding with guesses", () => {
    // A budget far above what the stated works cover.
    const strict = plan({ strictTime: true }, 480);

    for (const element of [
      ...strict.warmUp,
      ...strict.main,
      ...strict.closer,
    ]) {
      expect(element.durationSource).toBe("stated");
    }
    expect(
      strict.warnings.some((warning) => warning.includes("Strict time fit"))
    ).toBe(true);
  });

  test("a strict plan over a graph without stated durations stays empty and warns", () => {
    reloadGraph(
      graphOf([
        cluster({ key: "ca", name: "Inferred Warmup", durationMinutes: 10 }),
        cluster({ key: "cb", name: "Inferred Exercise", durationMinutes: 20 }),
      ])
    );

    const strict = plan({ strictTime: true });

    expect([...strict.warmUp, ...strict.main, ...strict.closer]).toHaveLength(0);
    expect(strict.durationConfidence).toBe("inferred");
    expect(
      strict.warnings.some((warning) =>
        warning.includes("no element has a source-stated duration")
      )
    ).toBe(true);
  });
});

describe("graph duration provenance", () => {
  test("the canonical node carries the source of its duration", () => {
    const graph = graphOf([
      cluster({ key: "ga", name: "Stated Game", durationMinutes: 10, stated: true }),
      cluster({ key: "gb", name: "Guessed Game", durationMinutes: 10 }),
    ]);
    const nodes = graph.nodes.filter(
      (node): node is Extract<typeof node, { type: "Element" }> =>
        node.type === "Element"
    );

    for (const node of nodes) {
      if (node.typicalDurationMinutes === undefined) continue;
      expect(["stated", "inferred"]).toContain(node.durationSource as string);
    }

    const stated = nodes.find((node) => node.label === "Stated Game");
    const guessed = nodes.find((node) => node.label === "Guessed Game");
    expect(stated?.durationSource).toBe("stated");
    expect(guessed?.durationSource).toBe("inferred");
  });
});
