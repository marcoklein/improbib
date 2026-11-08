/**
 * Removes tips that only restate a step.
 *
 * The extractor used to turn the trailing sentences of the instructions into
 * "tips" (`Wohngemeinschaft` got two tips that repeated steps 4 and 6 word for
 * word). The prompt now asks for source-grounded advice only, but the model is
 * not reliable enough to leave it at that: a page whose source text is three
 * paragraphs naturally invites duplication. This filter is the deterministic
 * safety net, so the published page never shows the same sentence twice.
 *
 * The measure is deliberately conservative. It drops a tip only when almost
 * all of its content words also appear in a *single* step. A tip that adds one
 * new idea therefore survives even when the rest is familiar. Coverage is
 * compared on five-letter stems (`behauptet`/`Behaupten`, `Status`/`Status`),
 * because German inflection otherwise hides the overlap.
 */

const STOPWORDS = new Set(
  `der die das den dem des ein eine einer eines einem einen und oder aber auch
   nicht nur noch schon sehr mehr wenn dass wie was wer wo ihr euch euer eure
   euren ihrem ihren ihre sein seine seinen sie wir uns unser unsere man sich
   zu zum zur mit von bei für auf aus im in an es ist sind war werden wird hat
   haben hatte kann können muss müssen soll sollen darf dürfen dann damit dabei
   denn doch etwa etwas immer ohne nach vor über unter zwischen beim vom als
   the a an and or but also not only still very more when that what who where
   you your yours they them we us our it is are was were has have had can could
   must should may might to of in on at for with from by as this these those
   another each every just than then there their them about into during
   through without after before between`
    .split(/\s+/)
    .filter(Boolean)
);

const MIN_TOKEN_LENGTH = 4;
const STEM_LENGTH = 5;

/** Content words of a text, folded to a language-agnostic five-letter stem. */
export function contentStems(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (word) => word.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(word)
    )
    .map((word) => word.slice(0, STEM_LENGTH));
}

/**
 * How much of `text` is already contained in the best-matching step.
 * 1 means every content word of the text appears in that one step.
 */
export function stepCoverage(text: string, steps: string[]): number {
  const stems = new Set(contentStems(text));
  if (stems.size === 0) return 0;
  let best = 0;
  for (const step of steps) {
    const stepStems = new Set(contentStems(step));
    let shared = 0;
    for (const stem of stems) if (stepStems.has(stem)) shared++;
    best = Math.max(best, shared / stems.size);
  }
  return best;
}

/**
 * The threshold above which a tip counts as a restatement. Tuned against the
 * published catalog: everything above it repeated a step nearly verbatim,
 * everything below it added at least one idea of its own.
 */
export const TIP_REDUNDANCY_THRESHOLD = 0.85;

export function isRedundantTip(
  tip: string,
  steps: string[],
  threshold: number = TIP_REDUNDANCY_THRESHOLD
): boolean {
  if (steps.length === 0) return false;
  return stepCoverage(tip, steps) >= threshold;
}

/**
 * Filters a tip list against the steps and against the tips already kept, so
 * neither the walkthrough nor the list itself repeats a sentence.
 */
export function dropRedundantTips<T extends { text: string }>(
  steps: string[],
  tips: T[]
): T[] {
  const kept: T[] = [];
  const keptTexts: string[] = [];
  for (const tip of tips) {
    if (isRedundantTip(tip.text, steps)) continue;
    if (isRedundantTip(tip.text, keptTexts)) continue;
    kept.push(tip);
    keptTexts.push(tip.text);
  }
  return kept;
}
