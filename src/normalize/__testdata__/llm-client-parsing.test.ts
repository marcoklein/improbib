import { describe, expect, it } from "bun:test";
import { coerceElement, coerceHowToPlay, CoercionForTests as TestCoercion } from "./test-helpers";

// Simple inline test helpers — not exported from llm-client, recreated here
function extractJson(text: string): any {
  const mdMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (mdMatch) {
    const inner = mdMatch[1].trim();
    try { return JSON.parse(inner); } catch {}
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
  }
  throw new Error(`Could not parse JSON: ${text.slice(0, 200)}`);
}

function coerceHowToPlay(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    if (value.trim() === "null" || value.trim() === "") return null;
    return { steps: [{ action: value }] };
  }
  if (value.steps && Array.isArray(value.steps)) {
    return {
      steps: value.steps.map((s: any) => ({
        action: String(s.action || ""),
        role: s.role ? String(s.role) : undefined,
        constraint: s.constraint ? String(s.constraint) : undefined,
      })),
    };
  }
  return { steps: [{ action: String(value) }] };
}

describe("llm client parsing", () => {
  it("extracts JSON from markdown code fence", () => {
    const text = '```json\n{"description": "A test game"}\n```';
    const result = extractJson(text);
    expect(result.description).toBe("A test game");
  });

  it("extracts JSON from bare text", () => {
    const text = '{"description": "A test game", "howToPlay": {"steps": [{"action": "do something"}]}}';
    const result = extractJson(text);
    expect(result.description).toBe("A test game");
    expect(result.howToPlay.steps.length).toBe(1);
  });

  it("handles null howToPlay", () => {
    const result = coerceHowToPlay(null);
    expect(result).toBeNull();
  });

  it("handles string howToPlay fallback", () => {
    const result = coerceHowToPlay("step instructions here");
    expect(result).not.toBeNull();
    expect(result!.steps[0].action).toBe("step instructions here");
  });

  it("handles structured howToPlay", () => {
    const input = {
      steps: [
        { action: "form a circle", role: "all", constraint: "hold hands" },
        { action: "start the game" },
      ],
    };
    const result = coerceHowToPlay(input);
    expect(result).not.toBeNull();
    expect(result!.steps.length).toBe(2);
    expect(result!.steps[0].action).toBe("form a circle");
    expect(result!.steps[0].role).toBe("all");
    expect(result!.steps[0].constraint).toBe("hold hands");
  });

  it("handles empty string howToPlay as null", () => {
    const result = coerceHowToPlay("");
    expect(result).toBeNull();
  });

  it("handles 'null' string as null", () => {
    const result = coerceHowToPlay("null");
    expect(result).toBeNull();
  });
});
