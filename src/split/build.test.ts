import { describe, expect, test } from "bun:test";
import type { ElementType } from "../scraping/shared/element-type";
import type { AuditPage } from "./audit";
import { isVersionHeading, materializeSplitPage } from "./build";

function page(html: string): ElementType {
  return {
    type: "element",
    identifier: "p".repeat(32),
    name: "Fangenspiele",
    url: "https://improwiki.com/de/wiki/fangenspiele",
    sourceName: "improwiki",
    languageCode: "de",
    tags: ["warmup", "körperkontakt"],
    htmlContent: html,
    licenseName: "CC BY-SA 3.0 DE",
    licenseUrl: "https://improwiki.com/de/lizenz",
    licenseSpdxIdentifier: "CC-BY-SA-3.0-DE",
    lastModified: "2026-05-11",
    fetchedAt: "2026-11-05T00:00:00.000Z",
  } as ElementType;
}

const audit = (children: number[]): AuditPage => ({
  inputHash: "h".repeat(32),
  kind: "collection",
  children,
  reason: "several games",
});

const HTML = `
  <p>Sammlung von Fangspielen.</p>
  <h2>Alphabetfangen</h2>
  <p>Die Gruppe geht das Alphabet durch und fängt sich gegenseitig. Wer an der Reihe ist, nennt den nächsten Buchstaben und versucht, eine andere Person zu fangen. Das Spiel läuft weiter, bis alle Buchstaben verwendet wurden.</p>
  <h2>Namen rufen</h2>
  <p>Zwei Kreise rufen sich gegenseitig Namen zu und wechseln die Seiten. Wer gerufen wird, muss den Kreis wechseln, bevor die andere Gruppe ihn erreicht. Das trainiert Aufmerksamkeit und schnelle Reaktion.</p>
  <h2>Kettenfangen</h2>
  <p>Gefangene bilden eine Kette und fangen gemeinsam weiter. Die Kette wächst mit jeder gefangenen Person, bis nur noch eine Person übrig ist. Das Spiel eignet sich gut für große Gruppen.</p>
`;

describe("materializeSplitPage", () => {
  test("turns selected sections into child elements", () => {
    const result = materializeSplitPage(page(HTML), audit([0, 1]));

    expect(result).toBeDefined();
    expect(result!.children).toHaveLength(2);
    expect(result!.children.map((child) => child.name)).toEqual([
      "Alphabetfangen",
      "Namen rufen",
    ]);
  });

  test("inherits source, language, license and tags from the parent", () => {
    const child = materializeSplitPage(page(HTML), audit([0, 1]))!.children[0];

    expect(child.parentIdentifier).toBe("p".repeat(32));
    expect(child.url).toBe(
      "https://improwiki.com/de/wiki/fangenspiele#alphabetfangen"
    );
    expect(child.markdown).toContain("Alphabet");
    expect(child.markdown).not.toContain("## Alphabetfangen");
  });

  test("ignores the page intro and keeps the child body", () => {
    const child = materializeSplitPage(page(HTML), audit([0, 1]))!.children[0];

    expect(child.markdown).not.toContain("Sammlung von Fangspielen");
  });

  test("returns undefined for a single page", () => {
    const result = materializeSplitPage(page(HTML), {
      ...audit([]),
      kind: "single",
    });

    expect(result).toBeUndefined();
  });

  test("requires at least two children", () => {
    expect(materializeSplitPage(page(HTML), audit([0]))).toBeUndefined();
  });

  test("deduplicates identical headings", () => {
    const html = `
      <h2>Robot</h2><p>${"Follow the hand of the leader. ".repeat(6)}</p>
      <h2>Robot</h2><p>${"A second section with the same heading. ".repeat(6)}</p>
      <h2>Camera</h2><p>${"One player is the camera and frames the scene. ".repeat(6)}</p>
    `;

    const result = materializeSplitPage(page(html), audit([0, 1, 2]));

    expect(result!.children.map((child) => child.name)).toEqual([
      "Robot",
      "Camera",
    ]);
  });

  test("skips sections that are too short", () => {
    const html = `
      <h2>Short</h2><p>Too short.</p>
      <h2>Long</h2><p>${"This section has enough content to become an element. ".repeat(6)}</p>
      <h2>Also long</h2><p>${"Another section with enough content to be split. ".repeat(6)}</p>
    `;

    const result = materializeSplitPage(page(html), audit([0, 1, 2]));

    expect(result!.children.map((child) => child.name)).toEqual([
      "Long",
      "Also long",
    ]);
  });
});

describe("isVersionHeading", () => {
  test("recognises numbered variants of the page title", () => {
    expect(isVersionHeading("Duet 1", "Duet")).toBe(true);
    expect(isVersionHeading("König 2", "König")).toBe(true);
    expect(isVersionHeading("Namenskreis 1", "Namenskreis")).toBe(true);
  });

  test("recognises generic version headings", () => {
    expect(isVersionHeading("Version 1", "Madrigal")).toBe(true);
    expect(isVersionHeading("Variante B", "Statuskette")).toBe(true);
    expect(isVersionHeading("Teil 2", "Irgendwas")).toBe(true);
  });

  test("does not treat a distinct game name as a version", () => {
    expect(isVersionHeading("Alphabetfangen", "Fangenspiele")).toBe(false);
    expect(isVersionHeading("Robot", "Leading Exercises")).toBe(false);
    expect(isVersionHeading("Tabloid talk show", "Genre Talk Show")).toBe(false);
  });
});

describe("materializeSplitPage guards", () => {
  test("rejects a page whose sections are only versions of the title", () => {
    const html = `
      <h2>Version 1</h2><p>${"First version with enough content. ".repeat(6)}</p>
      <h2>Version 2</h2><p>${"Second version with enough content. ".repeat(6)}</p>
    `;

    expect(
      materializeSplitPage(
        { ...page(html), name: "Madrigal" } as ElementType,
        audit([0, 1])
      )
    ).toBeUndefined();
  });

  test("drops navigation and category headings", () => {
    const html = `
      <h2>Contents</h2><p>${"Navigation text that should not become an element. ".repeat(6)}</p>
      <h2>Warmups and games</h2><p>${"A category section, not a game. ".repeat(6)}</p>
      <h2>Abstract</h2><p>${"A style, not a playable game. ".repeat(6)}</p>
    `;

    expect(
      materializeSplitPage(
        { ...page(html), name: "Musical improv" } as ElementType,
        audit([0, 1, 2])
      )
    ).toBeUndefined();
  });
});
