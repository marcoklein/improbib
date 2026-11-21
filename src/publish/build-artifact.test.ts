import { describe, expect, test } from "bun:test";
import type { NormalizedElement } from "../normalize/normalized-schema";
import { SKILL_IDS } from "../normalize/skills";
import type { ElementType } from "../scraping/shared/element-type";
import { buildPublishedArtifact } from "./build-artifact";
import type { ArtifactNormalized } from "./build-artifact";
import { buildWorks } from "./build-works";

function makeRaw(input: {
  identifier: string;
  name: string;
  sourceName: string;
  languageCode?: "de" | "en";
  authors?: string[];
  licenseName?: string;
  tagIds?: string[];
  markdown?: string;
}): ElementType {
  return {
    identifier: input.identifier,
    name: input.name,
    url: `https://example.com/${input.identifier}`,
    sourceName: input.sourceName,
    languageCode: input.languageCode ?? "en",
    tags: input.tagIds ?? ["game"],
    markdown: input.markdown ?? "Some markdown content",
    licenseName: input.licenseName ?? "CC BY-SA 4.0",
    licenseUrl: "https://example.com/license",
    licenseSpdxIdentifier: "CC-BY-SA-4.0",
    authors: input.authors,
  };
}

function makeNormalized(input: {
  identifier: string;
  name: string;
  sourceName: string;
  languageCode?: "de" | "en";
  relatedIdentifiers?: { identifier: string; confidence: number }[];
  summary?: string;
  description?: string;
  durationMinutes?: number;
}): NormalizedElement {
  return {
    identifier: input.identifier,
    name: input.name,
    url: `https://example.com/${input.identifier}`,
    sourceName: input.sourceName,
    languageCode: input.languageCode ?? "en",
    tags: [],
    htmlContent: "<p>content</p>",
    normalized: {
      summary: input.summary ?? `Summary of ${input.name}`,
      description:
        input.description ?? `Description of ${input.name} with enough text.`,
      howToPlay: { steps: [{ action: "Do the thing" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [{ name: "freeze signal" }],
      skills: ["impulse"],
      practical: {
        difficulty: "beginner",
        energyLevel: "high",
        typicalDurationMinutes: input.durationMinutes,
      },
      contentHash: `hash-${input.identifier}`,
      extractedAt: "2026-01-01T00:00:00.000Z",
      normalizedBy: "test-model",
    },
    derivedElements: [],
    relatedIdentifiers: input.relatedIdentifiers ?? [],
  };
}

describe("buildPublishedArtifact", () => {
  test("attaches normalized content and the work links to every member", () => {
    const idA = "a".repeat(32);
    const idB = "b".repeat(32);
    const rawA = makeRaw({ identifier: idA, name: "Freeze Tag", sourceName: "improwiki" });
    const rawB = makeRaw({
      identifier: idB,
      name: "Freeze",
      sourceName: "learnimprov",
      authors: ["learnimprov"],
    });
    const normA = makeNormalized({
      identifier: idA,
      name: "Freeze Tag",
      sourceName: "improwiki",
      summary: "Freeze Tag is an improv game where players freeze.",
      relatedIdentifiers: [{ identifier: idB, confidence: 1 }],
    });
    const normB = makeNormalized({
      identifier: idB,
      name: "Freeze",
      sourceName: "learnimprov",
      relatedIdentifiers: [{ identifier: idA, confidence: 1 }],
    });

    const works = buildWorks([normA, normB]);
    const artifact = buildPublishedArtifact({
      elements: [rawA, rawB],
      normalized: [normA, normB],
      works,
    });

    const workId = works[0].id;
    for (const element of artifact.elements) {
      expect(element.canonicalId).toBe(workId);
      expect(element.workKind).toBe("element");
      expect(element.normalized).toMatchObject({
        summary: expect.stringContaining("Freeze"),
        mechanics: ["freeze signal"],
        skills: ["impulse"],
      });
    }
    expect(
      artifact.elements.find((element) => element.identifier === idA)
        ?.isCanonicalMember
    ).toBe(true);
    expect(
      artifact.elements.find((element) => element.identifier === idB)
        ?.isCanonicalMember
    ).toBe(false);

    expect(artifact.works).toHaveLength(1);
    expect(artifact.works[0].sources).toEqual([
      expect.objectContaining({
        sourceName: "improwiki",
        licenseName: "CC BY-SA 4.0",
        authors: [],
      }),
      expect.objectContaining({
        sourceName: "learnimprov",
        authors: ["learnimprov"],
      }),
    ]);
  });

  test("marks variation members and keeps the parent link", () => {
    const parentId = "c".repeat(32);
    const childId = "d".repeat(32);
    const rawParent = makeRaw({
      identifier: parentId,
      name: "Endowments",
      sourceName: "learnimprov",
    });
    const rawChild = makeRaw({
      identifier: childId,
      name: "Endowments-Crime Scene",
      sourceName: "learnimprov",
    });
    const normParent = makeNormalized({
      identifier: parentId,
      name: "Endowments",
      sourceName: "learnimprov",
    });
    normParent.normalized.variations = [
      { name: "Crime Scene", description: "A crime scene", differsBy: [] },
    ];
    const normChild = makeNormalized({
      identifier: childId,
      name: "Endowments-Crime Scene",
      sourceName: "learnimprov",
    });

    const works = buildWorks([normParent, normChild]);
    const artifact = buildPublishedArtifact({
      elements: [rawParent, rawChild],
      normalized: [normParent, normChild],
      works,
    });

    const parentWork = artifact.works.find(
      (work) => work.canonicalElementId === parentId
    );
    const childWork = artifact.works.find(
      (work) => work.canonicalElementId === childId
    );

    expect(childWork?.parentWorkId ?? null).toBe(parentWork?.id ?? null);
    const child = artifact.elements.find((element) => element.identifier === childId);
    expect(child?.variationOf ?? null).toBe(parentWork?.id ?? null);
    expect(child?.workKind).toBe("variation");
  });

  test("drops works whose members are not part of the artifact", () => {
    const presentId = "e".repeat(32);
    const missingId = "f".repeat(32);
    const rawPresent = makeRaw({
      identifier: presentId,
      name: "Present",
      sourceName: "improwiki",
    });
    const normPresent = makeNormalized({
      identifier: presentId,
      name: "Present",
      sourceName: "improwiki",
      relatedIdentifiers: [{ identifier: missingId, confidence: 1 }],
    });
    const normMissing = makeNormalized({
      identifier: missingId,
      name: "Missing",
      sourceName: "learnimprov",
      relatedIdentifiers: [{ identifier: presentId, confidence: 1 }],
    });

    const works = buildWorks([normPresent, normMissing]);
    const artifact = buildPublishedArtifact({
      elements: [rawPresent],
      normalized: [normPresent, normMissing],
      works,
    });

    // The missing member's work has no content and cannot be published.
    expect(artifact.works.some((work) => work.memberIds.includes(missingId))).toBe(
      false
    );
    expect(artifact.elements[0].canonicalId).toBeDefined();
  });

  test("ships the skill vocabulary with labels and definitions", () => {
    // Consumers render `normalized.skills` ids; the labels and definitions
    // must travel with the artifact instead of being duplicated there.
    const id = "5".repeat(32);
    const raw = makeRaw({
      identifier: id,
      name: "Freeze Tag",
      sourceName: "improwiki",
    });
    const norm = makeNormalized({
      identifier: id,
      name: "Freeze Tag",
      sourceName: "improwiki",
    });

    const artifact = buildPublishedArtifact({
      elements: [raw],
      normalized: [norm],
      works: buildWorks([norm]),
    });

    expect(artifact.skills).toHaveLength(10);
    expect(artifact.skills.map((skill) => skill.id)).toEqual([...SKILL_IDS]);
    expect(new Set(artifact.skills.map((skill) => skill.id)).size).toBe(10);
    for (const skill of artifact.skills) {
      expect(skill.de.trim()).not.toBe("");
      expect(skill.en.trim()).not.toBe("");
      expect(skill.definitionDe.trim()).not.toBe("");
      expect(skill.definitionEn.trim()).not.toBe("");
    }
  });

  test("omits an empty normalization instead of publishing a blank summary", () => {
    const id = "1".repeat(32);
    const raw = makeRaw({ identifier: id, name: "Broken", sourceName: "improwiki" });
    const norm = makeNormalized({
      identifier: id,
      name: "Broken",
      sourceName: "improwiki",
      summary: "",
    });
    norm.normalized.description = "";
    norm.normalized.howToPlay = null;

    const works = buildWorks([norm]);
    const artifact = buildPublishedArtifact({
      elements: [raw],
      normalized: [norm],
      works,
    });

    expect(artifact.elements[0].normalized).toBeUndefined();
    expect(artifact.elements[0].canonicalId).toBeDefined();
  });

  test("keeps a walkthrough whose description came back empty", () => {
    // The extraction yields summary and steps but no description for some
    // elements. The steps are valid content and must be published.
    const id = "2".repeat(32);
    const raw = makeRaw({
      identifier: id,
      name: "Fischer",
      sourceName: "improwiki",
      languageCode: "de",
    });
    const norm = makeNormalized({
      identifier: id,
      name: "Fischer",
      sourceName: "improwiki",
      languageCode: "de",
      summary: "Ein Fangspiel für die ganze Gruppe.",
      description: "",
    });
    norm.normalized.description = "";
    norm.normalized.howToPlay = {
      steps: [
        { action: "Stellt euch an eine Seite des Spielfelds." },
        { action: "Fragt den Fischer nach der Wassertiefe." },
      ],
    };

    const works = buildWorks([norm]);
    const artifact = buildPublishedArtifact({
      elements: [raw],
      normalized: [norm],
      works,
    });

    const published = artifact.elements[0].normalized as
      | ArtifactNormalized
      | undefined;
    expect(published?.howToPlay?.steps).toHaveLength(2);
    expect(published?.description).toBe("");
  });

  test("normalizes a localized practical value instead of failing validation", () => {
    // "fortgeschritten"/"lebhaft" leaked from the model and made the schema of
    // the whole artifact fail, so nothing was published.
    const id = "4".repeat(32);
    const raw = makeRaw({ identifier: id, name: "Localized", sourceName: "improwiki" });
    const norm = makeNormalized({
      identifier: id,
      name: "Localized",
      sourceName: "improwiki",
    });
    (norm.normalized.practical as any) = {
      difficulty: "fortgeschritten",
      energyLevel: "lebhaft",
    };

    const works = buildWorks([norm]);
    const artifact = buildPublishedArtifact({
      elements: [raw],
      normalized: [norm],
      works,
    });

    const published = artifact.elements[0].normalized as ArtifactNormalized;
    expect(published.practical).toEqual({
      difficulty: "intermediate",
      energyLevel: "high",
    });
  });

  test("omits a normalization that has a summary but no content", () => {
    const id = "3".repeat(32);
    const raw = makeRaw({
      identifier: id,
      name: "Stub",
      sourceName: "improwiki",
    });
    const norm = makeNormalized({
      identifier: id,
      name: "Stub",
      sourceName: "improwiki",
      summary: "A page that was only half extracted.",
      description: "",
    });
    norm.normalized.description = "";
    norm.normalized.howToPlay = null;

    const works = buildWorks([norm]);
    const artifact = buildPublishedArtifact({
      elements: [raw],
      normalized: [norm],
      works,
    });

    expect(artifact.elements[0].normalized).toBeUndefined();
  });
});

describe("duration provenance", () => {
  function publishOne(input: {
    markdown: string;
    durationMinutes?: number;
    languageCode?: "de" | "en";
  }) {
    const id = "a".repeat(32);
    const raw = makeRaw({
      identifier: id,
      name: "Verflixte Sieben",
      sourceName: "improwiki",
      languageCode: input.languageCode ?? "de",
      markdown: input.markdown,
    });
    const norm = makeNormalized({
      identifier: id,
      name: "Verflixte Sieben",
      sourceName: "improwiki",
      languageCode: input.languageCode ?? "de",
      durationMinutes: input.durationMinutes,
    });
    const artifact = buildPublishedArtifact({
      elements: [raw],
      normalized: [norm],
      works: buildWorks([norm]),
    });
    return artifact;
  }

  test("labels a guessed number as inferred", () => {
    const artifact = publishOne({
      markdown:
        "Ein Format für sechs Spieler. Jede Figur stellt sich kurz vor und die Szenen wechseln.",
      durationMinutes: 60,
    });

    expect(artifact.works[0].durationMinutes).toBe(60);
    expect(artifact.works[0].durationSource).toBe("inferred");
    const practical = (artifact.elements[0].normalized as ArtifactNormalized)
      .practical;
    expect(practical.typicalDurationMinutes).toBe(60);
    expect(practical.durationSource).toBe("inferred");
  });

  test("labels a number the source states as stated", () => {
    const artifact = publishOne({
      markdown: "**Dauer:** 10 Minuten\n\nEin kurzes Format für die Probe.",
      durationMinutes: 10,
    });

    expect(artifact.works[0].durationMinutes).toBe(10);
    expect(artifact.works[0].durationSource).toBe("stated");
    const practical = (artifact.elements[0].normalized as ArtifactNormalized)
      .practical;
    expect(practical.durationSource).toBe("stated");
  });

  test("publishes both duration fields as null when no member names one", () => {
    const artifact = publishOne({
      markdown: "Ein Format ohne jede Zeitangabe.",
    });

    expect(artifact.works[0].durationMinutes).toBeNull();
    expect(artifact.works[0].durationSource).toBeNull();
    const practical = (artifact.elements[0].normalized as ArtifactNormalized)
      .practical;
    expect(practical.typicalDurationMinutes).toBeUndefined();
    expect(practical.durationSource).toBeUndefined();
  });

  test("lets two sources of one work publish one number and one source", () => {
    const canonicalId = "b".repeat(32);
    const otherId = "c".repeat(32);
    const rawA = makeRaw({
      identifier: canonicalId,
      name: "Freeze Tag",
      sourceName: "improwiki",
      markdown: "Es dauert normalerweise ca. 10 Minuten.",
    });
    const rawB = makeRaw({
      identifier: otherId,
      name: "Freeze",
      sourceName: "learnimprov",
      markdown: "A guessing game with no number.",
    });
    const normA = makeNormalized({
      identifier: canonicalId,
      name: "Freeze Tag",
      sourceName: "improwiki",
      durationMinutes: 10,
      relatedIdentifiers: [{ identifier: otherId, confidence: 1 }],
    });
    // The second source's model guessed a different number; the work keeps the
    // canonical number and applies it to both members.
    const normB = makeNormalized({
      identifier: otherId,
      name: "Freeze",
      sourceName: "learnimprov",
      durationMinutes: 20,
      relatedIdentifiers: [{ identifier: canonicalId, confidence: 1 }],
    });

    const works = buildWorks([normA, normB]);
    expect(works).toHaveLength(1);
    const artifact = buildPublishedArtifact({
      elements: [rawA, rawB],
      normalized: [normA, normB],
      works,
    });

    expect(artifact.works[0].durationMinutes).toBe(10);
    expect(artifact.works[0].durationSource).toBe("stated");
    for (const element of artifact.elements) {
      const practical = (element.normalized as ArtifactNormalized).practical;
      expect(practical.typicalDurationMinutes).toBe(10);
      expect(practical.durationSource).toBe("stated");
    }
  });

  test("never publishes a duration without a source", () => {
    const artifact = publishOne({
      markdown: "Ein Format mit geschätzter Dauer.",
      durationMinutes: 25,
    });
    const none = publishOne({ markdown: "Ein Format ohne Dauer." });

    const all = [artifact, none];
    for (const current of all) {
      for (const work of current.works) {
        expect(work.durationSource === null).toBe(
          work.durationMinutes === null
        );
      }
      for (const element of current.elements) {
        const practical = (element.normalized as ArtifactNormalized | undefined)
          ?.practical;
        if (!practical) continue;
        expect(practical.durationSource === undefined).toBe(
          practical.typicalDurationMinutes === undefined
        );
      }
    }
  });
});
