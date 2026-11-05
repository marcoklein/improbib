import { describe, expect, test } from "bun:test";
import { transformAndTranslateTags } from "./transform-and-translate-tags";
import type { ElementType } from "./element-type";

function element(overrides: Partial<ElementType>): ElementType {
  return {
    identifier: "id",
    name: "Element",
    url: "https://example.com",
    languageCode: "de",
    sourceName: "improwiki",
    tags: [],
    ...overrides,
  } as ElementType;
}

describe("transformAndTranslateTags", () => {
  test("derives index-aligned tagIds and translatedTags", () => {
    const output = {
      meta: {} as Record<string, any>,
      elements: [
        element({ tags: ["Spiel", "Annahme", "Warm-Up"] }),
      ],
    };

    transformAndTranslateTags(output);

    const [transformed] = output.elements;
    expect(transformed.tagIds).toEqual(["accepting", "game", "warmup"]);
    expect(transformed.translatedTags).toEqual(["Annahme", "Spiel", "Aufwärmspiel"]);
    expect(transformed.tagIds?.length).toBe(
      transformed.translatedTags?.length ?? -1
    );
  });

  test("never emits no_translation_id_ sentinels", () => {
    const output = {
      meta: {} as Record<string, any>,
      elements: [
        element({ tags: ["Handle", "Warm-Up", "Something Unknown"] }),
      ],
    };

    transformAndTranslateTags(output);

    const [transformed] = output.elements;
    expect(transformed.tagIds?.some((id) => id.startsWith("no_translation_id_"))).toBe(false);
    expect(output.meta.untranslatedTags).toEqual(["Something Unknown"]);
    expect(output.meta.untranslatedTagCounts).toEqual({ "Something Unknown": 1 });
  });

  test("keeps the array aligned for character/figur duplicates", () => {
    const output = {
      meta: {} as Record<string, any>,
      elements: [
        element({ languageCode: "de", tags: ["Charakter/Figur", "Übung"] }),
      ],
    };

    transformAndTranslateTags(output);

    const [transformed] = output.elements;
    expect(transformed.tagIds).toEqual(["character", "exercise"]);
    expect(transformed.translatedTags).toEqual(["Charakter", "Übung"]);
  });

  test("exports the vocabulary with axes", () => {
    const output = { meta: {} as Record<string, any>, elements: [] as ElementType[] };
    transformAndTranslateTags(output);

    expect(output.meta.tagVocabulary.game).toEqual({
      de: "Spiel",
      en: "Game",
      axis: "format",
    });
    expect(output.meta.tagVocabulary.beginner.axis).toBe("difficulty");
    expect(output.meta.tagVocabulary.accepting.axis).toBe("content");
  });
});
