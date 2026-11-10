import { describe, expect, it } from "bun:test";
import {
  AUTO_THRESHOLD,
  findReviewGroups,
  findWorkGroups,
  leadAgrees,
  normalizeTitle,
  titleSimilarity,
  type WorkSource,
} from "../work-matching";

function source(
  id: string,
  name: string,
  overrides: Partial<WorkSource> = {}
): WorkSource {
  return {
    identifier: id.padEnd(32, "0"),
    name,
    languageCode: "en",
    sourceName: "improwiki",
    lead: "",
    ...overrides,
  };
}

describe("normalizeTitle", () => {
  it("folds case, punctuation, diacritics and articles", () => {
    expect(normalizeTitle("The  Freeze-Tag!")).toBe("freeze tag");
    expect(normalizeTitle("Actor’s Nightmare")).toBe("actors nightmare");
    expect(normalizeTitle("Übung für zwei")).toBe("ubung fur zwei");
  });
});

describe("titleSimilarity", () => {
  it("is 1 for the same title", () => {
    expect(titleSimilarity("Freeze Tag", "freeze tag")).toBe(1);
  });

  it("treats an article and a plural marker as near-identical", () => {
    expect(titleSimilarity("The Freeze Tag", "Freeze Tag")).toBe(1);
    expect(titleSimilarity("Actor's Nightmare", "Actors Nightmare")).toBe(1);
  });

  it("treats a longer title with the same start as strong", () => {
    expect(titleSimilarity("Freeze", "Freeze Tag")).toBeGreaterThanOrEqual(
      AUTO_THRESHOLD
    );
  });

  it("keeps unrelated titles apart", () => {
    expect(titleSimilarity("Freeze Tag", "Conducted Story")).toBe(0);
    expect(titleSimilarity("Color Change", "Genre Zones")).toBe(0);
  });
});

describe("leadAgrees", () => {
  it("accepts a missing lead as no evidence against", () => {
    expect(leadAgrees(undefined, "Players stand in a circle")).toBe(true);
    expect(leadAgrees("", "")).toBe(true);
  });

  it("rejects two leads that share almost nothing", () => {
    expect(
      leadAgrees(
        "Players stand in a circle and pass a clap around.",
        "The conductor interrogates three suspects about an alibi."
      )
    ).toBe(false);
  });
});

describe("findWorkGroups", () => {
  it("groups same-language sources with the same title", () => {
    const groups = findWorkGroups([
      source("a", "Freeze Tag", { sourceName: "improwiki" }),
      source("b", "Freeze Tag", { sourceName: "learnimprov" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].ids).toHaveLength(2);
    expect(groups[0].confidence).toBe(1);
    expect(groups[0].method).toBe("title");
  });

  it("never merges across languages", () => {
    const groups = findWorkGroups([
      source("a", "Freeze Tag", { languageCode: "de" }),
      source("b", "Freeze Tag", { languageCode: "en" }),
    ]);

    expect(groups).toHaveLength(0);
  });

  it("keeps unrelated works separate", () => {
    const groups = findWorkGroups([
      source("a", "Color Change"),
      source("b", "Genre Zones", { sourceName: "learnimprov" }),
    ]);

    expect(groups).toHaveLength(0);
  });

  it("downgrades a title match whose leads disagree", () => {
    const groups = findWorkGroups([
      source("a", "Freeze", {
        lead: "Players stand in a circle and pass a clap around the room.",
      }),
      source("b", "Freeze", {
        sourceName: "learnimprov",
        lead: "The conductor interrogates three suspects about an alibi.",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBeLessThan(AUTO_THRESHOLD);
    expect(findReviewGroups(groups)).toHaveLength(1);
  });

  it("merges an extended title automatically", () => {
    const groups = findWorkGroups([
      source("a", "Leading"),
      source("b", "Leading Exercises", { sourceName: "learnimprov" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBeGreaterThanOrEqual(AUTO_THRESHOLD);
    expect(findReviewGroups(groups)).toHaveLength(0);
  });

  it("is independent of the input order", () => {
    const sources = [
      source("a", "Freeze Tag"),
      source("b", "Freeze Tag", { sourceName: "learnimprov" }),
      source("c", "Conducted Story"),
    ];

    const forward = findWorkGroups(sources);
    const backward = findWorkGroups([...sources].reverse());

    expect(forward).toEqual(backward);
  });

  it("does not return single sources", () => {
    expect(findWorkGroups([source("a", "Solo Game")])).toHaveLength(0);
  });
});
