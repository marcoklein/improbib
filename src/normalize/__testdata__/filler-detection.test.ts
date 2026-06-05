import { describe, expect, it } from "bun:test";
import { detectFillers } from "../normalize";
import type { NormalizedElement } from "../normalized-schema";

function makeElement(
  id: string,
  mechanics: { name: string; category?: string }[],
  skills: { name: string; category?: string }[],
): NormalizedElement {
  return {
    identifier: id,
    name: "Test Element",
    url: "https://example.com/test",
    sourceName: "improwiki",
    languageCode: "en",
    tags: ["test"],
    htmlContent: "<p>test</p>",
    normalized: {
      summary: "Test summary text for validation.",
      description: "Test description text for validation with enough characters.",
      howToPlay: null,
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics,
      skills,
      practical: {},
      contentHash: "abc123",
      extractedAt: new Date().toISOString(),
      normalizedBy: "00000000000000000000000000000000",
    },
    derivedElements: [],
    relatedIdentifiers: [],
  };
}

describe("detectFillers", () => {
  it("returns empty report for empty elements", () => {
    const report = detectFillers([]);
    expect(report.warnings).toEqual([]);
    expect(report.totalElements).toBe(0);
  });

  it("returns no warnings when no mechanic/skill appears above threshold", () => {
    const elements = [
      makeElement("a1", [{ name: "freeze signal", category: "signal" }], [{ name: "acceptance", category: "social" }]),
      makeElement("a2", [{ name: "alphabet constraint", category: "constraint" }], [{ name: "spontaneity", category: "cognitive" }]),
      makeElement("a3", [{ name: "mirroring", category: "interaction" }], [{ name: "physicality", category: "physical" }]),
    ];

    const report = detectFillers(elements, 0.05);
    expect(report.warnings.length).toBe(0);
  });

  it("detects a mechanic appearing above threshold", () => {
    const elements = [
      makeElement("a1", [{ name: "letter avoidance constraint" }], []),
      makeElement("a2", [{ name: "letter avoidance constraint" }], []),
      makeElement("a3", [{ name: "freeze signal" }], []),
    ];

    const report = detectFillers(elements, 0.05);
    expect(report.warnings.length).toBe(1);
    expect(report.warnings[0].name).toBe("letter avoidance constraint");
    expect(report.warnings[0].field).toBe("mechanics");
    expect(report.warnings[0].count).toBe(2);
  });

  it("detects a skill appearing above threshold", () => {
    const elements = [
      makeElement("a1", [], [{ name: "HAROLD" }]),
      makeElement("a2", [], [{ name: "harold" }]),
      makeElement("a3", [], [{ name: "spontaneity" }]),
    ];

    const report = detectFillers(elements, 0.05);
    expect(report.warnings.length).toBe(1);
    expect(report.warnings[0].name).toBe("harold");
    expect(report.warnings[0].field).toBe("skills");
    expect(report.warnings[0].count).toBe(2);
  });

  it("sorts warnings by percentage descending", () => {
    const elements = [
      makeElement("a1", [{ name: "frequent" }], []),
      makeElement("a2", [{ name: "frequent" }], []),
      makeElement("a3", [{ name: "frequent" }], []),
      makeElement("a4", [{ name: "less-frequent" }], []),
      makeElement("a5", [{ name: "less-frequent" }], []),
    ];

    const report = detectFillers(elements, 0.05);
    expect(report.warnings.length).toBe(2);
    expect(report.warnings[0].name).toBe("frequent");
    expect(report.warnings[1].name).toBe("less-frequent");
  });

  it("respects custom threshold and minAbsoluteCount", () => {
    const elements = Array.from({ length: 20 }, (_, i) =>
      makeElement(`a${i}`, i < 2 ? [{ name: "occasional" }] : [], []),
    );
    // 2/20 = 10%, above 5% threshold, count >= 2
    const defaultReport = detectFillers(elements, 0.05, 2);
    expect(defaultReport.warnings.length).toBe(1);

    // 2/20 = 10%, below 15% threshold
    const highThreshold = detectFillers(elements, 0.15, 2);
    expect(highThreshold.warnings.length).toBe(0);

    // 2/20 = 10%, above 5% threshold, but count < 3
    const highMinCount = detectFillers(elements, 0.05, 3);
    expect(highMinCount.warnings.length).toBe(0);
  });

  it("handles elements with no mechanics or skills", () => {
    const elements = [
      makeElement("a1", [], []),
      makeElement("a2", [], []),
      makeElement("a3", [], []),
    ];

    const report = detectFillers(elements);
    expect(report.warnings.length).toBe(0);
  });

  it("ignores empty mechanic/skill names", () => {
    const elements = [
      makeElement("a1", [{ name: "" }], [{ name: " " }]),
      makeElement("a2", [{ name: "  " }], []),
    ];

    const report = detectFillers(elements);
    expect(report.warnings.length).toBe(0);
  });

  it("detects the real hallucination: letter avoidance constraint across unrelated elements", () => {
    const elements = [
      makeElement("a1", [{ name: "letter avoidance constraint", category: "structure" }], []),
      makeElement("a2", [{ name: "letter avoidance constraint", category: "role" }], []),
      makeElement("a3", [{ name: "letter avoidance constraint", category: "interaction" }], []),
      makeElement("a4", [{ name: "letter avoidance constraint", category: "signal" }], []),
      makeElement("a5", [{ name: "freeze signal", category: "signal" }], []),
    ];

    const report = detectFillers(elements, 0.05);
    expect(report.warnings.length).toBe(1);
    expect(report.warnings[0].name).toBe("letter avoidance constraint");
    expect(report.warnings[0].percentage).toBe(0.8);
  });
});
