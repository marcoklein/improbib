import type {
  ChallengeAnnotation,
  ChallengeDirection,
  ChallengeLever,
} from "./challenge-schema";

export interface WorkAdjustment {
  /** The variation description, i.e. what the player actually does differently. */
  text: string;
  variationName: string;
  lever: ChallengeLever | null;
}

export interface WorkAdjustments {
  easier: WorkAdjustment[];
  harder: WorkAdjustment[];
}

const MAX_PER_DIRECTION = 6;

/**
 * Collects the documented variations that explicitly make the exercise easier
 * or harder.
 *
 * This is intentionally not generative: a work without such variations gets an
 * empty list. Silence is better than a hallucinated difficulty hint.
 */
export function buildAdjustments(
  variations: {
    name: string;
    description: string;
    kind: "inline" | "standalone";
    direction?: ChallengeDirection;
    lever?: ChallengeLever | null;
  }[]
): WorkAdjustments {
  const collect = (direction: "easier" | "harder"): WorkAdjustment[] => {
    const seen = new Set<string>();
    const result: WorkAdjustment[] = [];

    for (const variation of variations) {
      if (variation.kind !== "inline") continue;
      if (variation.direction !== direction) continue;

      const text = (variation.description || variation.name).trim();
      if (!text) continue;

      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      result.push({
        text,
        variationName: variation.name,
        lever: variation.lever ?? null,
      });
    }

    return result
      .sort((a, b) => a.variationName.localeCompare(b.variationName))
      .slice(0, MAX_PER_DIRECTION);
  };

  return { easier: collect("easier"), harder: collect("harder") };
}

/**
 * Merges the annotations of duplicate variations from different sources.
 *
 * `easier` and `harder` contradicting each other result in `unknown`; unknown
 * votes never override a documented direction.
 */
export function mergeAnnotations(
  annotations: ChallengeAnnotation[]
): Pick<ChallengeAnnotation, "direction" | "lever" | "evidence"> | undefined {
  if (annotations.length === 0) return undefined;

  const examples = annotations.filter(
    (annotation) => annotation.direction !== "unknown"
  );
  if (examples.length === 0) {
    return { direction: "unknown", lever: null, evidence: "" };
  }

  const hasEasier = examples.some((item) => item.direction === "easier");
  const hasHarder = examples.some((item) => item.direction === "harder");
  if (hasEasier && hasHarder) {
    return { direction: "unknown", lever: null, evidence: "" };
  }

  const direction: ChallengeDirection = hasEasier
    ? "easier"
    : hasHarder
      ? "harder"
      : "lateral";

  const matching = examples.filter((item) => item.direction === direction);
  const leverCounts = new Map<ChallengeLever, number>();
  for (const annotation of matching) {
    if (!annotation.lever) continue;
    leverCounts.set(annotation.lever, (leverCounts.get(annotation.lever) ?? 0) + 1);
  }
  const lever =
    [...leverCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    direction,
    lever,
    evidence: matching.find((item) => item.evidence)?.evidence ?? "",
  };
}
