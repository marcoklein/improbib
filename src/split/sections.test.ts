import { describe, expect, test } from "bun:test";
import { extractSections, slugify, splitIdentifier } from "./sections";

const FLAT = `
  <p>Intro text that is shared.</p>
  <h2>Alphabetfangen</h2>
  <p>Ein Spiel, bei dem die Gruppe das Alphabet durchgeht.</p>
  <h2>Namen rufen</h2>
  <p>Zwei Kreise rufen sich gegenseitig Namen zu.</p>
  <h2>Kettenfangen</h2>
  <p>Gefangene bilden eine Kette.</p>
`;

describe("extractSections", () => {
  test("splits a flat page at h2 headings and keeps the heading out of the body", () => {
    const sections = extractSections(FLAT);

    expect(sections).toHaveLength(3);
    expect(sections.map((section) => section.heading)).toEqual([
      "Alphabetfangen",
      "Namen rufen",
      "Kettenfangen",
    ]);
    expect(sections[0].text).toContain("Alphabet");
    expect(sections[0].text).not.toContain("Alphabetfangen");
    expect(sections[0].html).not.toContain("<h2>");
  });

  test("indexes sections in document order", () => {
    const sections = extractSections(FLAT);

    expect(sections.map((section) => section.index)).toEqual([0, 1, 2]);
    expect(sections.every((section) => section.level === 2)).toBe(true);
  });

  test("falls back to h3 boundaries when there is no h2 structure", () => {
    const html = `
      <h3>Robot</h3><p>Follow the hand of the leader.</p>
      <h3>Guided Camera</h3><p>One player is the camera.</p>
    `;

    const sections = extractSections(html);

    expect(sections.map((section) => section.heading)).toEqual([
      "Robot",
      "Guided Camera",
    ]);
    expect(sections[0].level).toBe(3);
  });

  test("ignores content before the first heading", () => {
    const sections = extractSections(FLAT);

    expect(sections.some((section) => section.text.includes("Intro"))).toBe(false);
  });

  test("returns an empty list for empty input", () => {
    expect(extractSections("")).toEqual([]);
  });
});

describe("slugify", () => {
  test("transliterates German characters", () => {
    expect(slugify("Führungsübungen")).toBe("fuehrungsuebungen");
    expect(slugify("Wer hat Angst vorm Schwarzen Mann")).toBe(
      "wer-hat-angst-vorm-schwarzen-mann"
    );
  });

  test("never returns an empty slug", () => {
    expect(slugify("???")).toBe("section");
  });
});

describe("splitIdentifier", () => {
  test("is deterministic and depends on the heading", () => {
    const a = splitIdentifier("a".repeat(32), "Robot");
    const b = splitIdentifier("a".repeat(32), "Robot");
    const c = splitIdentifier("a".repeat(32), "Guided Camera");

    expect(a).toBe(b);
    expect(a).toHaveLength(32);
    expect(a).not.toBe(c);
  });
});
