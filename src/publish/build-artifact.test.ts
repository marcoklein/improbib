import { describe, expect, test } from "bun:test";
import type { NormalizedElement } from "../normalize/normalized-schema";
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
}): ElementType {
  return {
    identifier: input.identifier,
    name: input.name,
    url: `https://example.com/${input.identifier}`,
    sourceName: input.sourceName,
    languageCode: input.languageCode ?? "en",
    tags: [],
    markdown: "Some markdown content",
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
      practical: { difficulty: "beginner", energyLevel: "high" },
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
