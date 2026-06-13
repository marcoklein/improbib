import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import path from "path";
import { createGraphIndex, reloadGraph } from "../graph-query";
import type { KnowledgeGraph } from "../../graph/derive";

let graphLoaded = false;

beforeAll(async () => {
  const graphPath = path.join(process.cwd(), "output", "graph.json");
  const graphFile = Bun.file(graphPath);
  if (await graphFile.exists()) {
    const graph: KnowledgeGraph = await graphFile.json();
    createGraphIndex(graph);
    graphLoaded = true;
  }
});

describe("reference: 'saying yes' workshop plan", () => {
  it("loads production graph", () => {
    if (!graphLoaded) {
      console.log("  (skipped — no output/graph.json found locally)");
      return;
    }
    expect(graphLoaded).toBe(true);
  });

  it("produces a complete plan with closers (regression check)", async () => {
    if (!graphLoaded) {
      console.log("  (skipped — no output/graph.json found locally)");
      return;
    }

    const { planWorkshop } = await import("../workshop-planner");

    const plan = planWorkshop({
      duration: 120,
      players: 12,
      difficulty: "beginner",
      theme: "saying yes",
      constraints: ["no-audience", "no-music"],
    });

    expect(plan.warmUp.length).toBeGreaterThanOrEqual(2);
    expect(plan.main.length).toBeGreaterThanOrEqual(3);
    expect(plan.closer.length).toBeGreaterThanOrEqual(1);
    expect(plan.totalDuration).toBeGreaterThanOrEqual(90);

    const hasCloserWarning = plan.warnings.some((w) =>
      w.includes("no closer exercises"),
    );
    expect(hasCloserWarning).toBe(false);

    const hasMainWarning = plan.warnings.some((w) =>
      w.includes("Fewer main exercises"),
    );
    expect(hasMainWarning).toBe(false);

    const hasDurationWarning = plan.warnings.some((w) =>
      w.includes("less than 50%"),
    );
    expect(hasDurationWarning).toBe(false);

    console.log(
      `  plan: ${plan.warmUp.length}w + ${plan.main.length}m + ${plan.closer.length}c = ${plan.totalDuration}min`,
    );
  });
});
