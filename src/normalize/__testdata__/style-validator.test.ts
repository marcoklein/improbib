import { describe, expect, test } from "bun:test";
import {
  buildStyleCorrection,
  countStyleViolations,
  deStepVoice,
  enStepVoice,
  findStyleViolations,
  isInvalidGermanImperative,
} from "../style-validator";

/** Builds the minimal element shape the validator reads. */
function element(actions: string[]) {
  return {
    normalized: {
      howToPlay: actions.length > 0 ? { steps: actions.map((action) => ({ action })) } : null,
    },
  };
}

describe("isInvalidGermanImperative", () => {
  test("flags the reported Freeze Tag step", () => {
    expect(
      isInvalidGermanImperative(
        "Frieren sofort in eurer exakten Pose ein. Kein Driften, kein Lockerlassen."
      )
    ).toBe(true);
  });

  test("flags the Armando steps that were never imperatives", () => {
    expect(
      isInvalidGermanImperative(
        "Spielen Szenen, die auf dem Monolog basieren – thematisch, kommentierend und tangential"
      )
    ).toBe(true);
  });

  test("accepts a plural imperative ending in -t", () => {
    expect(isInvalidGermanImperative("Bildet einen lockeren Halbkreis.")).toBe(
      false
    );
    expect(isInvalidGermanImperative("Friert sofort in eurer Pose ein.")).toBe(
      false
    );
  });

  test("ignores nouns that merely end in -en", () => {
    expect(isInvalidGermanImperative("Puppen bleiben körperlich locker.")).toBe(
      false
    );
    expect(isInvalidGermanImperative("Gegen Ende beschleunigt die Wechsel.")).toBe(
      false
    );
  });

  test("does not judge conditional or temporal openers", () => {
    expect(
      isInvalidGermanImperative(
        "Wenn die Handlung in eine neue Aktivität übergeht, macht weiter."
      )
    ).toBe(false);
  });

  test("handles an empty action", () => {
    expect(isInvalidGermanImperative("")).toBe(false);
  });
});

describe("deStepVoice", () => {
  test("recognises addressed steps", () => {
    expect(deStepVoice("Bildet zwei Gruppen zu je zwei Spielern.")).toBe(
      "address"
    );
    expect(deStepVoice("Stellt euch links und rechts der Bühne auf.")).toBe(
      "address"
    );
  });

  test("recognises descriptive steps", () => {
    expect(
      deStepVoice("Die Synchronsprecher sprechen den Dialog für die Darsteller.")
    ).toBe("descriptive");
    expect(deStepVoice("Der Moderator sagt an einer passenden Stelle Stopp.")).toBe(
      "descriptive"
    );
  });

  test("treats conditional openers as neutral", () => {
    expect(
      deStepVoice("Wenn alle bereit sind, beginnt die Szene.")
    ).toBe("neutral");
    expect(deStepVoice("Optional: Versucht, die Geschichten zu verbinden.")).toBe(
      "neutral"
    );
  });
});

describe("enStepVoice", () => {
  test("recognises imperative and descriptive steps", () => {
    expect(enStepVoice("Form a loose half-circle at the edge of the stage.")).toBe(
      "address"
    );
    expect(
      enStepVoice("The other players perform the scene based on the setup.")
    ).toBe("descriptive");
  });

  test("recognises direct address", () => {
    expect(enStepVoice("Freeze instantly in your exact pose.")).toBe("address");
  });

  test("treats temporal openers as neutral", () => {
    expect(enStepVoice("When the scene ends, start a new one.")).toBe("neutral");
  });
});

describe("findStyleViolations", () => {
  test("reports no violations for a consistent German element", () => {
    const violations = findStyleViolations(
      element([
        "Bildet einen lockeren Halbkreis am Bühnenrand.",
        "Bewegt euch und nutzt den Raum.",
        "Ruft Freeze, wenn das Bild stark ist.",
        "Friert sofort in eurer exakten Pose ein.",
      ]),
      "de"
    );
    expect(violations).toEqual([]);
  });

  test("reports no violations for a consistently descriptive German element", () => {
    // A fully descriptive element is a legitimate outcome; only mixing is a
    // violation. This keeps the retry from fighting a deliberate style.
    const violations = findStyleViolations(
      element([
        "Die Spieler bilden einen Halbkreis.",
        "Der Moderator gibt eine Vorgabe.",
        "Die Gruppe spielt eine Szene.",
      ]),
      "de"
    );
    expect(violations).toEqual([]);
  });

  test("flags a German element that mixes address and description", () => {
    const violations = findStyleViolations(
      element([
        "Stellt zwei Darsteller auf die Bühne.",
        "Die Synchronsprecher sprechen den Dialog für die Darsteller.",
      ]),
      "de"
    );
    expect(violations.map((v) => v.rule)).toContain("de-mixed-voice");
  });

  test("flags du inside an ihr element", () => {
    const violations = findStyleViolations(
      element(["Suche dir eine alltägliche Routinehandlung aus."]),
      "de"
    );
    expect(violations.map((v) => v.rule)).toContain("de-du-form");
  });

  test("flags every du step so the correction can name them", () => {
    const violations = findStyleViolations(
      element(["Beginne mit der Handlung.", "Achte auf ein Detail."]),
      "de"
    );
    expect(violations.filter((v) => v.rule === "de-du-form")).toHaveLength(2);
  });

  test("flags man as the actor but not 'manchmal'", () => {
    expect(
      findStyleViolations(element(["Man bildet einen Kreis."]), "de").map(
        (v) => v.rule
      )
    ).toContain("de-man-address");
    expect(
      findStyleViolations(element(["Manchmal entsteht eine gute Szene."]), "de")
    ).toEqual([]);
  });

  test("flags formal address", () => {
    expect(
      findStyleViolations(
        element(["Optional: Die Verdächtigen enthüllen Ihnen ihre Beziehungen."]),
        "de"
      ).map((v) => v.rule)
    ).toContain("de-formal-address");
  });

  test("does not treat 'Sie verdächtigen sich' as formal address", () => {
    // "Sie" at the start of a clause is usually "they", not formal address.
    expect(
      findStyleViolations(
        element(["Sie verdächtigen sich gegenseitig."]),
        "de"
      ).map((v) => v.rule)
    ).not.toContain("de-formal-address");
  });

  test("flags an English element that mixes imperative and subject openers", () => {
    const violations = findStyleViolations(
      element([
        "Form a half-circle.",
        "The other players perform the scene.",
      ]),
      "en"
    );
    expect(violations.map((v) => v.rule)).toEqual(["en-mixed-voice"]);
  });

  test("accepts a fully imperative English element", () => {
    const violations = findStyleViolations(
      element([
        "Form a loose half-circle at the edge of the stage.",
        "Move, use the space and react to each other.",
        "Freeze instantly in your exact pose.",
      ]),
      "en"
    );
    expect(violations).toEqual([]);
  });

  test("returns nothing for an element without steps", () => {
    expect(findStyleViolations(element([]), "de")).toEqual([]);
    expect(findStyleViolations({ normalized: { howToPlay: null } }, "de")).toEqual(
      []
    );
  });

  test("handles a malformed element without throwing", () => {
    expect(findStyleViolations({}, "de")).toEqual([]);
    expect(findStyleViolations(null, "en")).toEqual([]);
  });
});

describe("wrong-language", () => {
  /** A complete element shape, so summary, description, steps and tips count. */
  function fullElement(fields: {
    summary: string;
    description: string;
    steps?: string[];
    tips?: string[];
  }) {
    return {
      normalized: {
        summary: fields.summary,
        description: fields.description,
        howToPlay:
          fields.steps && fields.steps.length > 0
            ? { steps: fields.steps.map((action) => ({ action })) }
            : null,
        tips: (fields.tips ?? []).map((text) => ({ text })),
      },
    };
  }

  test("flags an English element whose answer is German", () => {
    const violations = findStyleViolations(
      fullElement({
        summary:
          "Die Spieler stehen im Kreis und geben eine Bewegung weiter, die von allen aufgenommen wird.",
        description:
          "Ein Warm-up, bei dem die Gruppe eine Bewegung im Kreis weitergibt und alle sie aufnehmen.",
        steps: [
          "Stellt euch in einen Kreis und atmet einmal gemeinsam durch.",
          "Gebt eine Bewegung an eure Nachbarin weiter, die sie aufnimmt.",
        ],
        tips: ["Achtet darauf, dass die Bewegung nicht zu schnell wird."],
      }),
      "en"
    );
    expect(violations.filter((v) => v.rule === "wrong-language")).toHaveLength(1);
  });

  test("accepts a genuine German element", () => {
    expect(
      findStyleViolations(
        fullElement({
          summary:
            "Die Gruppe steht im Kreis und gibt eine Bewegung weiter, die alle aufnehmen.",
          description:
            "Ein Warm-up, bei dem die Spieler eine Bewegung im Kreis weitergeben und alle sie aufnehmen und verstärken.",
          steps: [
            "Stellt euch in einen Kreis und atmet einmal gemeinsam durch.",
            "Gebt eine Bewegung an eure Nachbarin weiter, die sie aufnimmt und verstärkt.",
            "Nehmt die Bewegung auf und gebt sie weiter, wenn ihr sie spürt.",
          ],
          tips: [
            "Achtet darauf, dass die Bewegung nicht zu schnell wird und alle sie sehen können.",
          ],
        }),
        "de"
      )
    ).toEqual([]);
  });

  test("accepts a short English element with one quoted German word", () => {
    expect(
      findStyleViolations(
        fullElement({
          summary:
            'Players pass a movement around the circle on the call "und weiter".',
          description: "A short warm-up.",
          steps: ["Form a circle and pass the movement on."],
        }),
        "en"
      )
    ).toEqual([]);
  });

  test("fires at the 0.8 ratio boundary and not below it", () => {
    // 12 German / 3 English = exactly 0.8.
    expect(
      findStyleViolations(
        fullElement({ summary: "der ".repeat(12), description: "the and your" }),
        "en"
      ).map((v) => v.rule)
    ).toContain("wrong-language");

    // 11 German / 4 English = 0.73.
    expect(
      findStyleViolations(
        fullElement({
          summary: "der ".repeat(11),
          description: "the and your you",
        }),
        "en"
      ).map((v) => v.rule)
    ).not.toContain("wrong-language");
  });

  test("needs at least ten foreign stop words", () => {
    // 9 German hits score 0.9 but are below the absolute threshold.
    expect(
      findStyleViolations(
        fullElement({ summary: "der ".repeat(9), description: "the" }),
        "en"
      ).map((v) => v.rule)
    ).not.toContain("wrong-language");
  });

  test("names the target language in the correction", () => {
    const correction = buildStyleCorrection([
      { rule: "wrong-language", detail: "", language: "English" },
    ]);
    expect(correction).toContain("English");
    expect(correction).toContain("every step");
  });
});

describe("countStyleViolations", () => {
  test("counts across a split response", () => {
    const parent = element(["Suche dir eine Handlung aus."]);
    const child = element(["Die Spieler bilden einen Kreis."]);
    expect(countStyleViolations([parent, child], "de")).toBe(1);
  });

  test("checks split children, not just the parent", () => {
    // The retry must fire for split pages too. A clean parent with a broken
    // child used to be invisible to the validator.
    const parent = element(["Wählt eine Kategorie."]);
    const child = element(["Frieren sofort in eurer exakten Pose ein."]);
    expect(countStyleViolations([parent, child], "de")).toBe(1);
  });

  test("treats a single element like a one-item response", () => {
    expect(countStyleViolations(element(["Bildet einen Kreis."]), "de")).toBe(0);
  });
});

describe("buildStyleCorrection", () => {
  test("names only the rules that were broken", () => {
    const correction = buildStyleCorrection([
      { rule: "de-du-form", detail: "a" },
      { rule: "de-du-form", detail: "b" },
      { rule: "de-imperative-opener", detail: "c" },
    ]);
    expect(correction).toContain('"ihr"');
    expect(correction).toContain('"-t"');
    expect(correction).not.toContain('"man"');
  });

  test("asks for the whole JSON to be rewritten", () => {
    expect(buildStyleCorrection([{ rule: "en-mixed-voice", detail: "" }])).toContain(
      "Rewrite the whole JSON"
    );
  });
});