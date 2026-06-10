export const REQUIREMENT_MAP: {
  requirement: string;
  mechanics: string[];
  tags: string[];
}[] = [
  {
    requirement: "audience_input",
    mechanics: ["audience suggestion", "audience voting"],
    tags: ["Ask For", "Zuschauer auf der Bühne"],
  },
  {
    requirement: "physical_contact",
    mechanics: ["physical contact", "touch to speak"],
    tags: ["Physical Contact", "Körperkontakt und Berührung"],
  },
  {
    requirement: "music_singing",
    mechanics: ["singing constraint", "musical accompaniment"],
    tags: ["Musik und Gesang", "Musikspiele"],
  },
  {
    requirement: "props_objects",
    mechanics: ["object prompt", "Human Props"],
    tags: ["Objects", "Spiele mit Gegenständen"],
  },
  {
    requirement: "audience_on_stage",
    mechanics: [],
    tags: ["Audience on stage", "Zuschauer auf der Bühne"],
  },
];

export function deriveRequirements(
  mechanics: string[],
  tags: string[],
): string[] {
  const mechLower = new Set(mechanics.map(m => m.toLowerCase().trim()));
  const tagLower = new Set(tags.map(t => t.toLowerCase().trim()));

  const results: string[] = [];
  for (const entry of REQUIREMENT_MAP) {
    const mechMatch = entry.mechanics.some(m => mechLower.has(m.toLowerCase()));
    const tagMatch = entry.tags.some(t => tagLower.has(t.toLowerCase()));
    if (mechMatch || tagMatch) {
      results.push(entry.requirement);
    }
  }
  return results;
}
