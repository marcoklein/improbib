import { describe, expect, it } from "bun:test";
import {
  findCrossSourceMatches,
  buildRelatedIdentifiers,
  type MatchCandidate,
} from "../cross-source-matching";

const makeCandidate = (
  id: string,
  name: string,
  source: string,
  lang = "en",
): MatchCandidate => ({
  identifier: id,
  name,
  sourceName: source,
  languageCode: lang,
});

describe("cross-source-matching", () => {
  it("matches identical names across sources", () => {
    const matches = findCrossSourceMatches([
      makeCandidate("a1", "Freeze Tag", "improwiki"),
      makeCandidate("b1", "Freeze Tag", "learnimprov"),
      makeCandidate("c1", "Unrelated Game", "improwiki"),
    ]);

    expect(matches.length).toBe(1);
    expect(matches[0].score).toBe(1.0);
    expect(matches[0].a.identifier).toBe("a1");
    expect(matches[0].b.identifier).toBe("b1");
  });

  it("does not match within same source", () => {
    const matches = findCrossSourceMatches([
      makeCandidate("a1", "Freeze Tag", "improwiki"),
      makeCandidate("a2", "Freeze Tag", "improwiki"),
    ]);

    expect(matches.length).toBe(0);
  });

  it("matches similar names with token overlap", () => {
    const matches = findCrossSourceMatches([
      makeCandidate("a1", "Translation Healthcare", "improwiki"),
      makeCandidate("b1", "Healthcare Translation", "learnimprov"),
    ]);

    expect(matches.length).toBe(1);
    expect(matches[0].score).toBeGreaterThan(0.8);
  });

  it("matches ignoring punctuation and case", () => {
    const matches = findCrossSourceMatches([
      makeCandidate("a1", "Yes - No", "improwiki"),
      makeCandidate("b1", "Yes No", "learnimprov"),
    ]);

    expect(matches.length).toBe(1);
    expect(matches[0].score).toBeGreaterThan(0.8);
  });

  it("does not match unrelated names", () => {
    const matches = findCrossSourceMatches([
      makeCandidate("a1", "Freeze Tag", "improwiki"),
      makeCandidate("b1", "Counting Circle", "learnimprov"),
    ]);

    expect(matches.length).toBe(0);
  });

  it("matches German and English versions of the same game", () => {
    const matches = findCrossSourceMatches([
      makeCandidate("a1", "Freeze Tag", "improwiki", "en"),
      makeCandidate("b1", "Freeze Tag", "learnimprov", "en"),
      makeCandidate("c1", "Gefühlspunkte", "improwiki", "de"),
      makeCandidate("d1", "Unrelated", "learnimprov", "en"),
    ]);

    expect(matches.length).toBe(1);
    expect(matches[0].a.name).toBe("Freeze Tag");
  });

  it("buildRelatedIdentifiers returns correct map", () => {
    const related = buildRelatedIdentifiers([
      makeCandidate("a1", "Freeze Tag", "improwiki"),
      makeCandidate("b1", "Freeze Tag", "learnimprov"),
      makeCandidate("c1", "Translation Healthcare", "improwiki"),
      makeCandidate("d1", "Healthcare Translation", "learnimprov"),
      makeCandidate("e1", "Unique Game", "ircwiki"),
    ]);

    expect(related.get("a1")).toContain("b1");
    expect(related.get("b1")).toContain("a1");
    expect(related.get("c1")).toContain("d1");
    expect(related.get("d1")).toContain("c1");
    expect(related.get("e1")).toBeUndefined();
  });
});
