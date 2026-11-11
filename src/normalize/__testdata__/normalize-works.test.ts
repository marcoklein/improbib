import { describe, expect, test } from "bun:test";
import type { NormalizedElement } from "../normalized-schema";
import { getNormalizedBy } from "../normalized-schema";
import {
  buildWorkMember,
  computeUnitHash,
  isReusableWorkNormalization,
  shouldReuseWorkNormalization,
} from "../normalize-works";
import type { RawSourceElement } from "../normalize-works";

function normalized(overrides?: {
  summary?: string;
  description?: string;
  contentHash?: string;
  normalizedBy?: string;
}): NormalizedElement["normalized"] {
  return {
    summary: overrides?.summary ?? "One work built from two source pages.",
    description:
      overrides?.description ??
      "The merged extraction explains how the work is played.",
    howToPlay: null,
    variations: [],
    tips: [],
    referencedElements: [],
    mechanics: [],
    skills: [],
    practical: {},
    contentHash: overrides?.contentHash ?? "unit-hash",
    extractedAt: "2026-11-10T00:00:00.000Z",
    normalizedBy: overrides?.normalizedBy ?? "contract",
  };
}

describe("computeUnitHash", () => {
  test("is independent of member order", () => {
    const first = computeUnitHash([
      { identifier: "a".repeat(32), htmlContent: "<p>Alpha</p>" },
      { identifier: "b".repeat(32), htmlContent: "<p>Beta</p>" },
    ]);
    const second = computeUnitHash([
      { identifier: "b".repeat(32), htmlContent: "<p>Beta</p>" },
      { identifier: "a".repeat(32), htmlContent: "<p>Alpha</p>" },
    ]);

    expect(first).toBe(second);
  });

  test("changes when a member page changes", () => {
    const before = computeUnitHash([
      { identifier: "a".repeat(32), htmlContent: "<p>Alpha</p>" },
      { identifier: "b".repeat(32), htmlContent: "<p>Beta</p>" },
    ]);
    const after = computeUnitHash([
      { identifier: "a".repeat(32), htmlContent: "<p>Alpha</p>" },
      { identifier: "b".repeat(32), htmlContent: "<p>Beta changed</p>" },
    ]);

    expect(before).not.toBe(after);
  });
});

describe("isReusableWorkNormalization", () => {
  test("reuses a complete unit with the same hash and contract", () => {
    expect(
      isReusableWorkNormalization(
        { normalized: normalized({ normalizedBy: getNormalizedBy() }) },
        "unit-hash",
        getNormalizedBy()
      )
    ).toBe(true);
  });

  test("a contract bump invalidates the cached unit", () => {
    expect(
      isReusableWorkNormalization(
        { normalized: normalized({ normalizedBy: getNormalizedBy() }) },
        "unit-hash",
        "a-newer-contract"
      )
    ).toBe(false);
  });

  test("a changed unit invalidates the cached unit", () => {
    expect(
      isReusableWorkNormalization(
        { normalized: normalized({ normalizedBy: getNormalizedBy() }) },
        "different-hash",
        getNormalizedBy()
      )
    ).toBe(false);
  });

  test("an empty summary is a cache miss", () => {
    expect(
      isReusableWorkNormalization(
        {
          normalized: normalized({
            summary: "",
            normalizedBy: getNormalizedBy(),
          }),
        },
        "unit-hash",
        getNormalizedBy()
      )
    ).toBe(false);
  });

  test("an empty description is a cache miss", () => {
    expect(
      isReusableWorkNormalization(
        {
          normalized: normalized({
            description: "",
            normalizedBy: getNormalizedBy(),
          }),
        },
        "unit-hash",
        getNormalizedBy()
      )
    ).toBe(false);
  });

  test("a missing previous unit is a cache miss", () => {
    expect(
      isReusableWorkNormalization(undefined, "unit-hash", getNormalizedBy())
    ).toBe(false);
  });
});

describe("shouldReuseWorkNormalization", () => {
  const cached = { normalized: normalized({ normalizedBy: getNormalizedBy() }) };
  const memberIds = ["a".repeat(32), "b".repeat(32)];

  test("reuses a cached unit when no member is forced", () => {
    expect(
      shouldReuseWorkNormalization(
        cached,
        "unit-hash",
        getNormalizedBy(),
        memberIds,
        new Set()
      )
    ).toBe(true);
  });

  test("re-extracts a cached unit when any member is forced", () => {
    // NORMALIZE_FORCE_IDS must win over a matching hash, otherwise a prompt fix
    // would never reach an already-cached work.
    expect(
      shouldReuseWorkNormalization(
        cached,
        "unit-hash",
        getNormalizedBy(),
        memberIds,
        new Set([memberIds[1]])
      )
    ).toBe(false);
  });
});

describe("buildWorkMember", () => {
  const raw: RawSourceElement = {
    identifier: "a".repeat(32),
    name: "Half-Life",
    url: "https://improwiki.com/de/wiki/half-life",
    sourceName: "improwiki",
    languageCode: "de",
    tags: ["game"],
    htmlContent: "<p>Spielt das Spiel</p>",
    translationLinkEn: "https://improwiki.com/en/wiki/half-life",
    translationLinkEnIdentifier: "b".repeat(32),
    playerCountMin: 3,
    categories: ["game"],
    lastModified: "2026-01-01",
  };
  const block = normalized({ normalizedBy: getNormalizedBy() });

  test("copies the raw metadata and keeps the work block unchanged", () => {
    const member = buildWorkMember(raw, block);

    expect(member).toBeDefined();
    expect(member?.identifier).toBe(raw.identifier);
    expect(member?.name).toBe(raw.name);
    expect(member?.url).toBe(raw.url);
    expect(member?.sourceName).toBe(raw.sourceName);
    expect(member?.languageCode).toBe(raw.languageCode);
    expect(member?.tags).toEqual(["game"]);
    expect(member?.htmlContent).toBe("<p>Spielt das Spiel</p>");
    expect(member?.translationLinkEn).toBe(
      "https://improwiki.com/en/wiki/half-life"
    );
    expect(member?.translationLinkEnIdentifier).toBe("b".repeat(32));
    expect(member?.playerCountMin).toBe(3);
    expect(member?.categories).toEqual(["game"]);
    expect(member?.lastModified).toBe("2026-01-01");
    expect(member?.derivedElements).toEqual([]);
    expect(member?.relatedIdentifiers).toEqual([]);
    // The cache key belongs to the unit, not to the member page.
    expect(member?.normalized).toBe(block);
    expect(member?.normalized.contentHash).toBe(block.contentHash);
    expect(member?.normalized.extractedAt).toBe(block.extractedAt);
    expect(member?.normalized.normalizedBy).toBe(block.normalizedBy);
  });

  test("returns undefined when the works stage has no block yet", () => {
    expect(buildWorkMember(raw, undefined)).toBeUndefined();
  });
});
