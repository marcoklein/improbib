/**
 * The fixed skill vocabulary.
 *
 * Skills used to be free text: the extractor produced whatever phrase fitted
 * the source ("spontaneity", "active listening", "body awareness", …), which
 * made them impossible to filter or count. Every skill is now one of these ten
 * ids.
 *
 * Two rules keep the vocabulary useful:
 *
 * - A skill names something a player *does* on stage, not a topic of the
 *   scene. "Status" is a skill because playing rank is trainable; "crime" is
 *   not, it is content.
 * - The definitions are the shared meaning. The extractor sees them, so the
 *   same source sentence cannot end up under two different ids.
 *
 * The labels are for display. `de` is what the German UI shows, `en` what the
 * English UI shows — the id never changes with the language.
 */
export const SKILLS = [
  {
    id: "impulse",
    de: "Impuls",
    en: "Impulse",
    definitionDe: "Den ersten Einfall umsetzen, ohne ihn vorher zu prüfen.",
    definitionEn: "Act on the first idea instead of checking it first.",
  },
  {
    id: "accepting",
    de: "Annehmen",
    en: "Accepting",
    definitionDe: "Angebote der Mitspielenden aufgreifen und weiterführen, statt sie zu blockieren.",
    definitionEn: "Take up and build on what others offer instead of blocking it.",
  },
  {
    id: "physicality",
    de: "Körperlichkeit",
    en: "Physicality",
    definitionDe: "Mit Haltung, Bewegung und Raum erzählen, nicht nur mit Worten.",
    definitionEn: "Tell the story through posture, movement and space, not only words.",
  },
  {
    id: "attention",
    de: "Aufmerksamkeit",
    en: "Attention",
    definitionDe: "Wahrnehmen, was auf der Bühne und bei den Mitspielenden passiert.",
    definitionEn: "Notice what is happening on stage and with your partners.",
  },
  {
    id: "speed",
    de: "Schnelligkeit",
    en: "Speed",
    definitionDe: "Schnell entscheiden und reagieren, ohne die Szene anzuhalten.",
    definitionEn: "Decide and react quickly without stopping the scene.",
  },
  {
    id: "status",
    de: "Status",
    en: "Status",
    definitionDe: "Rang und Macht im Spiel lesen und bewusst spielen.",
    definitionEn: "Read and deliberately play rank and power.",
  },
  {
    id: "storytelling",
    de: "Erzählen",
    en: "Storytelling",
    definitionDe: "Szenen und Geschichten aufbauen: Ort, Figur, Konflikt, Wendung.",
    definitionEn: "Build scenes and stories: place, character, conflict, turn.",
  },
  {
    id: "timing",
    de: "Timing",
    en: "Timing",
    definitionDe: "Den richtigen Moment für einen Einsatz, eine Pointe oder eine Pause finden.",
    definitionEn: "Find the right moment for a move, a punchline or a pause.",
  },
  {
    id: "group",
    de: "Gruppe",
    en: "Ensemble",
    definitionDe: "Als Ensemble gemeinsam tragen: einig sein, ohne sich abzusprechen.",
    definitionEn: "Carry a scene together as an ensemble: be of one mind without planning.",
  },
  {
    id: "audience",
    de: "Publikum",
    en: "Audience",
    definitionDe: "Mit dem Publikum arbeiten: Vorgaben aufnehmen, Reaktionen lesen, einbeziehen.",
    definitionEn: "Work with the audience: take suggestions, read reactions, involve them.",
  },
] as const;

export type SkillId = (typeof SKILLS)[number]["id"];

export const SKILL_IDS = SKILLS.map((skill) => skill.id) as unknown as [
  SkillId,
  ...SkillId[],
];

const byId = new Map<string, (typeof SKILLS)[number]>(
  SKILLS.map((skill) => [skill.id, skill])
);

/**
 * Synonyms the extractor and the older free-text data used. Keys are
 * lower-cased; the values are guaranteed to be ids of the vocabulary above.
 * This is the only place where a phrase becomes a skill — everything else
 * works with ids.
 */
const ALIASES: Record<string, SkillId> = {
  // impulse
  spontaneity: "impulse",
  spontaneität: "impulse",
  spontanität: "impulse",
  "first idea": "impulse",
  // accepting
  acceptance: "accepting",
  "yes and": "accepting",
  "yes-and": "accepting",
  angebot: "accepting",
  // physicality
  "body awareness": "physicality",
  "physical expression": "physicality",
  körperbewusstsein: "physicality",
  körperausdruck: "physicality",
  movement: "physicality",
  movement_physical: "physicality",
  // attention
  "active listening": "attention",
  listening: "attention",
  focus: "attention",
  konzentration: "attention",
  wahrnehmung: "attention",
  // speed
  "quick thinking": "speed",
  reactivity: "speed",
  reaktion: "speed",
  schnelligkeit: "speed",
  // status
  "status play": "status",
  statusspiel: "status",
  // storytelling
  narrative: "storytelling",
  story: "storytelling",
  storytelling_narrative: "storytelling",
  erzählstruktur: "storytelling",
  "character creation": "storytelling",
  // timing
  rhythm: "timing",
  pause: "timing",
  // group
  "group mind": "group",
  ensemble: "group",
  "team work": "group",
  teamwork: "group",
  gruppengefühl: "group",
  // audience
  "audience interaction": "audience",
  publikumskontakt: "audience",
  "audience work": "audience",
};

const lookup = new Map<string, SkillId>();
for (const skill of SKILLS) {
  lookup.set(skill.id.toLowerCase(), skill.id);
  lookup.set(skill.de.toLowerCase(), skill.id);
  lookup.set(skill.en.toLowerCase(), skill.id);
}
for (const [phrase, id] of Object.entries(ALIASES)) {
  lookup.set(phrase, id);
}

/**
 * Maps anything the extractor (or an older artifact) might call a skill to an
 * id. Returns `undefined` for phrases outside the vocabulary — publishing
 * drops those rather than inventing a new skill.
 */
export function toSkillId(value: unknown): SkillId | undefined {
  if (typeof value !== "string") return undefined;
  return lookup.get(value.trim().toLowerCase());
}

export function getSkill(id: string): (typeof SKILLS)[number] | undefined {
  return byId.get(id);
}

/** The label for one skill in the given language. */
export function skillLabel(id: string, languageCode: "de" | "en"): string | null {
  const skill = byId.get(id);
  if (!skill) return null;
  return languageCode === "de" ? skill.de : skill.en;
}

/** The definition for one skill in the given language. */
export function skillDefinition(
  id: string,
  languageCode: "de" | "en"
): string | null {
  const skill = byId.get(id);
  if (!skill) return null;
  return languageCode === "de" ? skill.definitionDe : skill.definitionEn;
}

/**
 * The vocabulary as the extractor sees it: id, German label for matching a
 * German source wording, and the shared definition in one line each.
 */
export function skillPromptList(): string {
  return SKILLS.map(
    (skill) => `- ${skill.id} (${skill.de}): ${skill.definitionEn}`
  ).join("\n");
}
