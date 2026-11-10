import { describe, expect, it } from "bun:test";
import {
  SKILLS,
  SKILL_IDS,
  getSkill,
  skillDefinition,
  skillLabel,
  toSkillId,
} from "../skills";

describe("skill vocabulary", () => {
  it("has ten unique ids", () => {
    expect(SKILL_IDS.length).toBe(10);
    expect(new Set(SKILL_IDS).size).toBe(10);
  });

  it("gives every skill a label and a definition in both languages", () => {
    for (const skill of SKILLS) {
      expect(skill.de.length).toBeGreaterThan(0);
      expect(skill.en.length).toBeGreaterThan(0);
      expect(skill.definitionDe.length).toBeGreaterThan(20);
      expect(skill.definitionEn.length).toBeGreaterThan(20);
    }
  });

  it("maps the id and both labels back to the id", () => {
    for (const skill of SKILLS) {
      expect(toSkillId(skill.id)).toBe(skill.id);
      expect(toSkillId(skill.de)).toBe(skill.id);
      expect(toSkillId(skill.en)).toBe(skill.id);
    }
  });

  it("maps the free-text names the old extractor produced", () => {
    expect(toSkillId("spontaneity")).toBe("impulse");
    expect(toSkillId("active listening")).toBe("attention");
    expect(toSkillId("body awareness")).toBe("physicality");
    expect(toSkillId("group mind")).toBe("group");
    expect(toSkillId("status play")).toBe("status");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(toSkillId("  STATUS  ")).toBe("status");
    expect(toSkillId("Körperlichkeit")).toBe("physicality");
  });

  it("returns undefined for anything outside the vocabulary", () => {
    expect(toSkillId("crime")).toBeUndefined();
    expect(toSkillId("")).toBeUndefined();
    expect(toSkillId(undefined)).toBeUndefined();
    expect(toSkillId(42)).toBeUndefined();
  });

  it("labels and definitions follow the requested language", () => {
    expect(skillLabel("group", "de")).toBe("Gruppe");
    expect(skillLabel("group", "en")).toBe("Ensemble");
    expect(skillDefinition("group", "de")).toContain("Ensemble");
    expect(skillDefinition("group", "en")).toContain("ensemble");
    expect(skillLabel("nope", "de")).toBeNull();
  });

  it("knows every id it advertises", () => {
    for (const id of SKILL_IDS) {
      expect(getSkill(id)?.id).toBe(id);
    }
  });
});
