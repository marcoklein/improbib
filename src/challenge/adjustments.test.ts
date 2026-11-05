import { describe, expect, test } from "bun:test";
import { buildAdjustments, mergeAnnotations } from "./adjustments";
import type { ChallengeAnnotation } from "./challenge-schema";

function annotation(
  direction: ChallengeAnnotation["direction"],
  lever: ChallengeAnnotation["lever"] = null,
  evidence = ""
): ChallengeAnnotation {
  return { name: "x", direction, lever, evidence };
}

describe("mergeAnnotations", () => {
  test("returns undefined without annotations", () => {
    expect(mergeAnnotations([])).toBeUndefined();
  });

  test("prefers a documented direction over unknown votes", () => {
    expect(
      mergeAnnotations([annotation("unknown"), annotation("harder", "rules")])
    ).toEqual({ direction: "harder", lever: "rules", evidence: "" });
  });

  test("resolves contradicting directions to unknown", () => {
    expect(
      mergeAnnotations([annotation("harder", "rules"), annotation("easier", "rules")])
    ).toEqual({ direction: "unknown", lever: null, evidence: "" });
  });

  test("picks the most frequent lever and keeps the evidence", () => {
    const result = mergeAnnotations([
      annotation("harder", "information", "less information"),
      annotation("harder", "information", ""),
      annotation("harder", "rules", ""),
    ]);

    expect(result).toEqual({
      direction: "harder",
      lever: "information",
      evidence: "less information",
    });
  });
});

describe("buildAdjustments", () => {
  const variations = [
    {
      name: "Blind Freeze",
      description: "Waiting players cannot see the stage.",
      kind: "inline" as const,
      direction: "harder" as const,
      lever: "information" as const,
    },
    {
      name: "Elimination Freeze",
      description: "Players who hesitate are eliminated.",
      kind: "inline" as const,
      direction: "harder" as const,
      lever: "rules" as const,
    },
    {
      name: "Structured Freeze",
      description: "Player must always pick the stage left pose.",
      kind: "inline" as const,
      direction: "easier" as const,
      lever: "rules" as const,
    },
    {
      name: "Audience Freeze",
      description: "The audience calls the freeze.",
      kind: "inline" as const,
      direction: "lateral" as const,
      lever: "audience" as const,
    },
    {
      name: "Freeze-Endowment",
      description: "A standalone page.",
      kind: "standalone" as const,
      direction: "harder" as const,
      lever: "rules" as const,
    },
  ];

  test("groups documented variations by direction", () => {
    const result = buildAdjustments(variations);

    expect(result.harder.map((item) => item.variationName)).toEqual([
      "Blind Freeze",
      "Elimination Freeze",
    ]);
    expect(result.easier).toEqual([
      {
        text: "Player must always pick the stage left pose.",
        variationName: "Structured Freeze",
        lever: "rules",
      },
    ]);
  });

  test("ignores lateral, unknown and standalone variations", () => {
    const result = buildAdjustments([
      ...variations,
      {
        name: "Unclear",
        description: "Something else.",
        kind: "inline" as const,
        direction: "unknown" as const,
        lever: null,
      },
    ]);

    expect(result.harder).toHaveLength(2);
    expect(result.easier).toHaveLength(1);
  });

  test("deduplicates identical texts", () => {
    const result = buildAdjustments([
      ...variations,
      {
        name: "Blind Freeze Copy",
        description: "Waiting players cannot see the stage.",
        kind: "inline" as const,
        direction: "harder" as const,
        lever: "information" as const,
      },
    ]);

    expect(result.harder).toHaveLength(2);
  });

  test("caps the list", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      name: `Hard ${index}`,
      description: `Hard variation ${index}`,
      kind: "inline" as const,
      direction: "harder" as const,
      lever: "rules" as const,
    }));

    expect(buildAdjustments(many).harder).toHaveLength(6);
  });
});
