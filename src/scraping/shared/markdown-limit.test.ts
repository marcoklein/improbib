import { describe, expect, test } from "bun:test";
import { MARKDOWN_MAX_CHARS, truncateMarkdown } from "./markdown-limit";

describe("truncateMarkdown", () => {
  test("keeps a body that fits", () => {
    const markdown = "a".repeat(MARKDOWN_MAX_CHARS);
    expect(truncateMarkdown(markdown)).toBe(markdown);
  });

  test("cuts on a word boundary and marks the cut", () => {
    const markdown = "wort ".repeat(MARKDOWN_MAX_CHARS);
    const result = truncateMarkdown(markdown);

    expect(result.length).toBeLessThanOrEqual(MARKDOWN_MAX_CHARS);
    expect(result.endsWith("…")).toBe(true);
    // No half word: the character before the marker is the end of a token.
    expect(result.slice(0, -1).trimEnd()).toMatch(/wort$/);
  });

  test("never exceeds the schema limit", () => {
    const result = truncateMarkdown("x".repeat(MARKDOWN_MAX_CHARS * 3));
    expect(result.length).toBeLessThanOrEqual(MARKDOWN_MAX_CHARS);
  });
});
