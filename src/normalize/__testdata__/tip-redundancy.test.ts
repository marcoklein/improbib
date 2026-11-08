import { describe, expect, it } from "bun:test";
import {
  contentStems,
  dropRedundantTips,
  isRedundantTip,
  stepCoverage,
} from "../tip-redundancy";

// The real shape of the bug: the source of "Wohngemeinschaft" is three
// paragraphs of instructions and nothing else, and the extractor turned the
// last sentences into two "tips" that repeated steps 4 and 6.
const WOHNGEMEINSCHAFT_STEPS = [
  "Setzt euch zu dritt nebeneinander auf die Bühne und bildet eine Wohngemeinschaft.",
  "Kommt zu Besuch, um euch vorzustellen und um Aufnahme in die WG zu bitten.",
  "Lasst euch vom Übungsleiter verdeckte Zettelchen mit den Nummern 1-4 geben – eure Nummer zeigt euren Status, den nur ihr selbst kennt.",
  "Behauptet euren Status in einer frei improvisierten Szene und achtet gleichzeitig darauf, welche Status eure Mitspieler haben, denn deren Nummern kennt ihr zu Beginn nicht.",
  "Ratet, wer welchen Status innehat, wenn der Übungsleiter zwischendrin die restlichen Spieler als Publikum befragt.",
  "Stellt eure Status deutlicher dar, wenn die Einschätzung des Publikums falsch oder unklar war.",
];

describe("contentStems", () => {
  it("drops stopwords and short words", () => {
    expect(contentStems("Behauptet euren Status in einer Szene")).toEqual([
      "behau",
      "statu",
      "szene",
    ]);
  });

  it("folds umlauts and case", () => {
    expect(contentStems("Gefühlspunkte")).toEqual(["gefuh"]);
  });

  it("folds German inflection into one stem", () => {
    expect(contentStems("behauptet")).toEqual(contentStems("Behaupten"));
  });

  it("returns no stems for text that is only stopwords", () => {
    expect(contentStems("und oder aber")).toEqual([]);
  });
});

describe("stepCoverage", () => {
  it("is 1 when a tip only reuses a step's words", () => {
    expect(
      stepCoverage("Stellt euren Status deutlicher dar.", [
        "Stellt euren Status deutlicher dar, wenn das Publikum falsch geraten hat.",
      ])
    ).toBe(1);
  });

  it("is low when the tip adds new content", () => {
    const coverage = stepCoverage(
      "Wechselt die Perspektive und spielt die Szene aus Sicht des Gegenstands.",
      ["Bildet einen Kreis und stellt euch vor."]
    );
    expect(coverage).toBe(0);
  });

  it("is 0 without steps", () => {
    expect(stepCoverage("Irgendein Hinweis", [])).toBe(0);
  });
});

describe("isRedundantTip", () => {
  it("flags a tip that rewords a single step", () => {
    // Real pair from "Gefühlspunkte": the tip repeats step 7.
    expect(
      isRedundantTip(
        "Begründet die größeren Bewegungen zwischen den Gefühlspunkten, damit sie nicht willkürlich erscheinen.",
        [
          "Begründet größere Bewegungen zwischen den Gefühlspunkten in der Geschichte, statt sie willkürlich erscheinen zu lassen.",
        ]
      )
    ).toBe(true);
  });

  it("flags a tip that only repeats two step words", () => {
    expect(
      isRedundantTip("Stellt euren Status deutlicher dar.", [
        "Stellt euren Status deutlicher dar, wenn das Publikum falsch geraten hat.",
      ])
    ).toBe(true);
  });

  it("keeps a tip that adds a reason even when the rule is familiar", () => {
    // The conservative threshold is deliberate: this tip repeats a rule but
    // adds why it matters, which is exactly what a tip is for.
    expect(
      isRedundantTip(
        "Achtet darauf, dass die imaginären Gegenstände an ihrem etablierten Ort bleiben; sonst springen alle gleichzeitig über ein Hindernis und die Illusion bricht.",
        [
          "Merkt euch, wo die imaginären Gegenstände liegen, und haltet sie dort.",
        ]
      )
    ).toBe(false);
  });

  it("keeps a tip that adds a new idea", () => {
    // Shares the vocabulary of the walkthrough but adds the physical gift idea.
    expect(
      isRedundantTip(
        "Gebt den nächsten Spielern extreme Posen als Geschenk, damit sie mehr Material haben.",
        [
          "Friert sofort in eurer exakten Pose ein.",
          "Klatscht einen eingefrorenen Spieler ab und übernehmt dessen Pose.",
        ]
      )
    ).toBe(false);
  });

  it("does not flag a tip that only shares a word with a step", () => {
    expect(
      isRedundantTip("Wechselt die Perspektive und spielt aus Sicht des Gegenstands.", [
        "Bildet einen Kreis und stellt euch vor.",
      ])
    ).toBe(false);
  });

  it("never flags anything when there are no steps", () => {
    expect(isRedundantTip("Ein Hinweis", [])).toBe(false);
  });

  it("does not flag a concept article without a walkthrough", () => {
    expect(isRedundantTip("Status ist die relative Machtposition.", [])).toBe(
      false
    );
  });
});

describe("dropRedundantTips", () => {
  it("removes tips that repeat a step", () => {
    const tips = [
      { text: "Stellt euren Status deutlicher dar.", category: "failure-mode" },
      { text: "Wechselt zwischendurch die Perspektive und erzählt aus Sicht der Requisite.", category: "staging" },
    ];
    expect(
      dropRedundantTips(WOHNGEMEINSCHAFT_STEPS, tips).map((tip) => tip.category)
    ).toEqual(["staging"]);
  });

  it("keeps distinct tips", () => {
    const tips = [
      { text: "Sprecht langsamer, wenn das Publikum lacht." },
      { text: "Nehmt euch nach jeder Szene eine Sekunde für den Übergang." },
    ];
    expect(dropRedundantTips([], tips)).toHaveLength(2);
  });

  it("removes a tip that repeats an earlier tip", () => {
    const tips = [
      { text: "Wenn das Publikum lacht, solltet ihr langsamer sprechen." },
      { text: "Sprecht langsamer, wenn das Publikum lacht." },
      { text: "Nehmt euch nach jeder Szene eine Sekunde für den Übergang." },
    ];
    expect(dropRedundantTips([], tips).map((tip) => tip.text)).toEqual([
      "Wenn das Publikum lacht, solltet ihr langsamer sprechen.",
      "Nehmt euch nach jeder Szene eine Sekunde für den Übergang.",
    ]);
  });

  it("keeps English tips that restate nothing", () => {
    const tips = [
      { text: "Time the freeze when the picture is strong." },
      { text: "Avoid the obvious continuation: a raised arm is not always a traffic cop." },
    ];
    const steps = [
      "Form a loose half-circle at the edge of the stage.",
      "Freeze instantly in your exact pose when someone calls stop.",
    ];
    expect(dropRedundantTips(steps, tips)).toHaveLength(2);
  });
});
