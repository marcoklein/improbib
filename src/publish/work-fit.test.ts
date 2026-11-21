import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NormalizedElement } from "../normalize/normalized-schema";
import type { ElementType } from "../scraping/shared/element-type";
import { buildPublishedArtifact } from "./build-artifact";
import { buildWorks } from "./build-works";
import {
  deriveKind,
  deriveRoles,
  deriveWorkCategories,
  deriveWorkFit,
  findWorkFitProblems,
  isConceptEntry,
  isVariantIndexPage,
  linkListLabels,
} from "./work-fit";

function makeRaw(input: {
  identifier: string;
  name: string;
  tagIds: string[];
  tags?: string[];
  markdown?: string;
  sourceName?: string;
  languageCode?: "de" | "en";
}): ElementType {
  return {
    identifier: input.identifier,
    name: input.name,
    url: `https://example.com/${input.identifier}`,
    sourceName: input.sourceName ?? "improwiki",
    languageCode: input.languageCode ?? "de",
    tags: input.tags ?? input.tagIds,
    tagIds: input.tagIds,
    markdown: input.markdown ?? "Ein Text mit genug Inhalt für ein Element.",
    licenseName: "CC BY-SA 4.0",
    licenseUrl: "https://example.com/license",
    licenseSpdxIdentifier: "CC-BY-SA-4.0",
  };
}

function makeNormalized(input: {
  identifier: string;
  name: string;
  tagIds: string[];
  usage?: ("rehearsal" | "show")[];
  relatedIdentifiers?: { identifier: string; confidence: number }[];
}): NormalizedElement {
  return {
    identifier: input.identifier,
    name: input.name,
    url: `https://example.com/${input.identifier}`,
    sourceName: "improwiki",
    languageCode: "de",
    tags: input.tagIds,
    htmlContent: "<p>content</p>",
    normalized: {
      summary: `Zusammenfassung von ${input.name}.`,
      description: `Beschreibung von ${input.name} mit genug Text.`,
      howToPlay: { steps: [{ action: "Etwas tun." }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [],
      skills: [],
      practical: { usage: input.usage },
      contentHash: `hash-${input.identifier}`,
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-model",
    },
    derivedElements: [],
    relatedIdentifiers: input.relatedIdentifiers ?? [],
  };
}

describe("deriveKind", () => {
  test("keeps the identity the source tags state", () => {
    expect(deriveKind(["game"])).toBe("game");
    expect(deriveKind(["exercise"])).toBe("exercise");
    expect(deriveKind(["exercise", "warmup"])).toBe("exercise");
    expect(deriveKind(["longform", "show"])).toBe("format");
    expect(deriveKind(["askFor"])).toBe("audienceQuestion");
  });

  test("treats a glossary entry as a concept, not a game", () => {
    // Improvwiki files every glossary entry under "Spiele". "Tabu" is the
    // canonical example: glossary+game tags, no instructions, no show.
    expect(deriveKind(["beginner", "calm", "game", "glossary"])).toBe(
      "concept"
    );
    expect(deriveKind(["concept"])).toBe("concept");
  });

  test("honours an explicit playable identity next to a glossary tag", () => {
    // "Chairs" is a glossary page on improvwiki and a longform on learnimprov;
    // the merged work is playable because one source says so.
    expect(deriveKind(["glossary", "game", "longform"])).toBe("format");
    expect(deriveKind(["glossary", "game", "exercise"])).toBe("exercise");
    expect(deriveKind(["glossary", "askFor"])).toBe("audienceQuestion");
  });

  test("marks a page that only links to its variants as a collection", () => {
    expect(deriveKind(["exercise"], true)).toBe("collection");
  });

  test("does not invent a playable kind without evidence", () => {
    expect(deriveKind([])).toBe("concept");
    expect(isConceptEntry([])).toBe(false);
  });
});

describe("isVariantIndexPage", () => {
  test("recognises the escaped link list improvwiki publishes", () => {
    const markdown =
      "\\*[Raum einrichten (Übung)](/de/wiki/raum-einrichten-ubung)  \n" +
      "\\*[Raum einrichten (Auftritt)](/de/wiki/raum-einrichten-auftritt)";
    expect(linkListLabels(markdown)).toEqual([
      "Raum einrichten (Übung)",
      "Raum einrichten (Auftritt)",
    ]);
    expect(isVariantIndexPage("Raum einrichten", markdown)).toBe(true);
  });

  test("accepts a plain bullet list", () => {
    const markdown =
      "* [Endowments-Crime Scene](/en/wiki/crime-scene)\n" +
      "- [Endowments-Status](/en/wiki/status)";
    expect(isVariantIndexPage("Endowments", markdown)).toBe(true);
  });

  test("rejects prose, a single link and unrelated links", () => {
    expect(
      isVariantIndexPage(
        "Raum einrichten",
        "Erst den Raum etablieren, dann spielen.\n\n* [Variante](/x)"
      )
    ).toBe(false);
    expect(
      isVariantIndexPage("Raum einrichten", "* [Raum einrichten](/x)")
    ).toBe(false);
    expect(
      isVariantIndexPage(
        "Raum einrichten",
        "* [Freeze Tag](/x)\n* [Status](/y)"
      )
    ).toBe(false);
  });
});

describe("deriveRoles", () => {
  test("marks an explicit tag as strong and a derived role as inferred", () => {
    expect(
      deriveRoles({
        kind: "game",
        tagIds: ["game", "warmup", "show"],
      })
    ).toEqual([
      { id: "warmup", confidence: "strong" },
      { id: "show", confidence: "strong" },
    ]);

    expect(
      deriveRoles({ kind: "game", tagIds: ["game"], usage: ["show"] })
    ).toEqual([{ id: "show", confidence: "inferred" }]);
  });

  test("keeps the curated warm-up inferred", () => {
    expect(
      deriveRoles({
        kind: "game",
        tagIds: ["game"],
        memberIds: ["b495669fefdc338b2baa16f4bc3ba761"],
      })
    ).toEqual([{ id: "warmup", confidence: "inferred" }]);
  });

  test("gives a concept or collection no roles", () => {
    for (const kind of ["concept", "collection", "audienceQuestion"] as const) {
      expect(
        deriveRoles({
          kind,
          tagIds: ["game", "warmup", "show"],
          usage: ["rehearsal", "show"],
        })
      ).toEqual([]);
    }
  });
});

describe("deriveWorkCategories", () => {
  test("publishes only the identity badge for a concept", () => {
    expect(
      deriveWorkCategories({ kind: "concept", tagIds: ["game", "glossary"] })
    ).toEqual(["concept"]);
  });

  test("publishes no badge for a collection", () => {
    expect(
      deriveWorkCategories({ kind: "collection", tagIds: ["exercise"] })
    ).toEqual([]);
  });

  test("keeps the playable badges, including the warm-up role", () => {
    expect(
      deriveWorkCategories({ kind: "game", tagIds: ["game", "warmup"] })
    ).toEqual(["warmup", "game"]);
    expect(
      deriveWorkCategories({ kind: "format", tagIds: ["game", "longform"] })
    ).toEqual(["game", "format"]);
  });
});

describe("deriveWorkFit", () => {
  test("drops usage for a non-playable page", () => {
    const fit = deriveWorkFit({
      tagIds: ["game", "glossary"],
      name: "Tabu",
      markdown: "Tabus sind bewusst vermiedene Themen.",
      usage: ["rehearsal", "show"],
    });
    expect(fit.kind).toBe("concept");
    expect(fit.roles).toEqual([]);
    expect(fit.usage).toEqual([]);
  });

  test("keeps the work duration on a playable work and drops it on a concept", () => {
    const duration = { minutes: 10, source: "stated" as const };
    expect(
      deriveWorkFit({ tagIds: ["game"], name: "Spiel", markdown: "x", duration })
        .duration
    ).toEqual(duration);
    expect(
      deriveWorkFit({
        tagIds: ["game", "glossary"],
        name: "Tabu",
        markdown: "x",
        duration,
      }).duration
    ).toBeNull();
    expect(
      deriveWorkFit({ tagIds: ["game"], name: "Spiel", markdown: "x" }).duration
    ).toBeNull();
  });
});

describe("buildPublishedArtifact work fit", () => {
  test("publishes Tabu as a concept without roles or show", () => {
    const id = "a".repeat(32);
    const raw = makeRaw({
      identifier: id,
      name: "Tabu",
      tagIds: ["beginner", "calm", "game", "glossary"],
      markdown:
        "Tabus bedeuten beim Improvisationstheater, dass Spielideen bewusst vermieden werden.",
    });
    const norm = makeNormalized({
      identifier: id,
      name: "Tabu",
      tagIds: raw.tagIds ?? [],
      usage: ["rehearsal", "show"],
    });

    const artifact = buildPublishedArtifact({
      elements: [raw],
      normalized: [norm],
      works: buildWorks([norm]),
    });

    const normalized = artifact.elements[0].normalized as any;
    expect(normalized.kind).toBe("concept");
    expect(normalized.roles).toEqual([]);
    expect(normalized.categories).toEqual(["concept"]);
    expect(normalized.practical.usage).toBeUndefined();
    expect(normalized.practical.difficulty).toBeUndefined();
    expect(findWorkFitProblems(artifact.elements, artifact.works)).toEqual([]);
  });

  test("publishes an index page as a collection, not a game or exercise", () => {
    const id = "b".repeat(32);
    const raw = makeRaw({
      identifier: id,
      name: "Raum einrichten",
      tagIds: ["exercise", "pantomime"],
      markdown:
        "\\*[Raum einrichten (Übung)](/de/wiki/raum-einrichten-ubung)  \n" +
        "\\*[Raum einrichten (Auftritt)](/de/wiki/raum-einrichten-auftritt)",
    });
    const norm = makeNormalized({
      identifier: id,
      name: "Raum einrichten",
      tagIds: raw.tagIds ?? [],
      usage: ["rehearsal"],
    });

    const artifact = buildPublishedArtifact({
      elements: [raw],
      normalized: [norm],
      works: buildWorks([norm]),
    });

    const normalized = artifact.elements[0].normalized as any;
    expect(normalized.kind).toBe("collection");
    expect(normalized.roles).toEqual([]);
    expect(normalized.categories).toEqual([]);
    expect(normalized.practical.usage).toBeUndefined();
    expect(findWorkFitProblems(artifact.elements, artifact.works)).toEqual([]);
  });

  test("keeps the roles of a playable work", () => {
    const id = "c".repeat(32);
    const raw = makeRaw({
      identifier: id,
      name: "Freeze Tag",
      tagIds: ["game", "warmup"],
    });
    const norm = makeNormalized({
      identifier: id,
      name: "Freeze Tag",
      tagIds: raw.tagIds ?? [],
      usage: ["rehearsal", "show"],
    });

    const artifact = buildPublishedArtifact({
      elements: [raw],
      normalized: [norm],
      works: buildWorks([norm]),
    });

    const normalized = artifact.elements[0].normalized as any;
    expect(normalized.kind).toBe("game");
    expect(normalized.roles).toEqual([
      { id: "warmup", confidence: "strong" },
      { id: "show", confidence: "inferred" },
    ]);
    expect(normalized.practical.usage).toEqual(["rehearsal", "show"]);
    expect(findWorkFitProblems(artifact.elements, artifact.works)).toEqual([]);
  });

  test("does not merge a glossary entry into a playable page", () => {
    const glossaryId = "d".repeat(32);
    const exerciseId = "e".repeat(32);
    const glossaryRaw = makeRaw({
      identifier: glossaryId,
      name: "Gibberish",
      tagIds: ["game", "glossary"],
      // The normalized layer stores raw source labels; "Improv Glossary"
      // resolves to the canonical `glossary` concept only via the vocabulary.
      tags: ["game", "Improv Glossary"],
    });
    const exerciseRaw = makeRaw({
      identifier: exerciseId,
      name: "Gibberish",
      tagIds: ["exercise"],
      sourceName: "learnimprov",
      languageCode: "en",
    });
    const glossary = makeNormalized({
      identifier: glossaryId,
      name: "Gibberish",
      tagIds: glossaryRaw.tagIds ?? [],
      usage: ["show"],
      relatedIdentifiers: [{ identifier: exerciseId, confidence: 1 }],
    });
    const exercise = makeNormalized({
      identifier: exerciseId,
      name: "Gibberish",
      tagIds: exerciseRaw.tagIds ?? [],
      usage: ["rehearsal"],
      relatedIdentifiers: [{ identifier: glossaryId, confidence: 1 }],
    });

    const works = buildWorks([glossary, exercise]);
    expect(works).toHaveLength(2);

    const artifact = buildPublishedArtifact({
      elements: [glossaryRaw, exerciseRaw],
      normalized: [glossary, exercise],
      works,
    });
    const byId = new Map(
      artifact.elements.map((element) => [element.identifier, element])
    );
    expect((byId.get(glossaryId)?.normalized as any).kind).toBe("concept");
    expect((byId.get(exerciseId)?.normalized as any).kind).toBe("exercise");
    expect(findWorkFitProblems(artifact.elements, artifact.works)).toEqual([]);
  });
});

describe("findWorkFitProblems", () => {  const base = {
    identifier: "f".repeat(32),
    name: "Broken",
    tagIds: ["game"],
    normalized: {
      kind: "concept",
      roles: [],
      categories: ["concept"],
      practical: {},
    },
  };

  test("flags a role on a non-playable kind", () => {
    const problems = findWorkFitProblems([
      {
        ...base,
        normalized: {
          ...base.normalized,
          roles: [{ id: "show", confidence: "inferred" }],
        },
      },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0].problem).toContain("carries roles");
  });

  test("flags a show role on a glossary work", () => {
    const problems = findWorkFitProblems(
      [
        {
          ...base,
          tagIds: ["game", "glossary"],
          normalized: {
            ...base.normalized,
            practical: { usage: ["show"] },
          },
        },
      ],
      [{ canonicalElementId: base.identifier, memberIds: [base.identifier], durationMinutes: null, durationSource: null }]
    );
    expect(problems.map((problem) => problem.problem)).toContain(
      "work tagged glossary carries the show role"
    );
  });

  test("flags a collection published as a game", () => {
    const problems = findWorkFitProblems([
      {
        ...base,
        normalized: {
          kind: "collection",
          roles: [],
          categories: ["game"],
          practical: {},
        },
      },
    ]);
    expect(problems.map((problem) => problem.problem)).toContain(
      "collection is published as game"
    );
  });

  test("flags an element duration without provenance, and provenance without a duration", () => {
    const withoutSource = findWorkFitProblems([
      {
        ...base,
        normalized: {
          ...base.normalized,
          practical: { typicalDurationMinutes: 10 },
        },
      },
    ]);
    expect(withoutSource.map((problem) => problem.problem)).toContain(
      "publishes a duration without durationSource"
    );

    const withoutMinutes = findWorkFitProblems([
      {
        ...base,
        normalized: {
          ...base.normalized,
          practical: { durationSource: "stated" },
        },
      },
    ]);
    expect(withoutMinutes.map((problem) => problem.problem)).toContain(
      "publishes durationSource without a duration"
    );
  });

  test("flags a work that is missing its duration provenance fields", () => {
    const problems = findWorkFitProblems(
      [{ ...base, normalized: { ...base.normalized } }],
      [{ canonicalElementId: base.identifier, memberIds: [base.identifier] }]
    );
    expect(problems.map((problem) => problem.problem)).toContain(
      "work is missing its duration provenance"
    );
  });

  test("flags a work duration that disagrees with its canonical element", () => {
    const element = {
      ...base,
      normalized: {
        ...base.normalized,
        kind: "game",
        categories: ["game"],
        practical: { typicalDurationMinutes: 10, durationSource: "inferred" as const },
      },
    };
    const problems = findWorkFitProblems([element], [
      {
        canonicalElementId: base.identifier,
        memberIds: [base.identifier],
        durationMinutes: 20,
        durationSource: "inferred",
      },
    ]);
    expect(problems.map((problem) => problem.problem)).toContain(
      "work duration disagrees with its canonical element"
    );
  });

  test("flags a stated work whose sources never state the number", () => {
    const element = {
      ...base,
      markdown: "Ein Spiel ohne Dauerangabe. Spielt 2 Minuten als Aufwärmen.",
      normalized: {
        ...base.normalized,
        kind: "game",
        categories: ["game"],
        practical: { typicalDurationMinutes: 10, durationSource: "stated" as const },
      },
    };
    const work = {
      canonicalElementId: base.identifier,
      memberIds: [base.identifier],
      durationMinutes: 10,
      durationSource: "stated" as const,
    };
    expect(
      findWorkFitProblems([element], [work]).map((problem) => problem.problem)
    ).toContain("work is stated but no source states its duration");

    const stated = { ...element, markdown: "Es dauert normalerweise ca. 10 Minuten." };
    expect(findWorkFitProblems([stated], [work])).toEqual([]);
  });
});

const artifactPath = join(process.cwd(), "output", "improbib.json");

/**
 * The published artifact is gitignored, so this runs after a pipeline run and
 * skips in a bare checkout. `bun run gate` enforces the same invariants in the
 * deployment pipeline.
 */
describe.skipIf(!existsSync(artifactPath))("published artifact", () => {
  test("carries no roles on non-playable kinds and no show on a glossary work", async () => {
    const artifact = await Bun.file(artifactPath).json();
    const problems = findWorkFitProblems(
      artifact.elements ?? [],
      artifact.works ?? []
    );
    expect(problems.slice(0, 10)).toEqual([]);
    expect(problems).toHaveLength(0);
  });

  test("never publishes a duration without a provenance (AC3)", async () => {
    const artifact = await Bun.file(artifactPath).json();
    const worksWithBareDuration = (artifact.works ?? []).filter(
      (work: any) =>
        (work.durationMinutes != null) !== (work.durationSource != null)
    );
    expect(worksWithBareDuration.slice(0, 10)).toEqual([]);
    expect(worksWithBareDuration).toHaveLength(0);

    const elementsWithBareDuration = (artifact.elements ?? []).filter(
      (element: any) => {
        const practical = element.normalized?.practical;
        if (!practical) return false;
        return (
          (practical.typicalDurationMinutes != null) !==
          (practical.durationSource != null)
        );
      }
    );
    expect(elementsWithBareDuration.slice(0, 10)).toEqual([]);
    expect(elementsWithBareDuration).toHaveLength(0);
  });
});
