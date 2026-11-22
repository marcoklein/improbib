import { describe, expect, test } from "bun:test";
import {
  deriveDuration,
  hasStatedDuration,
  isStatedDurationValue,
  plainText,
} from "./duration-evidence";

describe("hasStatedDuration", () => {
  test("accepts a whole-work subject with a duration verb", () => {
    // Real sentences from the corpus; the number in brackets is the published
    // value that the sentence supports.
    const cases: [string, number][] = [
      ["Sie dauert 30-45 Minuten.", 40],
      ["It runs 30–45 minutes.", 40],
      ["Es dauert normalerweise ca. 15 Minuten.", 15],
      ["The format lasts 7-15 minutes.", 11],
      ["It usually takes about 15 minutes, depending on the group.", 15],
      ["Das Spiel dauert etwa 90 Minuten.", 90],
    ];
    for (const [text, minutes] of cases) {
      expect(hasStatedDuration(text, minutes)).toBe(true);
    }
  });

  test("accepts an explicit duration label", () => {
    const cases: [string, number][] = [
      ["Time: 5 Minutes", 5],
      ["**Time:**   5 Minutes", 5],
      ["Dauer: 10 Minuten", 10],
      ["Spielzeit: 90 Min.", 90],
      ["Spieldauer: 30-45 Minuten", 40],
      ["Duration: 2 hours", 120],
    ];
    for (const [text, minutes] of cases) {
      expect(hasStatedDuration(text, minutes)).toBe(true);
    }
  });

  test("rejects a number outside the stated range", () => {
    expect(hasStatedDuration("Sie dauert 30-45 Minuten.", 60)).toBe(false);
    expect(hasStatedDuration("The format lasts 7-15 minutes.", 5)).toBe(false);
    expect(hasStatedDuration("Es dauert etwa 15 Minuten.", 20)).toBe(false);
  });

  test("rejects bounds: a floor or ceiling is not a duration", () => {
    const texts = [
      "Es dauert mindestens 5 Minuten.",
      "Innerhalb der Spielzeit von mindestens 2 Minuten sollen Emotionen gezeigt werden.",
      "Maximal eine bis 1,5 Minuten spielbar.",
      "It lasts at most 10 minutes.",
      "Dauer: höchstens 20 Minuten",
      "Bis zu 15 Minuten.",
    ];
    for (const text of texts) {
      expect(hasStatedDuration(text, 5)).toBe(false);
      expect(hasStatedDuration(text, 15)).toBe(false);
      expect(hasStatedDuration(text, 20)).toBe(false);
    }
  });

  test("rejects part-scoped statements", () => {
    expect(hasStatedDuration("Es dauert 5 Minuten pro Runde.", 5)).toBe(false);
    expect(hasStatedDuration("Dauer: 5 Minuten, jede Szene", 5)).toBe(false);
    expect(hasStatedDuration("The game lasts 5 minutes each round.", 5)).toBe(
      false
    );
  });

  test("rejects a bare instruction without a duration word", () => {
    // These are the counter-examples from the design: the page names a number,
    // but it is the length of a step, not of the work.
    const texts = [
      "Spielt 2 Minuten.",
      "Nach etwa 5 Minuten beendet der Spielleiter die Übung.",
      "Nach 1 Minute können Sie zur nächsten Szene wechseln.",
      "jede Szene dauert 20 Sekunden",
      "Das ganze etwa 1 bis 2 Minuten lang.",
      "The player is silent for a minute.",
    ];
    for (const text of texts) {
      expect(hasStatedDuration(text, 2)).toBe(false);
      expect(hasStatedDuration(text, 5)).toBe(false);
    }
  });

  test("does not read a time-of-day or a scene heading as a duration", () => {
    expect(
      hasStatedDuration("## Grober Aufbau Zeit in Minuten - Aktivität", 130)
    ).toBe(false);
    expect(hasStatedDuration("It takes 5 minutes to explain the rules", 5)).toBe(
      true
    );
  });
});

describe("isStatedDurationValue", () => {
  test("accepts a card field that is only a duration", () => {
    expect(isStatedDurationValue("10 Min.", 10)).toBe(true);
    expect(isStatedDurationValue("10-15 Minuten", 12)).toBe(true);
    expect(isStatedDurationValue("ca. 5 Min", 5)).toBe(true);
    expect(isStatedDurationValue("Dauer: 20 Minuten", 20)).toBe(true);
  });

  test("does not accept an unrelated sidebar value", () => {
    expect(isStatedDurationValue("4 bis 6", 4)).toBe(false);
    expect(isStatedDurationValue("Anfänger, Fortgeschritten", 4)).toBe(false);
    expect(isStatedDurationValue("", 10)).toBe(false);
    expect(isStatedDurationValue(undefined, 10)).toBe(false);
  });
});

describe("deriveDuration", () => {
  test("returns null without a number", () => {
    expect(deriveDuration({ minutes: undefined, evidence: [] })).toBeNull();
  });

  test("labels a guessed number as inferred", () => {
    expect(
      deriveDuration({
        minutes: 10,
        evidence: ["Ein Spiel für die ganze Gruppe.", "<p>Spielt 2 Minuten.</p>"],
      })
    ).toEqual({ minutes: 10, source: "inferred" });
  });

  test("labels a number the source states as stated", () => {
    expect(
      deriveDuration({
        minutes: 40,
        evidence: ["<p>Sie dauert 30-45 Minuten.</p>"],
      })
    ).toEqual({ minutes: 40, source: "stated" });
  });

  test("uses every member and card value as evidence", () => {
    expect(
      deriveDuration({
        minutes: 15,
        evidence: ["Keine Dauer genannt.", undefined, "15 Minuten"],
      })
    ).toEqual({ minutes: 15, source: "stated" });
  });
});

describe("plainText", () => {
  test("strips HTML and markdown emphasis but keeps the wording", () => {
    expect(plainText("<p><strong>Dauer:</strong> 10 Minuten</p>")).toBe(
      "  Dauer:  10 Minuten "
    );
    expect(plainText(undefined)).toBe("");
  });
});
