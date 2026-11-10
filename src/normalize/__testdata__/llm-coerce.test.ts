import { describe, expect, it } from "bun:test";
import { parseNormalizeResponse } from "../llm-client";

describe("parseNormalizeResponse", () => {
  it("keeps the fields the model nests inside howToPlay", () => {
    const parsed = parseNormalizeResponse(
      JSON.stringify({
        summary: "Freeze Tag is a classic.",
        description: "Two players start, someone freezes them.",
        howToPlay: {
          steps: [{ action: "Start a scene" }, { action: "Call freeze" }],
          tips: [{ text: "Commit to the pose", category: "staging" }],
          variations: [
            { name: "Blind Freeze", description: "Eyes closed", differsBy: ["sight"] },
          ],
          mechanics: [{ name: "freeze signal", category: "signal" }],
          skills: ["impulse", "attention"],
          practical: {
            difficulty: "beginner",
            energyLevel: "high",
            usage: ["rehearsal", "show"],
            requires: "open stage area",
          },
        },
      })
    ) as any;

    expect(parsed.normalized.howToPlay.steps).toHaveLength(2);
    expect(parsed.normalized.tips).toHaveLength(1);
    expect(parsed.normalized.variations).toHaveLength(1);
    expect(parsed.normalized.mechanics).toHaveLength(1);
    expect(parsed.normalized.skills).toEqual(["impulse", "attention"]);
    expect(parsed.normalized.practical.usage).toEqual(["rehearsal", "show"]);
    expect(parsed.normalized.practical.requires).toBe("open stage area");
  });

  it("prefers the top level over a nested duplicate", () => {
    const parsed = parseNormalizeResponse(
      JSON.stringify({
        summary: "Summary",
        description: "Description long enough",
        tips: [{ text: "Top level tip", category: "general" }],
        howToPlay: {
          steps: [{ action: "Do it" }],
          tips: [{ text: "Nested tip", category: "general" }],
        },
      })
    ) as any;

    expect(parsed.normalized.tips.map((tip: any) => tip.text)).toEqual([
      "Top level tip",
    ]);
  });

  it("maps free-text skills to the fixed vocabulary and drops the rest", () => {
    const parsed = parseNormalizeResponse(
      JSON.stringify({
        summary: "Summary",
        description: "Description long enough",
        howToPlay: { steps: [{ action: "Do it" }] },
        skills: ["active listening", "body awareness", "crime"],
      })
    ) as any;

    expect(parsed.normalized.skills).toEqual(["attention", "physicality"]);
  });

  it("treats an empty requirement as no requirement", () => {
    const parsed = parseNormalizeResponse(
      JSON.stringify({
        summary: "Summary",
        description: "Description long enough",
        howToPlay: { steps: [{ action: "Do it" }] },
        practical: { difficulty: "beginner", requires: "nichts" },
      })
    ) as any;

    expect(parsed.normalized.practical.requires).toBeUndefined();
  });
});
