/**
 * Deterministic style checks for normalized how-to-play steps.
 *
 * The extraction prompt asks for one voice: address the players directly
 * ("ihr" in German, imperative in English). In practice a model drifts — it
 * mixes "Bildet einen Kreis" with "Die Spieler bilden einen Kreis", switches
 * between "du" and "ihr" halfway through an element, or drops a subject without
 * adjusting the verb. That last case produced this, which is not grammatical:
 *
 *     "Frieren sofort in eurer exakten Pose ein."
 *
 * These checks cannot rewrite a step, only reject it. The caller asks the model
 * once more and keeps whichever answer has fewer violations.
 *
 * Precision matters more than recall: a false positive costs a pointless
 * retry. Steps that open with a conditional, temporal or optional clause
 * ("Wenn …", "Optional: …", "After the scene …") are therefore classified as
 * "neutral" rather than judged.
 */

export type StyleRule =
  | "de-du-form"
  | "de-formal-address"
  | "de-imperative-opener"
  | "de-man-address"
  | "de-mixed-voice"
  | "en-mixed-voice"
  | "wrong-language";

export interface StyleViolation {
  rule: StyleRule;
  /** Index of the offending step, or undefined for element-level findings. */
  stepIndex?: number;
  detail: string;
  /** For "wrong-language": the language the work is written in. */
  language?: string;
}

/**
 * Who a step talks about.
 *
 * "address"     — talks to the players: imperative or second person.
 * "descriptive" — talks about named actors: "Die Spieler bilden …".
 * "neutral"     — the check declines to judge (conditional opener, fragment).
 */
export type StepVoice = "address" | "descriptive" | "neutral";

// Second person singular. "du"/"dich"/"dir" and the possessives are unambiguous.
const DE_DU = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner)\b/i;

// Second person plural. The possessive forms are unambiguous; a bare "ihr" can
// also be a third person possessive ("ihr Spiel"), so it is not used alone.
const DE_IHR = /\b(euch|euer|eure|euren|eurem|eurer)\b/i;

// Formal address. "Sie" on its own is ambiguous ("Sie verdächtigen sich" =
// "they suspect each other"), so only the unambiguous forms count as proof.
const DE_FORMAL = /\b(Ihnen|Ihre|Ihren|Ihrem|Ihrer)\b/;

/**
 * "man" as the actor of the instruction.
 *
 * Only the leading clause is judged: "…, was man in einer Küche findet" is a
 * relative clause describing the world, not an instruction to an unnamed
 * person. A step whose first clause starts with "man" is the real target.
 * Excluded: "manchmal", "manche", "normal".
 */
function usesManAsActor(text: string): boolean {
  const lead = text.split(/[,;:]/)[0] ?? "";
  return /(^|[^\wäöüß])man\b(?!ch)/i.test(lead);
}

/**
 * Openers that make a step conditional, temporal, local or optional. Such a
 * clause may legitimately be followed by an imperative, so the step is not
 * classified at all.
 */
const DE_SOFT_OPENER =
  /^(Wenn|Falls|Sobald|Nachdem|Während|Währenddessen|Nach|Vor|Bei|Beim|Bevor|Seit|Bis|Trotz|Statt|Ohne|Durch|Über|Unter|Zwischen|Hinter|Innerhalb|Außerhalb|Optional|Alternativ|Hinweis|Wichtig|Achtung|Tipp|Gleichzeitig|Außerdem|Zudem|Deshalb|Darum|Daher|Also|So|Hier|Dort|Jetzt|Nun|Dann|Danach|Anschließend|Zunächst|Zuerst|Schließlich|Abschließend|Gemeinsam|Zusammen|Im|In|Am|An|Auf|Mit|Für|Um|Aus|Zum|Zur|Vom|Als|Wie|Je|Pro)\b/i;

/**
 * A determiner or third person pronoun in subject position — the reliable
 * signal that a step describes what a named actor does.
 */
const DE_SUBJECT_START =
  /^(Der|Die|Das|Den|Dem|Des|Ein|Eine|Einer|Einem|Einen|Eines|Alle|Jeder|Jede|Jedes|Jeden|Beide|Beiden|Man|Er|Es|Wir)\s/;

/**
 * German verb lemmas that realistically open a how-to-play step.
 *
 * Stored as stems ("bild", "frier", "mach") because the extracted steps contain
 * inflected forms: the plural imperative "bildet" is stem + "et", "friert" is
 * stem + "t", and the du-imperative "beginne" is stem + "e". Comparing
 * inflected forms against lemmas directly matches nothing, which is how
 * "Frieren sofort in eurer Pose ein" slipped through.
 */
const DE_VERB_LEMMAS = `achten anfangen angeben angreifen anheben ankommen
   annehmen anschauen ansprechen antworten anziehen aufbauen aufgeben aufhalten
   aufheben aufhören aufnehmen aufpassen aufstehen auftreten aufziehen ausatmen
   ausdrücken ausgeben aushalten ausmachen ausprobieren ausrichten ausrufen
   aussehen aussprechen aussteigen ausstrecken ausziehen balancieren bauen
   beantworten bedienen beeinflussen beenden begegnen beginnen begleiten
   begrenzen begrüßen behalten behandeln bekommen bemerken benennen benutzen
   beobachten bereiten berühren beschleunigen beschreiben besetzen bestehen
   bestimmen betonen betrachten betreten bewegen beweisen bezahlen bilden
   bitten bleiben blinzeln brüllen buchstabieren danken darstellen dauern decken
   definieren dehnen demonstrieren denken deuten diskutieren drehen drücken
   durchführen durchlaufen einatmen einbauen einbeziehen einfallen eingehen
   einhalten einladen einnehmen einrichten einsteigen einstudieren eintreten
   einziehen entdecken entfernen entkommen entscheiden erscheinen erschaffen
   erstarren eröffnen erfinden erfüllen ergeben ergreifen erhalten erhöhen
   erinnern erkennen erklären erlauben erleben erlernen erraten erschweren
   erzählen erzeugen essen fahren fallen fangen fassen fehlen feiern festhalten
   finden fliegen fliehen flüstern folgen formen fortsetzen fragen frieren
   fühlen führen
   füllen funktionieren füttern geben gebrauchen gefallen gehen gehören gelingen
   genießen gestalten gestehen gewinnen gießen greifen grinsen grölen halten
   hängen hassen heben heißen helfen herstellen hervorheben hinstellen hoffen
   holen hören hüpfen husten ignorieren improvisieren informieren innehalten
   inszenieren integrieren interpretieren jubeln kauen kichern klappen klatschen
   klettern klingen klopfen kommen kommentieren kommunizieren konzentrieren
   kosten kämpfen kürzen lachen laden lassen laufen lauschen legen lehnen
   leisten lernen lesen leuchten lieben liegen loben locken lösen loslassen
   machen malen markieren meinen merken messen mimen mischen mitmachen mitnehmen
   mitteilen nachahmen nachdenken nachgeben nachmachen nachsprechen nehmen
   nennen nicken niesen notieren nutzen öffnen ordnen packen passen pausieren
   pfeifen pflanzen pflücken planen platzieren positionieren präsentieren proben
   probieren produzieren prüfen quetschen raten reagieren rechnen reden reichen
   reinigen reißen reiten rennen reservieren retten richten rollen rufen rühren
   sagen sammeln schaffen schalten schauen scheinen schenken schicken schieben
   schlagen schleichen schließen schlüpfen schmelzen schneiden schreiben
   schreien schubsen schütteln schützen schwanken schweben schweigen schwingen
   schwimmen schwören seufzen singen sitzen sorgen spannen spielen spiegeln
   spüren sprechen springen spritzen stampfen stehen stehlen steigen steigern
   stellen sterben stimmen stöhnen stolpern stoppen stören stoßen strahlen
   strecken streiten stricken studieren stürzen suchen summen tanzen tauchen
   teilen testen töten tragen träumen treffen treiben trennen treten trinken
   trotzen tun turnen üben übergeben überlegen übernehmen überqueren
   überraschen übersetzen übertreiben überzeugen umarmen umdrehen umfallen
   umgehen umsetzen umstellen umziehen unterbrechen unterhalten unterstützen
   untersuchen verändern verbergen verbessern verbieten verbinden verfolgen
   vergeben vergessen vergleichen verhalten verkaufen verkörpern verlangen
   verlangsamen verlassen verletzen verlieren vermeiden vermitteln verringern
   verschieben versprechen verstecken verstehen versuchen verteidigen verteilen
   vertrauen verursachen verwandeln verwenden verzichten vorbereiten vorlesen
   vormachen vorstellen vorgeben wachsen wagen wählen warten waschen wechseln
   wecken weglaufen weggehen wehtun weinen wenden werben werfen werten winken
   wirbeln wirken wissen wohnen wollen wünschen zählen zeigen ziehen zielen
   zischen zuhören zuordnen zurückkehren zusammenarbeiten zusammenführen
   zuwerfen zwingen`;

/** Stem of a German verb: "bilden" → "bild", "sammeln" → "sammel". */
function stemOf(lemma: string): string {
  if (lemma.endsWith("eln") || lemma.endsWith("ern")) return lemma.slice(0, -1);
  if (lemma.endsWith("en")) return lemma.slice(0, -2);
  return lemma;
}

const DE_VERB_STEMS: ReadonlySet<string> = new Set(
  DE_VERB_LEMMAS.split(/\s+/).filter(Boolean).map(stemOf)
);

const EN_SECOND_PERSON = /\b(you|your|yours|yourself)\b/i;

const EN_SOFT_OPENER =
  /^(When|If|After|Before|Once|Then|During|While|Until|Unless|Whenever|Wherever|Optionally|Alternatively|Immediately|First|Second|Third|Fourth|Fifth|Finally|Initially|Next|Meanwhile|Instead|Otherwise|Also|Again|Here|There|Now|Gradually|Slowly|Quickly|Simultaneously|Together|In|On|At|For|With|Without|By|From|To|As)\b/i;

const EN_SUBJECT_START =
  /^(The|A|An|Each|Every|One|Two|Three|Four|Five|Some|Another|Someone|Somebody|Any|Anyone|All|Both|Nobody|Nothing|Players?|Performers?|Participants?|He|She|They|It|This|That|These|Those)\s/;

/** The opening word, lowercased, stripped of surrounding punctuation. */
function firstToken(text: string): string {
  return (text.trim().split(/[\s,.:;–—!?()"'„“]/)[0] ?? "").toLowerCase();
}

/**
 * Remove quoted speech before style analysis.
 *
 * An element may legitimately quote dialogue ("Sagt: 'Du bist dran'"), and that
 * quoted "du" is not the narrator's address. Only the surrounding instruction
 * is judged.
 */
export function stripQuotedSpeech(action: string): string {
  return action
    .replace(/„[^“]*“/g, " ")
    .replace(/"[^"]*"/g, " ")
    .replace(/‚[^‘]*‘/g, " ")
    .replace(/«[^»]*»/g, " ")
    .replace(/'[^']*'/g, " ");
}

/**
 * Whether the opening word is an inflected German verb, and if so in which form.
 *
 * - "imperative-ihr": stem + "t"/"et" — "bildet", "kommt", "reagiert"
 * - "imperative-du":  stem + "e"/"st"   — "beginne", "achte", "suchst"
 * - "verb-other":     stem + "en"/"n"   — "frieren", "spielen" (infinitive or
 *                     subject-less third person plural)
 */
function germanOpenerForm(
  token: string
): "imperative-ihr" | "imperative-du" | "verb-other" | undefined {
  if (token.length < 3) return undefined;
  // Longest stem wins, so "verstellen" is not read as "stellen".
  let best: string | undefined;
  for (const stem of DE_VERB_STEMS) {
    if (!token.startsWith(stem)) continue;
    if (!best || stem.length > best.length) best = stem;
  }
  if (!best) return undefined;
  const suffix = token.slice(best.length);
  if (suffix === "t" || suffix === "et") return "imperative-ihr";
  if (suffix === "e" || suffix === "st" || suffix === "est") return "imperative-du";
  if (suffix === "en" || suffix === "n") return "verb-other";
  return undefined;
}

/**
 * Classify how a German step talks about its actors.
 */
export function deStepVoice(action: string): StepVoice {
  const text = stripQuotedSpeech(action).trim();
  if (!text) return "neutral";
  if (DE_SOFT_OPENER.test(text)) return "neutral";
  // Sentence-initial "Sie" is either formal address or "they"; undecidable.
  if (/^Sie\s/.test(text)) return "neutral";
  // Second person wins over a determiner subject: "Jeder von euch wählt …"
  // addresses the players even though it opens with "Jeder".
  if (DE_DU.test(text) || DE_IHR.test(text)) return "address";
  if (DE_SUBJECT_START.test(text)) return "descriptive";
  if (germanOpenerForm(firstToken(text))?.startsWith("imperative")) return "address";
  return "neutral";
}

/**
 * Classify how an English step talks about its actors.
 *
 * English does not begin an adverbial clause with a determiner, so a determiner
 * in first position is a reliable sign of a descriptive step. Everything else
 * that is not an obvious soft opener counts as addressed.
 */
export function enStepVoice(action: string): StepVoice {
  const text = stripQuotedSpeech(action).trim();
  if (!text) return "neutral";
  if (EN_SOFT_OPENER.test(text)) return "neutral";
  if (EN_SECOND_PERSON.test(text)) return "address";
  if (EN_SUBJECT_START.test(text) && !EN_SECOND_PERSON.test(text)) return "descriptive";
  return "address";
}

/**
 * A German step that opens with a verb but not in the plural imperative form —
 * the exact shape of "Frieren sofort in eurer exakten Pose ein."
 */
export function isInvalidGermanImperative(action: string): boolean {
  const text = stripQuotedSpeech(action).trim();
  if (!text) return false;
  if (DE_SOFT_OPENER.test(text)) return false;
  if (/^Sie\s/.test(text)) return false;
  if (DE_SUBJECT_START.test(text)) return false;
  const form = germanOpenerForm(firstToken(text));
  return form === "verb-other";
}

function stepActions(element: unknown): string[] {
  const howToPlay = (
    element as { normalized?: { howToPlay?: { steps?: unknown[] } | null } }
  )?.normalized?.howToPlay;
  if (!howToPlay?.steps || !Array.isArray(howToPlay.steps)) return [];
  return howToPlay.steps.map((step) =>
    String((step as { action?: unknown })?.action ?? "")
  );
}

// Function words used to guess which language a whole answer is written in
// (word-boundary matches, case-insensitive). Precision is not the goal: the
// check only fires when one language clearly dominates.
const DE_STOP_WORDS = [
  "der", "die", "das", "und", "ihr", "eure", "euer", "euch", "nicht", "mit",
  "für", "wird", "sind", "einen", "eine", "einem", "einer", "dem", "den",
  "auf", "aus", "bei", "nach", "über", "wenn", "dann", "dass",
];

const EN_STOP_WORDS = [
  "the", "and", "your", "you", "with", "from", "that", "this", "are", "is",
  "to", "of", "in", "for", "on", "when", "then", "they", "their", "it",
];

function countStopWords(text: string, words: readonly string[]): number {
  let count = 0;
  for (const word of words) {
    const matches = text.match(new RegExp(`\\b${word}\\b`, "gi"));
    if (matches) count += matches.length;
  }
  return count;
}

/** Everything that must be written in the work language, joined. */
function languageSample(element: unknown): string {
  const normalized = (
    element as {
      normalized?: {
        summary?: unknown;
        description?: unknown;
        howToPlay?: { steps?: Array<{ action?: unknown }> } | null;
        tips?: Array<{ text?: unknown }>;
      };
    }
  )?.normalized;
  if (!normalized) return "";
  const parts = [
    String(normalized.summary ?? ""),
    String(normalized.description ?? ""),
  ];
  for (const step of normalized.howToPlay?.steps ?? []) {
    parts.push(String(step?.action ?? ""));
  }
  for (const tip of normalized.tips ?? []) {
    parts.push(String(tip?.text ?? ""));
  }
  return parts.join("\n");
}

/**
 * A whole answer written in the wrong language.
 *
 * The prompt names the output language, but the merged stage once returned
 * German for an English work. Stop-word counts make that visible without a
 * second model call: an element whose function words are 80 % the other
 * language is not a stray game term, it is the wrong language. The check stays
 * conservative (at least ten foreign hits) so one quoted word cannot trigger a
 * pointless retry.
 */
function findWrongLanguageViolation(
  element: unknown,
  languageCode: string
): StyleViolation | undefined {
  if (languageCode !== "de" && languageCode !== "en") return undefined;
  const text = languageSample(element);
  const de = countStopWords(text, DE_STOP_WORDS);
  const en = countStopWords(text, EN_STOP_WORDS);
  const target = languageCode === "de" ? en : de;
  const total = de + en;
  if (target < 10 || total === 0) return undefined;
  if (target / total < 0.8) return undefined;
  return {
    rule: "wrong-language",
    language: languageCode === "de" ? "German" : "English",
    detail: `${target} of ${total} stop words are not ${languageCode}`,
  };
}

/**
 * All style violations for one extracted element, in the language it was
 * written in. An empty array means the element satisfies the contract.
 */
export function findStyleViolations(
  element: unknown,
  languageCode: string
): StyleViolation[] {
  const actions = stepActions(element);
  const violations: StyleViolation[] = [];

  const languageViolation = findWrongLanguageViolation(element, languageCode);
  if (languageViolation) violations.push(languageViolation);

  if (actions.length === 0) return violations;

  if (languageCode === "de") {
    actions.forEach((action, stepIndex) => {
      const text = stripQuotedSpeech(action);
      const snippet = action.slice(0, 80);

      if (DE_DU.test(text)) {
        violations.push({
          rule: "de-du-form",
          stepIndex,
          detail: `uses "du" instead of "ihr": ${snippet}`,
        });
      } else if (
        germanOpenerForm(firstToken(text)) === "imperative-du" &&
        !DE_SOFT_OPENER.test(text) &&
        !DE_SUBJECT_START.test(text)
      ) {
        // "Beginne mit der Handlung" has no pronoun but is still du-form.
        violations.push({
          rule: "de-du-form",
          stepIndex,
          detail: `du-imperative instead of ihr-imperative: ${snippet}`,
        });
      }
      if (DE_FORMAL.test(text)) {
        violations.push({
          rule: "de-formal-address",
          stepIndex,
          detail: `formal address: ${snippet}`,
        });
      }
      if (usesManAsActor(text)) {
        violations.push({
          rule: "de-man-address",
          stepIndex,
          detail: `uses "man" as the actor: ${snippet}`,
        });
      }
      if (isInvalidGermanImperative(action)) {
        violations.push({
          rule: "de-imperative-opener",
          stepIndex,
          detail: `not a plural imperative: ${snippet}`,
        });
      }
    });

    const voices = new Set(actions.map(deStepVoice));
    if (voices.has("address") && voices.has("descriptive")) {
      violations.push({
        rule: "de-mixed-voice",
        detail: "mixes addressed steps with steps describing named actors",
      });
    }
    return violations;
  }

  const voices = actions.map(enStepVoice);
  if (voices.includes("address") && voices.includes("descriptive")) {
    violations.push({
      rule: "en-mixed-voice",
      detail: "mixes imperative steps with steps starting with a subject",
    });
  }
  return violations;
}

/**
 * All violations across a whole response: a single element or a split array.
 *
 * A split response must be checked too — otherwise the retry silently never
 * fires for the pages that get split into a parent plus children.
 */
export function collectStyleViolations(
  result: unknown,
  languageCode: string
): StyleViolation[] {
  const elements = Array.isArray(result) ? result : [result];
  return elements.flatMap((element) =>
    findStyleViolations(element, languageCode)
  );
}

/** Number of violations across a whole response (one element or a split). */
export function countStyleViolations(
  result: unknown,
  languageCode: string
): number {
  return collectStyleViolations(result, languageCode).length;
}

/**
 * Appended to the user prompt on a retry. Naming the exact failures works
 * better than repeating the whole style section, and keeps the retry cheap.
 */
export function buildStyleCorrection(violations: StyleViolation[]): string {
  const seen = new Set<StyleRule>();
  const lines: string[] = [];
  for (const violation of violations) {
    if (seen.has(violation.rule)) continue;
    seen.add(violation.rule);
    const correction = CORRECTIONS[violation.rule];
    lines.push(
      `- ${typeof correction === "string" ? correction : correction(violation)}`
    );
  }
  return `\n\nYour previous answer broke these style rules. Rewrite the whole JSON and fix them:\n${lines.join("\n")}`;
}

const CORRECTIONS: Record<
  StyleRule,
  string | ((violation: StyleViolation) => string)
> = {
  "de-du-form":
    'Use only "ihr" for the players. Never "du", "dich", "dir", "dein" — rewrite such a step in the plural ("Suche dir …" becomes "Sucht euch …", "Beginne" becomes "Beginnt").',
  "de-formal-address":
    'Never use formal address ("Sie", "Ihnen", "Ihre"). Address the players as "ihr".',
  "de-imperative-opener":
    'Every German step must open with a plural imperative ending in "-t" ("Bildet", "Stellt", "Geht"). "Spielen Szenen …" must become "Spielt Szenen …"; "Frieren sofort … ein" must become "Friert sofort … ein".',
  "de-man-address":
    'Never use "man" as the actor. Address the players as "ihr" ("Man bildet einen Kreis" becomes "Bildet einen Kreis").',
  "de-mixed-voice":
    'Do not mix voices inside one element. If a step addresses the players, every step addresses them: "Die Spieler bilden einen Kreis" becomes "Bildet einen Kreis", "Der Moderator ruft Stopp" becomes "Lasst den Moderator Stopp rufen".',
  "en-mixed-voice":
    'Do not mix voices inside one element. Every step starts with a verb: "The other players perform the scene" becomes "Perform the scene with the other players". Do not mix imperative steps with steps that begin with "The", "A", "Each" or "One".',
  "wrong-language": (violation) =>
    `Write the whole answer in ${violation.language ?? "the work language"}. Every field must be in that language, including the summary, the description, every step and every tip. Do not answer in German for an English work or in English for a German work.`,
};