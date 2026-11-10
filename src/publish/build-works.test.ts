import { describe, expect, test } from "bun:test";
import type { NormalizedElement } from "../normalize/normalized-schema";
import { buildWorks, normalizeName } from "./build-works";

let counter = 0;

function makeElement(input: {
  name: string;
  sourceName: string;
  languageCode?: "de" | "en";
  identifier?: string;
  variations?: string[];
  mechanics?: string[];
  relatedIdentifiers?: { identifier: string; confidence: number }[];
  translationLinkDeIdentifier?: string;
  translationLinkEnIdentifier?: string;
  normalized?: Partial<NormalizedElement["normalized"]>;
}): NormalizedElement {
  counter++;
  const identifier = input.identifier ?? `${counter}`.padStart(32, "0");
  const languageCode = input.languageCode ?? "en";

  return {
    identifier,
    name: input.name,
    url: `https://example.com/${identifier}`,
    sourceName: input.sourceName,
    languageCode,
    tags: [],
    htmlContent: "<p>content</p>",
    normalized: {
      summary: `Summary of ${input.name}`,
      description: `Description of ${input.name}`,
      howToPlay: { steps: [{ action: "Do the thing" }] },
      variations: (input.variations ?? []).map((name) => ({
        name,
        description: `Description of ${name}`,
        differsBy: [],
      })),
      tips: [],
      referencedElements: [],
      mechanics: (input.mechanics ?? []).map((name) => ({ name })),
      skills: [],
      practical: {},
      contentHash: `hash-${identifier}`,
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test",
      ...input.normalized,
    },
    derivedElements: [],
    relatedIdentifiers: input.relatedIdentifiers ?? [],
    ...(input.translationLinkDeIdentifier
      ? { translationLinkDeIdentifier: input.translationLinkDeIdentifier }
      : {}),
    ...(input.translationLinkEnIdentifier
      ? { translationLinkEnIdentifier: input.translationLinkEnIdentifier }
      : {}),
  };
}

function relation(identifier: string, confidence: number) {
  return { identifier, confidence };
}

describe("normalizeName", () => {
  test("lowercases, drops parentheticals and collapses whitespace", () => {
    expect(normalizeName("  Freeze  Tag (Variation) ")).toBe("freeze tag");
  });
});

describe("buildWorks", () => {
  test("merges same-language elements at or above the confidence threshold", () => {
    const improwiki = makeElement({ name: "Freeze Tag", sourceName: "improwiki" });
    const learnimprov = makeElement({
      name: "Freeze",
      sourceName: "learnimprov",
      relatedIdentifiers: [relation(improwiki.identifier, 0.95)],
    });
    improwiki.relatedIdentifiers = [relation(learnimprov.identifier, 0.95)];

    const works = buildWorks([improwiki, learnimprov]);

    expect(works).toHaveLength(1);
    expect(works[0].memberIds).toEqual(
      [improwiki.identifier, learnimprov.identifier].sort()
    );
    // improwiki wins the canonical slot.
    expect(works[0].canonicalElementId).toBe(improwiki.identifier);
  });

  test("keeps low-confidence relations apart (Acts of god regression)", () => {
    // The graph used to chain 0.7 edges into {Acts of god, Freeze-Endowment,
    // Clap-In}. Publication must not repeat that.
    const acts = makeElement({ name: "Acts of god", sourceName: "improwiki" });
    const freezeEndowment = makeElement({
      name: "Freeze-Endowment",
      sourceName: "learnimprov",
      relatedIdentifiers: [relation(acts.identifier, 0.7)],
    });
    const clapIn = makeElement({
      name: "Clap-In",
      sourceName: "ircwiki",
      relatedIdentifiers: [relation(freezeEndowment.identifier, 0.7)],
    });
    acts.relatedIdentifiers = [relation(freezeEndowment.identifier, 0.7)];
    freezeEndowment.relatedIdentifiers.push(relation(clapIn.identifier, 0.7));

    const works = buildWorks([acts, freezeEndowment, clapIn]);

    expect(works).toHaveLength(3);
    expect(works.every((work) => work.memberIds.length === 1)).toBe(true);
  });

  test("never merges across languages, but links the translation group", () => {
    const en = makeElement({
      name: "Freeze Tag",
      sourceName: "improwiki",
      languageCode: "en",
    });
    const de = makeElement({
      name: "Freeze Tag",
      sourceName: "improwiki",
      languageCode: "de",
    });
    en.translationLinkDeIdentifier = de.identifier;
    de.translationLinkEnIdentifier = en.identifier;
    // A rogue cross-language relation must not collapse the two works.
    en.relatedIdentifiers = [relation(de.identifier, 1)];

    const works = buildWorks([en, de]);

    expect(works).toHaveLength(2);
    expect(works[0].translationId).toBeDefined();
    expect(works[0].translationId).toBe(works[1].translationId);
    expect(works[0].translationId ?? "").toStartWith("tr:");
  });

  test("creates one translation group per DE/EN pair", () => {
    const enA = makeElement({ name: "A", sourceName: "improwiki", languageCode: "en" });
    const deA = makeElement({ name: "A", sourceName: "improwiki", languageCode: "de" });
    const enB = makeElement({ name: "B", sourceName: "improwiki", languageCode: "en" });
    const deB = makeElement({ name: "B", sourceName: "improwiki", languageCode: "de" });
    enA.translationLinkDeIdentifier = deA.identifier;
    deA.translationLinkEnIdentifier = enA.identifier;
    enB.translationLinkDeIdentifier = deB.identifier;
    deB.translationLinkEnIdentifier = enB.identifier;

    const works = buildWorks([enA, deA, enB, deB]);
    const groups = new Set(works.map((work) => work.translationId));

    expect(groups.size).toBe(2);
  });

  test("links a standalone page to the parent work it is a variation of", () => {
    const parent = makeElement({
      name: "Endowments",
      sourceName: "learnimprov",
      variations: ["Crime Scene", "Repair Shop"],
    });
    const child = makeElement({
      name: "Endowments-Crime Scene",
      sourceName: "learnimprov",
    });

    const works = buildWorks([parent, child]);
    const parentWork = works.find((work) => work.canonicalElementId === parent.identifier);
    const childWork = works.find((work) => work.canonicalElementId === child.identifier);

    expect(childWork?.parentWorkId ?? null).toBe(parentWork?.id ?? null);
    // The standalone page replaces the shorter inline variation.
    expect(parentWork?.variations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "standalone",
          name: "Endowments-Crime Scene",
          elementId: childWork?.id,
        }),
      ])
    );
    expect(
      parentWork?.variations.some((variation) => variation.name === "Crime Scene")
    ).toBe(false);
  });

  test("matches a variant against any member name of the parent work", () => {
    // The canonical name is "Freeze Tag", but the child page is named after the
    // learnimprov member "Freeze".
    const improwiki = makeElement({
      name: "Freeze Tag",
      sourceName: "improwiki",
      variations: ["Blind Freeze"],
    });
    const learnimprov = makeElement({
      name: "Freeze",
      sourceName: "learnimprov",
      variations: ["Space Jump"],
      relatedIdentifiers: [relation(improwiki.identifier, 1)],
    });
    improwiki.relatedIdentifiers = [relation(learnimprov.identifier, 1)];
    const child = makeElement({
      name: "Freeze-Endowment",
      sourceName: "learnimprov",
    });
    // Freeze documents "Endowment Freeze"; the child's remainder matches it.
    learnimprov.normalized.variations.push({
      name: "Endowment Freeze",
      description: "An endowed freeze",
      differsBy: [],
    });

    const works = buildWorks([improwiki, learnimprov, child]);
    const parentWork = works.find((work) => work.canonicalElementId === improwiki.identifier);
    const childWork = works.find((work) => work.canonicalElementId === child.identifier);

    expect(childWork?.parentWorkId ?? null).toBe(parentWork?.id ?? null);
  });

  test("does not link a page whose remainder is not a documented variation", () => {
    const parent = makeElement({
      name: "Harold",
      sourceName: "learnimprov",
      variations: ["Monoscene"],
    });
    const unrelated = makeElement({
      name: "Harold-Deconstruction",
      sourceName: "learnimprov",
    });

    const works = buildWorks([parent, unrelated]);
    const child = works.find(
      (work) => work.canonicalElementId === unrelated.identifier
    );

    expect(child?.parentWorkId).toBeNull();
  });

  test("dedupes inline variations across members and keeps the longer text", () => {
    const a = makeElement({
      name: "A",
      sourceName: "improwiki",
      variations: ["Blind Freeze"],
    });
    a.normalized.variations[0].description = "short";
    const b = makeElement({
      name: "B",
      sourceName: "learnimprov",
      variations: ["Blind Freeze"],
      relatedIdentifiers: [relation(a.identifier, 1)],
    });
    b.normalized.variations[0].description = "a much longer description";
    a.relatedIdentifiers = [relation(b.identifier, 1)];

    const works = buildWorks([a, b]);
    const variation = works[0].variations.find(
      (candidate) => candidate.name === "Blind Freeze"
    );

    expect(works[0].variations).toHaveLength(1);
    expect(variation?.description).toBe("a much longer description");
  });

  test("applies explicit add_variationOf overrides", () => {
    const parent = makeElement({ name: "Freeze", sourceName: "learnimprov" });
    const child = makeElement({ name: "Custom Variant", sourceName: "learnimprov" });

    const works = buildWorks([parent, child], {
      parentLinks: [
        { childElementId: child.identifier, parentElementId: parent.identifier },
      ],
    });
    const childWork = works.find((work) => work.canonicalElementId === child.identifier);
    const parentWork = works.find((work) => work.canonicalElementId === parent.identifier);

    expect(childWork?.parentWorkId ?? null).toBe(parentWork?.id ?? null);
  });

  test("never creates a two-level variant chain", () => {
    const a = makeElement({ name: "Alpha", sourceName: "learnimprov", variations: ["Beta"] });
    const b = makeElement({ name: "Alpha-Beta", sourceName: "learnimprov", variations: ["Gamma"] });
    const c = makeElement({ name: "Alpha-Beta-Gamma", sourceName: "learnimprov" });

    const works = buildWorks([a, b, c]);
    const beta = works.find((work) => work.canonicalElementId === b.identifier);
    const gamma = works.find((work) => work.canonicalElementId === c.identifier);

    // Exactly one of the two links is kept, never a chain.
    expect([beta?.parentWorkId, gamma?.parentWorkId].filter(Boolean)).toHaveLength(1);
  });

  test("merges a reviewed work group regardless of relation confidence", () => {
    const improwiki = makeElement({ name: "Machine", sourceName: "improwiki" });
    const learnimprov = makeElement({ name: "Machine", sourceName: "learnimprov" });
    const another = makeElement({ name: "Machines", sourceName: "learnimprov" });

    const works = buildWorks([improwiki, learnimprov, another], {
      mergeGroups: [[improwiki.identifier, learnimprov.identifier, another.identifier]],
    });

    expect(works).toHaveLength(1);
    expect(works[0].memberIds).toEqual(
      [improwiki.identifier, learnimprov.identifier, another.identifier].sort()
    );
    // The existing canonical scoring still picks the member.
    expect(works[0].canonicalElementId).toBe(improwiki.identifier);
  });

  test("a merged work never spans languages", () => {
    const en = makeElement({
      name: "Freeze Tag",
      sourceName: "improwiki",
      languageCode: "en",
    });
    const de = makeElement({
      name: "Freeze Tag",
      sourceName: "learnimprov",
      languageCode: "de",
    });
    en.translationLinkDeIdentifier = de.identifier;
    de.translationLinkEnIdentifier = en.identifier;

    const works = buildWorks([en, de], {
      mergeGroups: [[en.identifier, de.identifier]],
    });

    expect(works).toHaveLength(2);
    expect(works.every((work) => work.memberIds.length === 1)).toBe(true);
    // Translation linking still connects the two language works.
    expect(works[0].translationId).toBeDefined();
    expect(works[0].translationId).toBe(works[1].translationId);
  });
});
