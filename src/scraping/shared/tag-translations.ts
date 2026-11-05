/**
 * Canonical tag vocabulary.
 *
 * Every tag that leaves the pipeline is one of these concepts. The key is the
 * stable, language-neutral identity (`tagIds`), `de`/`en` are the labels shown
 * to users, and `axis` tells consumers what kind of statement the tag makes.
 *
 * Keep labels unique per language — `translatedTags` is derived 1:1 from
 * `tagIds`, so two concepts sharing a label would make the array ambiguous.
 */
export type TagAxis =
  | "format" // what kind of structure is it (game, exercise, warmup, …)
  | "difficulty" // who is it for
  | "energy" // how does it feel
  | "grouping" // how are the players arranged
  | "content" // what is it about / what does it train
  | "meta"; // editorial or catalogue information, not part of the element itself

export interface TagTranslation {
  de: string;
  en: string;
  axis: TagAxis;
}

export const tagTranslations: Record<string, TagTranslation> = {
  // difficulty
  beginner: { de: "Anfänger", en: "Beginner", axis: "difficulty" },
  advanced: { de: "Fortgeschritten", en: "Advanced", axis: "difficulty" },
  pro: { de: "Profi", en: "Pro", axis: "difficulty" },

  // format
  nameGames: { de: "Namensspiele", en: "Name Games", axis: "format" },
  icebreaker: { de: "Kennenlernen", en: "Icebreaker", axis: "format" },
  warmup: { de: "Aufwärmspiel", en: "Warmup", axis: "format" },
  exercise: { de: "Übung", en: "Exercise", axis: "format" },
  game: { de: "Spiel", en: "Game", axis: "format" },
  show: { de: "Show", en: "Show", axis: "format" },
  longform: { de: "Langformen", en: "Longform", axis: "format" },
  improvForms: { de: "Impro-Formen", en: "Improv Forms", axis: "format" },
  shortform: { de: "Kurzform", en: "Shortform", axis: "format" },
  opening: { de: "Opening", en: "Opening", axis: "format" },
  handle: { de: "Handle", en: "Handle", axis: "format" },
  askFor: { de: "Publikumsfrage", en: "Ask For", axis: "format" },
  stringOfPearls: {
    de: "String of Pearls",
    en: "String of Pearls",
    axis: "format",
  },
  musicalImprov: {
    de: "Musical Improv",
    en: "Musical Improv",
    axis: "format",
  },
  organicImprov: {
    de: "Organic Improv",
    en: "Organic Improv",
    axis: "format",
  },
  searchGame: { de: "Suchspiel", en: "Search Game", axis: "format" },
  guessingGames: { de: "Ratespiele", en: "Guessing Games", axis: "format" },
  chainGames: { de: "Kettenspiele", en: "Chain Games", axis: "format" },
  switches: { de: "Switches", en: "Switches", axis: "format" },
  letterGames: { de: "Buchstabenspiele", en: "Letter Games", axis: "format" },
  replay: { de: "Replays", en: "Replay", axis: "format" },
  dialogueForm: { de: "Dialog", en: "Dialogue", axis: "format" },

  // energy
  calm: { de: "Ruhig", en: "Calm", axis: "energy" },
  energetic: { de: "Lebhaft", en: "Energetic", axis: "energy" },
  wild: { de: "Wild", en: "Wild", axis: "energy" },

  // grouping
  pairs: { de: "Paare", en: "Pairs", axis: "grouping" },
  group: { de: "Gruppe", en: "Group", axis: "grouping" },
  circle: { de: "Kreis", en: "Circle", axis: "grouping" },
  line: { de: "Reihe", en: "Line", axis: "grouping" },
  ensemble: { de: "Ensemble", en: "Ensemble", axis: "grouping" },

  // content
  milling: { de: "Raumlauf", en: "Milling", axis: "content" },
  slapstick: { de: "Slapstick", en: "Slapstick", axis: "content" },
  multitasking: { de: "Multitasking", en: "Multitasking", axis: "content" },
  direction: { de: "Regie", en: "Direction", axis: "content" },
  voice: { de: "Stimme", en: "Voice", axis: "content" },
  storytelling: { de: "Storytelling", en: "Storytelling", axis: "content" },
  alphabet: { de: "Alphabet", en: "Alphabet", axis: "content" },
  texts: { de: "Texte", en: "Texts", axis: "content" },
  attention: { de: "Aufmerksamkeit", en: "Attention", axis: "content" },
  audienceOnStage: {
    de: "Zuschauer auf der Bühne",
    en: "Audience On Stage",
    axis: "content",
  },
  teamPlay: { de: "Teamplay", en: "Team Play", axis: "content" },
  talking: { de: "Reden", en: "Talking", axis: "content" },
  speech: { de: "Sprache", en: "Speech", axis: "content" },
  physicalness: { de: "Körperlichkeit", en: "Physicalness", axis: "content" },
  gibberish: { de: "Gromolo", en: "Gibberish", axis: "content" },
  pantomime: { de: "Pantomime", en: "Pantomime", axis: "content" },
  emotion: { de: "Emotion", en: "Emotion", axis: "content" },
  musicGames: { de: "Musikspiele", en: "Music Games", axis: "content" },
  offer: { de: "Angebot", en: "Offer", axis: "content" },
  accepting: { de: "Annahme", en: "Accepting", axis: "content" },
  music: { de: "Musik", en: "Music", axis: "content" },
  singing: { de: "Gesang", en: "Singing", axis: "content" },
  objects: { de: "Gegenstände", en: "Objects", axis: "content" },
  physicalContact: {
    de: "Körperkontakt",
    en: "Physical Contact",
    axis: "content",
  },
  touch: { de: "Berührung", en: "Touch", axis: "content" },
  blackAndWhite: {
    de: "Schwarz auf Weiß",
    en: "In Black And White",
    axis: "content",
  },
  dubbing: { de: "Synchro", en: "Dubbing", axis: "content" },
  impulse: { de: "Impuls", en: "Impulse", axis: "content" },
  speed: { de: "Schnelligkeit", en: "Speed", axis: "content" },
  telling: { de: "Erzählen", en: "Telling", axis: "content" },
  association: { de: "Assoziieren", en: "Association", axis: "content" },
  concentration: { de: "Konzentration", en: "Concentration", axis: "content" },
  perception: { de: "Wahrnehmung", en: "Perception", axis: "content" },
  listening: { de: "Zuhören", en: "Listening", axis: "content" },
  audience: { de: "Zuschauer", en: "Audience", axis: "content" },
  status: { de: "Status", en: "Status", axis: "content" },
  expression: { de: "Ausdruck", en: "Expression", axis: "content" },
  memory: { de: "Gedächtnis", en: "Memory", axis: "content" },
  rhyming: { de: "Reimen", en: "Rhyming", axis: "content" },
  rooms: { de: "Räume", en: "Rooms", axis: "content" },
  movement: { de: "Bewegung", en: "Movement", axis: "content" },
  focus: { de: "Fokus", en: "Focus", axis: "content" },
  action: { de: "Aktion", en: "Action", axis: "content" },
  reaction: { de: "Reaktion", en: "Reaction", axis: "content" },
  breathing: { de: "Atmung", en: "Breathing", axis: "content" },
  dramaturgy: { de: "Dramaturgie", en: "Dramaturgy", axis: "content" },
  trust: { de: "Vertrauen", en: "Trust", axis: "content" },
  dance: { de: "Tanz", en: "Dance", axis: "content" },
  choreography: { de: "Choreographie", en: "Choreography", axis: "content" },
  character: { de: "Charakter", en: "Character", axis: "content" },
  editingTechnique: {
    de: "Schnitttechnik",
    en: "Editing Technique",
    axis: "content",
  },
  timing: { de: "Timing", en: "Timing", axis: "content" },
  creativity: { de: "Kreativität", en: "Creativity", axis: "content" },
  setting: { de: "Setting", en: "Setting", axis: "content" },
  environment: { de: "Umgebung", en: "Environment", axis: "content" },
  relationships: { de: "Beziehungen", en: "Relationships", axis: "content" },
  conflict: { de: "Konflikt", en: "Conflict", axis: "content" },
  resolution: { de: "Auflösung", en: "Resolution", axis: "content" },
  commitment: { de: "Commitment", en: "Commitment", axis: "content" },
  exploration: { de: "Exploration", en: "Exploration", axis: "content" },
  support: { de: "Unterstützung", en: "Support", axis: "content" },
  failure: { de: "Scheitern", en: "Failure", axis: "content" },
  problemSolving: {
    de: "Problemlösen",
    en: "Problem Solving",
    axis: "content",
  },
  propel: { de: "Vorantreiben", en: "Propel", axis: "content" },
  minimalism: { de: "Reduktion", en: "Minimalism", axis: "content" },

  // meta / editorial — useful for filtering, not for similarity
  rulesTips: { de: "Regeln & Tipps", en: "Rules & Tips", axis: "meta" },
  basicInformation: {
    de: "Basisinformationen",
    en: "Basic Information",
    axis: "meta",
  },
  genreList: { de: "Genreliste", en: "Genre List", axis: "meta" },
  improvGroups: { de: "Improv Groups", en: "Improv Groups", axis: "meta" },
  organization: { de: "Organisation", en: "Organization", axis: "meta" },
  other: { de: "Sonstige", en: "Other", axis: "meta" },
  concept: { de: "Konzept", en: "Concept", axis: "meta" },
  stub: { de: "Stub", en: "Stub", axis: "meta" },
  glossary: { de: "Glossar", en: "Glossary", axis: "meta" },
  jam: { de: "Jam", en: "Jam", axis: "meta" },
  podcast: { de: "Podcast", en: "Podcast", axis: "meta" },
};

export type TagId = keyof typeof tagTranslations;
