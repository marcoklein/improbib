import { describe, expect, test } from "bun:test";
import type { NormalizedElement } from "../normalized-schema";
import { getNormalizedBy } from "../normalized-schema";
import {
  computeUnitHash,
  isReusableWorkNormalization,
} from "../normalize-works";

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
