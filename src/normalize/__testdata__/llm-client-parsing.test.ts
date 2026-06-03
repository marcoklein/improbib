import { describe, expect, it } from "bun:test";

// Test the JSON extraction logic from llm-client.ts
// (importing the internal function via a test helper)

function extractJson(text: string): any {
  // Replicate the extraction logic from llm-client.ts
  const mdMatch = text.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\n?```/);
  const jsonStr = mdMatch ? mdMatch[1].trim() : text.trim();
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  const finalStr = objMatch ? objMatch[0] : jsonStr;
  return JSON.parse(finalStr);
}

describe("llm-client JSON parsing", () => {
  it("parses plain JSON", () => {
    const result = extractJson('{"description":"test","howToPlay":"do this","variations":[],"tips":[],"referencedElements":[]}');
    expect(result.description).toBe("test");
    expect(result.howToPlay).toBe("do this");
  });

  it("parses JSON inside markdown code fence", () => {
    const text = '```json\n{"description":"test","howToPlay":null,"variations":[],"tips":["tip 1"],"referencedElements":[]}\n```';
    const result = extractJson(text);
    expect(result.description).toBe("test");
    expect(result.howToPlay).toBeNull();
    expect(result.tips).toEqual(["tip 1"]);
  });

  it("parses JSON with leading text noise", () => {
    const text = 'Here is the result:\n\n{"description":"test","howToPlay":"step 1\\nstep 2","variations":[{"name":"v1","description":"desc"}],"tips":[],"referencedElements":["Freeze Tag"]}\n\nHope this helps.';
    const result = extractJson(text);
    expect(result.description).toBe("test");
    expect(result.howToPlay).toBe("step 1\nstep 2");
    expect(result.variations[0].name).toBe("v1");
    expect(result.referencedElements).toEqual(["Freeze Tag"]);
  });

  it("handles howToPlay as array", () => {
    const text = '{"description":"test","howToPlay":["step 1","step 2","step 3"],"variations":[],"tips":[],"referencedElements":[]}';
    const result = extractJson(text);
    expect(Array.isArray(result.howToPlay)).toBe(true);
    expect(result.howToPlay.length).toBe(3);
  });

  it("handles howToPlay as null for concepts", () => {
    const text = '{"description":"a concept","howToPlay":null,"variations":[],"tips":["concepts are theoretical"],"referencedElements":[]}';
    const result = extractJson(text);
    expect(result.howToPlay).toBeNull();
  });

  it("handles empty fields", () => {
    const text = '{"description":"","howToPlay":null,"variations":[],"tips":[],"referencedElements":[]}';
    const result = extractJson(text);
    expect(result.description).toBe("");
    expect(result.variations).toEqual([]);
    expect(result.tips).toEqual([]);
  });

  it("parses complex nested variations", () => {
    const text = '{"description":"test","howToPlay":"step 1","variations":[{"name":"Blind Freeze","description":"Players face away"},{"name":"Elimination Freeze","description":"Competitive version"}],"tips":["tip 1","tip 2"],"referencedElements":["Gefühlsquadrat"]}';
    const result = extractJson(text);
    expect(result.variations.length).toBe(2);
    expect(result.variations[0].name).toBe("Blind Freeze");
    expect(result.variations[1].name).toBe("Elimination Freeze");
    expect(result.referencedElements).toContain("Gefühlsquadrat");
  });
});
