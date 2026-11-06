import { describe, expect, test } from "bun:test";
import type { NormalizedElement } from "../normalized-schema";
import { isReusableNormalization } from "../normalize";

function normalized(overrides: {
  summary?: string;
  description?: string;
  contentHash?: string;
  normalizedBy?: string;
  model?: string;
}): NormalizedElement {
  return {
    identifier: "a".repeat(32),
    name: "Some element",
    url: "https://improwiki.com/de/wiki/some-element",
    sourceName: "improwiki",
    languageCode: "de",
    tags: [],
    htmlContent: "",
    normalized: {
      summary: overrides.summary ?? "Eine Übung zum Einprägen von Namen.",
      description:
        overrides.description ??
        "Die Spieler bilden einen Kreis und tauschen ihre Namen.",
      howToPlay: null,
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [],
      skills: [],
      practical: {},
      contentHash: overrides.contentHash ?? "hash-1",
      extractedAt: "2026-06-07T04:26:14.680Z",
      normalizedBy: overrides.normalizedBy ?? "contract-1",
      model: overrides.model,
    },
    derivedElements: [],
    relatedIdentifiers: [],
  };
}

describe("isReusableNormalization", () => {
  test("reuses a complete extraction with the same content and contract", () => {
    expect(isReusableNormalization(normalized({}), "hash-1", "contract-1")).toBe(
      true
    );
  });

  test("rejects a missing previous extraction", () => {
    expect(isReusableNormalization(undefined, "hash-1", "contract-1")).toBe(
      false
    );
  });

  test("retries when the content changed", () => {
    expect(isReusableNormalization(normalized({}), "hash-2", "contract-1")).toBe(
      false
    );
  });

  test("retries when the extraction contract changed", () => {
    expect(isReusableNormalization(normalized({}), "hash-1", "contract-2")).toBe(
      false
    );
  });

  test("retries an extraction that stored an empty summary", () => {
    // This is what froze Namenskreis, Status Chain, Duet and König: the failed
    // extraction kept matching hashes, so it was never attempted again.
    expect(
      isReusableNormalization(normalized({ summary: "" }), "hash-1", "contract-1")
    ).toBe(false);
  });

  test("retries an extraction that stored a blank summary", () => {
    expect(
      isReusableNormalization(
        normalized({ summary: "   " }),
        "hash-1",
        "contract-1"
      )
    ).toBe(false);
  });

  test("retries an extraction that stored an empty description", () => {
    expect(
      isReusableNormalization(
        normalized({ description: "" }),
        "hash-1",
        "contract-1"
      )
    ).toBe(false);
  });

  test("reuses an entry that predates provenance and has no model", () => {
    // Entries written before `model` existed must not trigger a paid
    // re-extraction just because the field is absent.
    expect(
      isReusableNormalization(normalized({}), "hash-1", "contract-1", [
        "deepseek-v4.1-flash",
      ])
    ).toBe(true);
  });

  test("reuses an entry produced by a configured model", () => {
    expect(
      isReusableNormalization(
        normalized({ model: "deepseek-v4.1-flash" }),
        "hash-1",
        "contract-1",
        ["deepseek-v4.1-flash"]
      )
    ).toBe(true);
  });

  test("retries an entry produced by a model that is no longer configured", () => {
    expect(
      isReusableNormalization(
        normalized({ model: "deepseek-v4-flash" }),
        "hash-1",
        "contract-1",
        ["deepseek-v4.1-flash"]
      )
    ).toBe(false);
  });
});