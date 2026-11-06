import { describe, expect, it } from "bun:test";
import { ACTIVE_SOURCES, ARCHIVED_SOURCES, isActiveSource } from "./sources";

describe("published sources", () => {
  it("publishes improwiki and learnimprov only", () => {
    expect([...ACTIVE_SOURCES]).toEqual(["improwiki", "learnimprov"]);
  });

  it("keeps ircwiki archived instead of silently dropping it", () => {
    expect([...ARCHIVED_SOURCES]).toEqual(["ircwiki"]);
    expect(isActiveSource("ircwiki")).toBeFalse();
  });

  it("does not overlap active and archived sources", () => {
    const active = new Set<string>(ACTIVE_SOURCES);
    for (const source of ARCHIVED_SOURCES) {
      expect(active.has(source)).toBeFalse();
    }
  });

  it("recognizes the active sources", () => {
    for (const source of ACTIVE_SOURCES) {
      expect(isActiveSource(source)).toBeTrue();
    }
  });
});