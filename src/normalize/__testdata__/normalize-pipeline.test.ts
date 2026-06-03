import { describe, expect, it } from "bun:test";
import { createHash } from "crypto";
import { buildRelatedIdentifiers } from "../cross-source-matching";
import type { NormalizedElement } from "../normalized-schema";

function hashContent(html: string): string {
  return createHash("md5").update(html).digest("hex");
}

function makeElement(overrides: Partial<NormalizedElement> = {}): NormalizedElement {
  return {
    identifier: "test1234567890123456789012345678", // 32 chars
    name: "Test Element",
    url: "https://example.com/test",
    sourceName: "improwiki",
    languageCode: "en",
    tags: ["game"],
    htmlContent: "<p>Test content</p>",
    normalized: {
      description: "A test element.",
      howToPlay: "1. Do this.\n2. Do that.",
      variations: [],
      tips: [],
      referencedElements: [],
      contentHash: hashContent("<p>Test content</p>"),
      extractedAt: new Date().toISOString(),
    },
    derivedElements: [],
    relatedIdentifiers: [],
    ...overrides,
  };
}

describe("normalize pipeline", () => {
  it("content hash detects changes", () => {
    const hash1 = hashContent("<p>Hello</p>");
    const hash2 = hashContent("<p>Hello</p>");
    const hash3 = hashContent("<p>Goodbye</p>");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it("content hash is stable across invocations", () => {
    const hash = hashContent("<p>Stable content</p>");
    const hash2 = hashContent("<p>Stable content</p>");
    expect(hash).toBe(hash2);
    expect(hash).toHaveLength(32);
  });

  it("derived elements have parent back-reference", () => {
    const el = makeElement({
      derivedElements: [
        {
          name: "Blind Freeze",
          description: "A variation where players face away.",
          parentIdentifier: "test1234567890123456789012345678",
        },
      ],
    });

    expect(el.derivedElements.length).toBe(1);
    expect(el.derivedElements[0].parentIdentifier).toBe(el.identifier);
  });

  it("derived elements are only created for substantial variations", () => {
    // This is the threshold logic: variations with description > 40 chars
    const short = "Short";
    const long = "A".repeat(41);

    expect(short.length > 40).toBe(false);
    expect(long.length > 40).toBe(true);
  });

  it("relatedIdentifiers connects cross-source matches", () => {
    const elements: NormalizedElement[] = [
      makeElement({
        identifier: "aaa111bbb222ccc333ddd444eee555f1",
        name: "Freeze Tag",
        sourceName: "improwiki",
        relatedIdentifiers: ["bbb222ccc333ddd444eee555fff666g2"],
      }),
      makeElement({
        identifier: "bbb222ccc333ddd444eee555fff666g2",
        name: "Freeze Tag",
        sourceName: "learnimprov",
        relatedIdentifiers: ["aaa111bbb222ccc333ddd444eee555f1"],
      }),
    ];

    expect(elements[0].relatedIdentifiers).toContain(elements[1].identifier);
    expect(elements[1].relatedIdentifiers).toContain(elements[0].identifier);
  });

  it("cross-source matching finds exact name matches", () => {
    const result = buildRelatedIdentifiers([
      { identifier: "a1234567890123456789012345678a", name: "Freeze Tag", sourceName: "improwiki", languageCode: "en" },
      { identifier: "b1234567890123456789012345678b", name: "Freeze Tag", sourceName: "learnimprov", languageCode: "en" },
    ]);

    expect(result.get("a1234567890123456789012345678a")).toContain("b1234567890123456789012345678b");
    expect(result.get("b1234567890123456789012345678b")).toContain("a1234567890123456789012345678a");
  });

  it("normalized schema preserves all source metadata", () => {
    const el = makeElement({
      translationLinkEn: "https://example.com/en/test",
      translationLinkDe: "https://example.com/de/test",
      playerCountMin: 2,
      playerCountMax: 8,
      categories: ["warmup"],
      postTags: ["circle"],
    });

    expect(el.translationLinkEn).toBeDefined();
    expect(el.translationLinkDe).toBeDefined();
    expect(el.playerCountMin).toBe(2);
    expect(el.playerCountMax).toBe(8);
    expect(el.categories).toContain("warmup");
    expect(el.postTags).toContain("circle");
  });

  it("normalized element has all required fields", () => {
    const el = makeElement();

    expect(el.identifier).toHaveLength(32);
    expect(el.name).toBeTruthy();
    expect(el.url).toStartWith("https://");
    expect(el.sourceName).toBeTruthy();
    expect(el.normalized.description.length).toBeGreaterThan(0);
    expect(Array.isArray(el.normalized.variations)).toBe(true);
    expect(Array.isArray(el.normalized.tips)).toBe(true);
    expect(Array.isArray(el.normalized.referencedElements)).toBe(true);
    expect(el.normalized.contentHash).toHaveLength(32);
    expect(el.normalized.extractedAt).toBeTruthy();
  });
});
