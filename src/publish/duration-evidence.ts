/**
 * Duration provenance: does the source text actually state this number?
 *
 * The extraction model guesses `typicalDurationMinutes` for almost every
 * element. Publishing that guess next to a page that never names a duration
 * presents a model estimate as a measurement. This module answers the one
 * question the artifact needs: is there a sentence in the source that states
 * this duration?
 *
 * It is a pure, conservative check. False negatives are acceptable — the
 * number stays `inferred` and the consumer shows it as an estimate. False
 * positives are not: a `stated` label is a promise that the source supports
 * the number, so the grammar only accepts a whole-work subject with a duration
 * verb, an explicit duration label, or a bare duration field. Bounds
 * ("mindestens", "at most") and part-scoped statements ("jede Szene", "pro
 * Runde") are rejected: a bound is not a duration and a scene is not the work.
 *
 * Design: `product/features/work-fit-taxonomy.md` § Modell (`durationSource`).
 */
export type DurationSource = "stated" | "inferred";

export interface DurationProvenance {
  minutes: number;
  source: DurationSource;
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const QUALIFIER =
  String.raw`(?:(?:ca|circa|etwa|ungefähr|normalerweise|insgesamt|about|around|usually|roughly|approximately|approx|total)\.?\s+)*`;
const UNIT =
  String.raw`(?:minuten|minute|minutes|stunden|stunde|hours|hour|std|hrs|min|h)\.?(?![a-zäöüß])`;
// Range separators are deliberately limited to the ones a source uses for a
// duration. A hyphen inside a compound ("30-Minuten-Format") must not turn into
// a range, so the unit has to follow the second number directly.
const RANGE = String.raw`(${NUMBER})(?:\s*(?:-|–|—|bis|to)\s*(${NUMBER}))?\s*(${UNIT})`;

const SUBJECT = String.raw`(?:sie|es|das\s+spiel|das\s+format|die\s+übung|this|it|the\s+game|the\s+format|the\s+exercise)`;
const DURATION_VERB = String.raw`(?:dauert|dauern|takes|lasts|runs)`;

/**
 * "Sie dauert 30-45 Minuten." / "It usually takes about 15 minutes." The few
 * words between subject and verb cover adverbs ("It usually takes"); the
 * qualifier between verb and number covers "ca.", "about" and similar.
 */
const STATEMENT_PATTERN = new RegExp(
  String.raw`\b${SUBJECT}\s+(?:[\p{L}'’-]+\s+){0,2}?${DURATION_VERB}\s+${QUALIFIER}${RANGE}`,
  "giu"
);

/** "Dauer: 10 Minuten", "Time: 5 Minutes", "Spielzeit: 90 Min." */
const LABEL_PATTERN = new RegExp(
  String.raw`\b(?:spieldauer|spielzeit|dauer|duration|length|time)\s*[:\-–—]\s*${QUALIFIER}${RANGE}`,
  "giu"
);

/** A card field or sidebar value that is nothing but a duration. */
const BARE_PATTERN = new RegExp(
  String.raw`^\s*${QUALIFIER}${RANGE}\s*\.?\s*$`,
  "iu"
);

const BOUND = /\b(?:mindestens|maximal|höchstens|wenigstens|until|at\s+least|at\s+most|no\s+more\s+than|up\s+to|bis\s+zu)\b/iu;
const PART_SCOPE =
  /\b(?:jede[snr]?|jeder|pro|each|per|every)\s+(?:szene|runde|vorstellung|spieler|spielerin|scene|round|player|beat|minute)\b/iu;

function unitScale(unit: string): number {
  return /^(?:stunden|stunde|hours|hour|std|hrs|h)/i.test(unit) ? 60 : 1;
}

/**
 * The minute range a match states. A single number is a range of that number
 * with half a minute of rounding tolerance on each side (the model rounds
 * "1,5" to 2 or a range to a single value).
 */
function matchRange(match: RegExpExecArray | RegExpMatchArray): {
  min: number;
  max: number;
} | undefined {
  const first = Number(match[1]?.replace(",", "."));
  if (!Number.isFinite(first)) return undefined;
  const scale = unitScale(match[3] ?? "");
  const second = match[2] ? Number(match[2].replace(",", ".")) : first;
  if (!Number.isFinite(second)) return undefined;
  const a = first * scale;
  const b = second * scale;
  return { min: Math.min(a, b) - 0.5, max: Math.max(a, b) + 0.5 };
}

function contains(minutes: number, range: { min: number; max: number }): boolean {
  return minutes >= range.min && minutes <= range.max;
}

/**
 * The clause around a match. Bounds and part scopes are rejected per clause,
 * so a rejected phrase elsewhere in the paragraph does not hide a valid
 * statement and vice versa.
 */
function clauseAround(text: string, start: number, end: number): string {
  const before = text.slice(0, start);
  const boundary = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
    before.lastIndexOf(";"),
    before.lastIndexOf("\n")
  );
  const after = text.slice(end);
  const endOffset = after.search(/[.!?;\n]/);
  return text.slice(
    boundary + 1,
    endOffset === -1 ? text.length : end + endOffset + 1
  );
}

/**
 * The page text as the grammar sees it: HTML tags and markdown emphasis
 * removed, everything else (including line breaks) kept so clauses survive.
 */
export function plainText(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[*_#>`~]+/g, " ");
}

/**
 * Whether the prose states this duration. A number inside the source's own
 * range counts ("40" in "30-45 Minuten"), as agreed in the design's open
 * question 1.
 */
export function hasStatedDuration(
  value: string | undefined,
  minutes: number
): boolean {
  const text = plainText(value);
  if (!text.trim()) return false;

  for (const pattern of [STATEMENT_PATTERN, LABEL_PATTERN]) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const range = matchRange(match);
      if (!range || !contains(minutes, range)) continue;

      const clause = clauseAround(text, match.index, match.index + match[0].length);
      if (BOUND.test(clause) || PART_SCOPE.test(clause)) continue;
      return true;
    }
  }

  return false;
}

/**
 * Whether a card field is nothing but the duration ("10 Min." from a sidebar
 * `Dauer` field). Kept separate from the prose grammar so a bare number in a
 * sentence ("Spielt 2 Minuten") cannot qualify.
 */
export function isStatedDurationValue(
  value: string | undefined,
  minutes: number
): boolean {
  const text = plainText(value).trim();
  if (!text) return false;

  // A label is still prose; the bare form is only "10 Minuten".
  if (hasStatedDuration(text, minutes)) return true;

  const match = BARE_PATTERN.exec(text);
  if (!match) return false;
  const range = matchRange(match);
  return Boolean(range && contains(minutes, range));
}

/**
 * The provenance of one work's duration: `null` when no source names a
 * duration at all, otherwise the number plus whether a source states it.
 */
export function deriveDuration(input: {
  minutes: number | undefined;
  /** Page bodies and card values of every member of the work. */
  evidence: (string | undefined)[];
}): DurationProvenance | null {
  const { minutes } = input;
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }

  const stated = input.evidence.some((value) =>
    isStatedDurationValue(value, minutes)
  );
  return { minutes, source: stated ? "stated" : "inferred" };
}
