import { describe, expect, test } from "bun:test";
import { parseAudit } from "./audit";
import type { Section } from "./sections";

const sections: Section[] = [0, 1, 2].map((index) => ({
  index,
  level: 2,
  heading: `Game ${index}`,
  html: `<p>Game ${index}</p>`,
  text: `Game ${index}`,
  charCount: 20,
}));

const hash = "a".repeat(32);

describe("parseAudit", () => {
  test("accepts a collection with valid section indices", () => {
    const result = parseAudit(
      JSON.stringify({ kind: "collection", children: [0, 2], reason: "two games" }),
      sections,
      hash
    );

    expect(result.kind).toBe("collection");
    expect(result.children).toEqual([0, 2]);
    expect(result.reason).toBe("two games");
  });

  test("drops indices that do not exist and duplicates", () => {
    const result = parseAudit(
      JSON.stringify({ kind: "collection", children: [0, 0, 9, 1] }),
      sections,
      hash
    );

    expect(result.children).toEqual([0, 1]);
  });

  test("downgrades a collection with fewer than two valid children", () => {
    const result = parseAudit(
      JSON.stringify({ kind: "collection", children: [0, 9] }),
      sections,
      hash
    );

    expect(result.kind).toBe("single");
    expect(result.children).toEqual([]);
  });

  test("defaults to single for an unknown kind", () => {
    const result = parseAudit(JSON.stringify({ kind: "maybe" }), sections, hash);

    expect(result.kind).toBe("single");
  });

  test("reads JSON wrapped in a markdown fence", () => {
    const result = parseAudit(
      '```json\n{"kind":"collection","children":[0,1]}\n```',
      sections,
      hash
    );

    expect(result.kind).toBe("collection");
  });
});
