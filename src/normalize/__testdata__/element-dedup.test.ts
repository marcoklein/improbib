import { describe, expect, test } from "bun:test";
import type { NormalizedElement } from "../normalized-schema";
import {
  elementContentLength,
  findSameUrlGroups,
  mergeSameUrlDuplicates,
  normalizeElementUrl,
  pickSameUrlKeeper,
} from "../element-dedup";

function element(overrides: {
  identifier: string;
  name?: string;
  url?: string;
  sourceName?: string;
  htmlContent?: string;
  markdown?: string;
  tags?: string[];
  categories?: string[];
  postTags?: string[];
}): NormalizedElement {
  return {
    identifier: overrides.identifier.padEnd(32, "0"),
    name: overrides.name ?? "Bippity Bibbity Bop",
    url: overrides.url ?? "https://www.learnimprov.com/bippity-bibbity-bunny-bop/",
    sourceName: overrides.sourceName ?? "learnimprov",
    languageCode: "en",
    tags: overrides.tags ?? [],
    htmlContent: overrides.htmlContent ?? "",
    ...(overrides.markdown !== undefined
      ? { markdown: overrides.markdown }
      : {}),
    ...(overrides.categories ? { categories: overrides.categories } : {}),
    ...(overrides.postTags ? { postTags: overrides.postTags } : {}),
    normalized: {
      summary: "A game.",
      description: "A description of the game with enough characters.",
      howToPlay: null,
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [],
      skills: [],
      practical: {},
      contentHash: "hash",
      extractedAt: "2026-11-11T00:00:00.000Z",
      normalizedBy: "contract",
    },
    derivedElements: [],
    relatedIdentifiers: [],
  } as NormalizedElement;
}

describe("normalizeElementUrl", () => {
  test("treats a trailing slash and a fragment as the same page", () => {
    expect(
      normalizeElementUrl(
        "https://www.learnimprov.com/bippity-bibbity-bunny-bop/#respond"
      )
    ).toBe(
      normalizeElementUrl(
        "https://www.learnimprov.com/bippity-bibbity-bunny-bop"
      )
    );
  });

  test("does not equal a different slug", () => {
    expect(
      normalizeElementUrl(
        "https://www.learnimprov.com/bippity-bibbity-bunny-bop/"
      )
    ).not.toBe(
      normalizeElementUrl("https://www.learnimprov.com/bippity-bibbity-bop/")
    );
  });
});

describe("elementContentLength", () => {
  test("prefers the markdown length and falls back to the HTML length", () => {
    expect(
      elementContentLength(element({ identifier: "a", markdown: "abc" }))
    ).toBe(3);
    expect(
      elementContentLength(
        element({ identifier: "b", htmlContent: "<p>abcd</p>" })
      )
    ).toBe(11);
  });
});

describe("findSameUrlGroups", () => {
  test("groups two elements of one page", () => {
    const groups = findSameUrlGroups([
      element({ identifier: "a" }),
      element({
        identifier: "b",
        url: "https://www.learnimprov.com/bippity-bibbity-bunny-bop",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].elements.map((el) => el.identifier)).toEqual([
      "a".padEnd(32, "0"),
      "b".padEnd(32, "0"),
    ]);
  });

  test("group of three", () => {
    const groups = findSameUrlGroups([
      element({ identifier: "a" }),
      element({ identifier: "b" }),
      element({ identifier: "c" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].elements).toHaveLength(3);
  });

  test("does not group the same URL under two sources", () => {
    const groups = findSameUrlGroups([
      element({ identifier: "a", sourceName: "learnimprov" }),
      element({ identifier: "b", sourceName: "improwiki" }),
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe("pickSameUrlKeeper", () => {
  test("keeps the element with the most content", () => {
    const keeper = pickSameUrlKeeper([
      element({ identifier: "a", htmlContent: "short" }),
      element({ identifier: "b", htmlContent: "a much longer article body" }),
    ]);
    expect(keeper.identifier).toBe("b".padEnd(32, "0"));
  });

  test("breaks a length tie by the lowest identifier", () => {
    const keeper = pickSameUrlKeeper([
      element({ identifier: "c", htmlContent: "same length" }),
      element({ identifier: "a", htmlContent: "same length" }),
    ]);
    expect(keeper.identifier).toBe("a".padEnd(32, "0"));
  });
});

describe("mergeSameUrlDuplicates", () => {
  test("keeps the longest of three and unions the metadata", () => {
    const { elements, merges } = mergeSameUrlDuplicates([
      element({
        identifier: "a",
        htmlContent: "short",
        tags: ["Warm-Up"],
        categories: ["Warm Ups"],
      }),
      element({
        identifier: "b",
        markdown: "x".repeat(200),
        tags: ["Exercise"],
        postTags: ["Circle"],
      }),
      element({
        identifier: "c",
        htmlContent: "medium length body",
        tags: ["Handle"],
        postTags: ["Circle"],
      }),
    ]);

    expect(merges).toHaveLength(1);
    expect(merges[0].keeper.identifier).toBe("b".padEnd(32, "0"));
    expect(merges[0].duplicates.map((el) => el.identifier)).toEqual([
      "a".padEnd(32, "0"),
      "c".padEnd(32, "0"),
    ]);

    expect(elements).toHaveLength(1);
    const keeper = elements[0];
    expect(keeper.identifier).toBe("b".padEnd(32, "0"));
    expect(keeper.tags).toEqual(["Exercise", "Warm-Up", "Handle"]);
    expect(keeper.categories).toEqual(["Warm Ups"]);
    expect(keeper.postTags).toEqual(["Circle"]);
  });

  test("merges on a trailing slash or fragment", () => {
    const { elements, merges } = mergeSameUrlDuplicates([
      element({
        identifier: "a",
        url: "https://www.learnimprov.com/bippity-bibbity-bunny-bop/",
      }),
      element({
        identifier: "b",
        url: "https://www.learnimprov.com/bippity-bibbity-bunny-bop",
      }),
    ]);
    expect(merges).toHaveLength(1);
    expect(elements).toHaveLength(1);
  });

  test("keeps the same URL under two sources apart", () => {
    const { elements, merges } = mergeSameUrlDuplicates([
      element({
        identifier: "a",
        sourceName: "learnimprov",
        url: "https://example.com/shared-page/",
      }),
      element({
        identifier: "b",
        sourceName: "improwiki",
        url: "https://example.com/shared-page/",
      }),
    ]);
    expect(merges).toHaveLength(0);
    expect(elements).toHaveLength(2);
  });

  test("leaves unrelated elements untouched and keeps their order", () => {
    const input = [
      element({ identifier: "a", url: "https://example.com/a" }),
      element({ identifier: "b", url: "https://example.com/b" }),
    ];
    const { elements } = mergeSameUrlDuplicates(input);
    expect(elements.map((el) => el.identifier)).toEqual([
      "a".padEnd(32, "0"),
      "b".padEnd(32, "0"),
    ]);
  });
});
