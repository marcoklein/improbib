import { describe, expect, test } from "bun:test";
import type { ElementType } from "./element-type";
import { dedupeElementsByUrl } from "./merge-elements";

function element(overrides: {
  identifier: string;
  name?: string;
  url?: string;
  sourceName?: string;
  fetchedAt?: string;
  htmlContent?: string;
  markdown?: string;
  tags?: string[];
  categories?: string[];
}): ElementType {
  return {
    identifier: overrides.identifier.padEnd(32, "0"),
    name: overrides.name ?? "Bippity Bibbity Bop",
    url: overrides.url ?? "https://www.learnimprov.com/bippity-bibbity-bunny-bop/",
    sourceName: overrides.sourceName ?? "learnimprov",
    languageCode: "en",
    tags: overrides.tags ?? [],
    htmlContent: overrides.htmlContent ?? "",
    fetchedAt: overrides.fetchedAt,
    ...(overrides.markdown !== undefined ? { markdown: overrides.markdown } : {}),
    ...(overrides.categories ? { categories: overrides.categories } : {}),
  } as ElementType;
}

describe("dedupeElementsByUrl", () => {
  test("keeps one element when a title change produced a second identifier", () => {
    const output = {
      elements: [
        element({
          identifier: "stale",
          name: "Bippity Bibbity BunnBop",
          fetchedAt: "2026-10-01T00:00:00.000Z",
        }),
        element({
          identifier: "fresh",
          name: "Bippity Bibbity Bop",
          fetchedAt: "2026-11-11T00:00:00.000Z",
        }),
      ],
    };

    expect(dedupeElementsByUrl(output)).toBe(1);
    expect(output.elements.map((el) => el.identifier)).toEqual([
      "fresh".padEnd(32, "0"),
    ]);
  });

  test("unions the tags discovered through the other listing page", () => {
    const output = {
      elements: [
        element({
          identifier: "stale",
          fetchedAt: "2026-10-01T00:00:00.000Z",
          tags: ["Warm-Up"],
          categories: ["Warm Ups"],
        }),
        element({
          identifier: "fresh",
          fetchedAt: "2026-11-11T00:00:00.000Z",
          tags: ["Exercise"],
        }),
      ],
    };

    dedupeElementsByUrl(output);
    expect(output.elements[0].tags).toEqual(["Exercise", "Warm-Up"]);
    expect(output.elements[0].categories).toEqual(["Warm Ups"]);
  });

  test("compares the URL conservatively", () => {
    const output = {
      elements: [
        element({
          identifier: "a",
          url: "https://www.learnimprov.com/page/#top",
          fetchedAt: "2026-10-01T00:00:00.000Z",
        }),
        element({
          identifier: "b",
          url: "https://www.learnimprov.com/page",
          fetchedAt: "2026-11-11T00:00:00.000Z",
        }),
      ],
    };

    expect(dedupeElementsByUrl(output)).toBe(1);
    expect(output.elements).toHaveLength(1);
  });

  test("keeps different URLs and different sources", () => {
    const output = {
      elements: [
        element({ identifier: "a", url: "https://example.com/a" }),
        element({ identifier: "b", url: "https://example.com/b" }),
        element({
          identifier: "c",
          url: "https://example.com/a",
          sourceName: "improwiki",
        }),
      ],
    };

    expect(dedupeElementsByUrl(output)).toBe(0);
    expect(output.elements).toHaveLength(3);
  });
});

describe("dedupeElementsByUrl keeper rule", () => {
  test("agrees with the dedup stage: more content beats a newer fetch", () => {
    const output = {
      elements: [
        element({
          identifier: "older-but-complete",
          fetchedAt: "2026-10-01T00:00:00.000Z",
          htmlContent: "<p>" + "x".repeat(500) + "</p>",
        }),
        element({
          identifier: "newer-but-short",
          fetchedAt: "2026-11-11T00:00:00.000Z",
          htmlContent: "<p>short</p>",
        }),
      ],
    };

    dedupeElementsByUrl(output);

    // The dedup stage would keep the longer one; the scraper must not decide
    // differently just because it sees the duplicate first.
    expect(output.elements.map((el) => el.identifier)).toEqual([
      "older-but-complete".padEnd(32, "0"),
    ]);
  });
});
