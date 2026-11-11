import { describe, expect, test } from "bun:test";
import {
  isForcedIdentifier,
  isForcedUnit,
  parseForceIds,
} from "../force-ids";

describe("parseForceIds", () => {
  test("splits, trims and drops empty entries", () => {
    expect([...parseForceIds(" aaa , bbb,, ccc ")]).toEqual([
      "aaa",
      "bbb",
      "ccc",
    ]);
  });

  test("is empty when the variable is unset or blank", () => {
    expect(parseForceIds(undefined).size).toBe(0);
    expect(parseForceIds("   ").size).toBe(0);
  });
});

describe("isForcedIdentifier", () => {
  const forced = parseForceIds("aaa");

  test("matches a listed identifier only", () => {
    expect(isForcedIdentifier("aaa", forced)).toBe(true);
    expect(isForcedIdentifier("bbb", forced)).toBe(false);
    expect(isForcedIdentifier(undefined, forced)).toBe(false);
  });
});

describe("isForcedUnit", () => {
  const forced = parseForceIds("bbb");

  test("matches a unit when any member is listed", () => {
    expect(isForcedUnit(["aaa", "bbb"], forced)).toBe(true);
  });

  test("does not match a unit whose members are unlisted", () => {
    expect(isForcedUnit(["aaa", "ccc"], forced)).toBe(false);
    expect(isForcedUnit([], forced)).toBe(false);
  });
});
