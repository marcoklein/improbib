/**
 * The artifact ships the original page text as markdown so a reader can always
 * fall back to the source. Very long pages used to be cut at exactly 10,000
 * characters, which split words and links mid-sentence ("...create som").
 *
 * The limit is therefore higher and the cut happens on a word boundary, with an
 * ellipsis that makes the truncation visible. `improbib-schema.ts` enforces the
 * same number, so an over-long element can never fail validation.
 */
export const MARKDOWN_MAX_CHARS = 20_000;

const TRUNCATION_MARKER = "\n\n…";

/**
 * Returns `markdown` unchanged while it fits. Otherwise cuts on the last word
 * boundary inside the budget and appends an ellipsis.
 *
 * The result never exceeds `MARKDOWN_MAX_CHARS`.
 */
export function truncateMarkdown(markdown: string): string {
  if (markdown.length <= MARKDOWN_MAX_CHARS) return markdown;

  const budget = MARKDOWN_MAX_CHARS - TRUNCATION_MARKER.length;
  const slice = markdown.slice(0, budget);
  const lastSpace = slice.lastIndexOf(" ");
  // A single token longer than the whole budget would otherwise be cut in the
  // middle; accept that rather than returning an almost empty body.
  const kept = lastSpace > budget * 0.8 ? slice.slice(0, lastSpace) : slice;

  return `${kept.trimEnd()}${TRUNCATION_MARKER}`;
}
