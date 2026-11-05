import { z } from "zod";

/**
 * What a variation changes relative to its base exercise.
 *
 * Derived bottom-up from the 1,260 published variations: the free-text
 * `differsBy` values cluster around players, information, rules, context,
 * medium and audience. The list is deliberately short — it is a filter, not a
 * taxonomy. The prose stays in `description` and `differsBy`.
 */
export const CHALLENGE_LEVERS = [
  "players",
  "information",
  "rules",
  "context",
  "medium",
  "audience",
] as const;

export type ChallengeLever = (typeof CHALLENGE_LEVERS)[number];

/**
 * `unknown` is not a failure: it means the variation text does not say whether
 * it is easier or harder. We never guess, because a wrong "make it harder"
 * recommendation is worse than none.
 */
export const CHALLENGE_DIRECTIONS = [
  "easier",
  "harder",
  "lateral",
  "unknown",
] as const;

export type ChallengeDirection = (typeof CHALLENGE_DIRECTIONS)[number];

export const challengeAnnotationSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(CHALLENGE_DIRECTIONS),
  lever: z.enum(CHALLENGE_LEVERS).nullable(),
  /** Verbatim quote from the variation text that justifies the direction. */
  evidence: z.string(),
});

export type ChallengeAnnotation = z.infer<typeof challengeAnnotationSchema>;

export const challengeElementSchema = z.object({
  /** Hash of the input that was classified; used for cache invalidation. */
  inputHash: z.string().length(32),
  variations: z.array(challengeAnnotationSchema),
});

export const challengeFileSchema = z.object({
  meta: z.object({
    model: z.string(),
    promptHash: z.string(),
    generatedAt: z.string(),
  }),
  elements: z.record(z.string(), challengeElementSchema),
});

export type ChallengeFile = z.infer<typeof challengeFileSchema>;

/**
 * Element identifier → normalized variation name → annotation.
 *
 * Used by the publish layer to attach the classification to the deduplicated
 * variations of a work.
 */
export type ChallengeIndex = Map<
  string,
  Map<string, ChallengeAnnotation>
>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Signals that the variation text itself names a change in challenge.
 *
 * Direction is only published when one of these appears in the text. This keeps
 * plausible-sounding but ungrounded inferences (for example "both players may
 * speak when contact breaks" being labelled easier) out of the artifact.
 */
const HARDER_SIGNALS =
  /(eliminat|competit|ausscheid|wettbewerb|\braus\b|blind|eyes closed|augen zu|back to|abgewandt|no handles|ohne hilfe|keine hilfe|faster|schneller|more players|mehr spieler|additional|zus(ä|ae)tzlich|\bextra\b|restrict|einschr(ä|ae)nk|difficult|schwierig|complex|kompliziert|advanced|fortgeschritten|simultaneous|gleichzeitig|challeng|forder|anspruch|harder|erschwer|time limit|zeitlimit|pressure|\bdruck\b|no preparation|ohne vorbereitung|surprise|(ü|ue)berraschung)/i;

const EASIER_SIGNALS =
  /(simpl|easier|einfach|leicht|fewer|weniger|\bsupport\b|hilfe|unterst(ü|ue)tz|\bfixed\b|festgelegt|predetermined|vorgegeben|\bslow|langsam|beginner|anf(ä|ae)nger|warm.?up|shorter|k(ü|ue)rzer|guided|gef(ü|ue)hrt|with music|mit musik|known|bekannt|familiar|vertraut)/i;

export function hasDirectionSignal(
  variationText: string,
  direction: ChallengeDirection
): boolean {
  if (direction === "harder") return HARDER_SIGNALS.test(variationText);
  if (direction === "easier") return EASIER_SIGNALS.test(variationText);
  return true;
}

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Finds the longest verbatim word run of `evidence` inside `variationText`.
 *
 * Models sometimes paraphrase. Rather than accepting an unverifiable quote (or
 * throwing away a correct classification), we keep only the part that really
 * occurs in the source text. Single words are not evidence.
 */
export function groundEvidence(
  variationText: string,
  evidence: string
): string | undefined {
  const words = normalizeForMatch(evidence).split(" ").filter(Boolean);
  if (words.length < 2) return undefined;

  for (let length = words.length; length >= 2; length--) {
    for (let start = 0; start + length <= words.length; start++) {
      const phrase = words.slice(start, start + length);
      // Between words we allow any non-letter/non-digit run, so punctuation and
      // casing do not matter. The match itself is returned as it appears in the
      // source text, which keeps the evidence readable.
      const pattern = new RegExp(
        phrase.map(escapeRegExp).join("[^\\p{L}\\p{N}]+"),
        "iu"
      );
      const match = variationText.match(pattern);
      if (match) return match[0];
    }
  }

  return undefined;
}

export function coerceDirection(value: unknown): ChallengeDirection {
  return CHALLENGE_DIRECTIONS.includes(value as ChallengeDirection)
    ? (value as ChallengeDirection)
    : "unknown";
}

export function coerceLever(value: unknown): ChallengeLever | null {
  return CHALLENGE_LEVERS.includes(value as ChallengeLever)
    ? (value as ChallengeLever)
    : null;
}

export interface ClassifiableVariation {
  name: string;
  description: string;
  differsBy: string[];
}

export function variationText(variation: ClassifiableVariation): string {
  return [
    variation.name,
    variation.description,
    ...(variation.differsBy ?? []),
  ].join(" ");
}

export interface RawChallengeItem {
  index?: unknown;
  direction?: unknown;
  lever?: unknown;
  evidence?: unknown;
}

/**
 * Turns a model response into annotations aligned with the input variations.
 *
 * A direction other than `unknown` is only accepted together with a verbatim
 * quote from the variation text; everything else is downgraded to `unknown`.
 */
export function toAnnotations(
  variations: ClassifiableVariation[],
  items: RawChallengeItem[]
): ChallengeAnnotation[] {
  const byIndex = new Map<number, RawChallengeItem>();
  for (const item of items) {
    const index = Number(item.index);
    if (Number.isInteger(index) && index >= 0) {
      byIndex.set(index, item);
    }
  }

  return variations.map((variation, index) => {
    const item = byIndex.get(index);
    if (!item) {
      return {
        name: variation.name,
        direction: "unknown" as const,
        lever: null,
        evidence: "",
      };
    }

    const direction = coerceDirection(item.direction);
    if (direction === "unknown") {
      return {
        name: variation.name,
        direction,
        lever: null,
        evidence: "",
      };
    }

    const evidence =
      typeof item.evidence === "string"
        ? groundEvidence(variationText(variation), item.evidence)
        : undefined;

    if (!evidence) {
      return {
        name: variation.name,
        direction: "unknown" as const,
        lever: null,
        evidence: "",
      };
    }

    if (!hasDirectionSignal(variationText(variation), direction)) {
      return {
        name: variation.name,
        direction: "unknown" as const,
        lever: null,
        evidence: "",
      };
    }

    return {
      name: variation.name,
      direction,
      lever: coerceLever(item.lever),
      evidence,
    };
  });
}
