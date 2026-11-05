import { describe, expect, test } from "bun:test";
import {
  groundEvidence,
  toAnnotations,
  type ClassifiableVariation,
} from "./challenge-schema";

const variations: ClassifiableVariation[] = [
  {
    name: "Blind Freeze",
    description:
      "Waiting players stand with their back to the stage and must work with whatever picture they find.",
    differsBy: ["limited information"],
  },
  {
    name: "Structured Freeze",
    description: "A fixed stage left pose is required.",
    differsBy: [],
  },
];

describe("groundEvidence", () => {
  test("accepts a verbatim quote", () => {
    expect(
      groundEvidence(
        variations[0].description,
        "stand with their back to the stage"
      )
    ).toBe("stand with their back to the stage");
  });

  test("ignores punctuation and casing", () => {
    expect(
      groundEvidence(variations[0].description, "Stand with their BACK to the stage.")
    ).toBe("stand with their back to the stage");
  });

  test("keeps the verbatim part of a paraphrase", () => {
    expect(
      groundEvidence(
        variations[0].description,
        "players cannot prepare because they stand with their back to the stage"
      )
    ).toBe("stand with their back to the stage");
  });

  test("rejects quotes that are not in the text", () => {
    expect(
      groundEvidence(variations[0].description, "players are eliminated")
    ).toBeUndefined();
  });

  test("accepts a two-word quote but not a single word", () => {
    expect(groundEvidence(variations[0].description, "back stage")).toBeUndefined();
    expect(groundEvidence(variations[0].description, "waiting players")).toBe(
      "Waiting players"
    );
  });
});

describe("toAnnotations", () => {
  test("accepts a grounded classification", () => {
    const result = toAnnotations(variations, [
      {
        index: 0,
        direction: "harder",
        lever: "information",
        evidence: "stand with their back to the stage",
      },
    ]);

    expect(result[0]).toEqual({
      name: "Blind Freeze",
      direction: "harder",
      lever: "information",
      evidence: "stand with their back to the stage",
    });
  });

  test("downgrades a classification without a verbatim quote", () => {
    const result = toAnnotations(variations, [
      {
        index: 0,
        direction: "harder",
        lever: "information",
        evidence: "players cannot see anything",
      },
    ]);

    expect(result[0].direction).toBe("unknown");
    expect(result[0].lever).toBeNull();
    expect(result[0].evidence).toBe("");
  });

  test("keeps unknown as unknown", () => {
    const result = toAnnotations(variations, [
      { index: 1, direction: "unknown", lever: "rules", evidence: "" },
    ]);

    expect(result[1].direction).toBe("unknown");
    expect(result[1].lever).toBeNull();
  });

  test("fills missing items with unknown", () => {
    const result = toAnnotations(variations, []);

    expect(result).toHaveLength(2);
    expect(result.every((item) => item.direction === "unknown")).toBe(true);
  });

  test("drops an invalid lever", () => {
    const result = toAnnotations(variations, [
      {
        index: 1,
        direction: "easier",
        lever: "difficulty",
        evidence: "fixed stage left pose",
      },
    ]);

    expect(result[1].direction).toBe("easier");
    expect(result[1].lever).toBeNull();
  });
});
