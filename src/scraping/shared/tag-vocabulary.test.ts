import { describe, expect, test } from "bun:test";
import { tagTranslations } from "./tag-translations";
import { tagTransformations } from "./tag-transformations";
import { resolveTagIds } from "./tag-vocabulary";

const concepts = Object.keys(tagTranslations);

describe("tag vocabulary", () => {
  test("labels are unique per language", () => {
    for (const language of ["de", "en"] as const) {
      const seen = new Map<string, string>();
      for (const [id, translation] of Object.entries(tagTranslations)) {
        const label = translation[language].toLowerCase();
        const existing = seen.get(label);
        expect(existing, `${language} label "${label}" used by ${existing} and ${id}`).toBeUndefined();
        seen.set(label, id);
      }
    }
  });

  test("every concept has a non-empty label in both languages", () => {
    for (const [id, translation] of Object.entries(tagTranslations)) {
      expect(translation.de.length, id).toBeGreaterThan(1);
      expect(translation.en.length, id).toBeGreaterThan(1);
      expect(["format", "difficulty", "energy", "grouping", "content", "meta"]).toContain(
        translation.axis
      );
    }
  });

  test("every transformation target resolves to a concept", () => {
    const unresolved: string[] = [];
    for (const [label, targets] of Object.entries(tagTransformations)) {
      if (targets.length === 0) continue;
      const { ids } = resolveTagIds([label]);
      if (ids.length === 0) unresolved.push(label);
    }
    expect(unresolved).toEqual([]);
  });

  test("all previously unmapped source labels resolve now", () => {
    const previouslyUnmapped = [
      "Ask For",
      "Baltimore",
      "ComedySportz",
      "Concept",
      "Concepts",
      "Editing Technique",
      "Editing Techniques",
      "Exercises",
      "Handle",
      "Improv Form",
      "Improv Game",
      "Improv Glossary",
      "Improv Jams",
      "Improv Podcasts",
      "Improv Shows",
      "Long Form",
      "Long Forms",
      "Music and Singing",
      "Musical Improv",
      "New York City",
      "Opening",
      "Openings",
      "Organic Improv",
      "Organic improv",
      "Shortform",
      "Shows",
      "String of Pearls",
      "Stubs",
      "Warm Ups",
      "Warm-Up",
      "Übungen",
    ];

    const stillUnmapped = previouslyUnmapped.filter(
      (label) => resolveTagIds([label]).ids.length === 0
    );
    expect(stillUnmapped).toEqual([]);
  });

  test("resolves plural, localized and structural variants", () => {
    expect(resolveTagIds(["Warm-Up"]).ids).toEqual(["warmup"]);
    expect(resolveTagIds(["Long Forms"]).ids).toEqual(["longform"]);
    expect(resolveTagIds(["Übungen"]).ids).toEqual(["exercise"]);
    expect(resolveTagIds(["Music and Singing"]).ids).toEqual(["music", "singing"]);
    expect(resolveTagIds(["Concept", "Concepts"]).ids).toEqual(["concept"]);
    expect(resolveTagIds(["Intermediate"]).ids).toEqual(["advanced"]);
    expect(resolveTagIds(["lively"]).ids).toEqual(["energetic"]);
    expect(resolveTagIds(["Professional"]).ids).toEqual(["pro"]);
  });

  test("merges the character/figur duplicate", () => {
    expect(resolveTagIds(["Charakter/Figur"]).ids).toEqual(["character"]);
    expect(resolveTagIds(["Figur"]).ids).toEqual(["character"]);
  });

  test("drops unknown labels instead of inventing ids", () => {
    const result = resolveTagIds(["Spiel", "something nobody defined"]);
    expect(result.ids).toEqual(["game"]);
    expect(result.unmapped).toEqual(["something nobody defined"]);
    expect(result.ids.every((id) => concepts.includes(id))).toBe(true);
  });
});
