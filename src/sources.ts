/**
 * The sources improbib publishes.
 *
 * ircwiki is deliberately excluded. Three reasons, all verified in November
 * 2026:
 *
 * 1. License: it is GFDL 1.2, which forbids the kind of adaptation the
 *    normalization layer performs. improwiki (CC BY-SA 3.0 DE) and learnimprov
 *    (CC BY-SA 4.0) explicitly allow it.
 * 2. Language: GFDL content must not be machine-translated, but the extraction
 *    prompt has to summarize in the source language and occasionally drifted
 *    into German for English ircwiki pages.
 * 3. Cache: every ircwiki page embeds MediaWiki's `NewPP limit report`
 *    comment, which contains a per-request CPU time. That made the content hash
 *    change on every scrape, so the extraction cache never hit and each run
 *    paid for 143 fresh LLM calls with a different result each time.
 *
 * The scraper module is kept so the decision can be revisited without
 * restoring code. It is simply not part of the published pipeline.
 */
export const ACTIVE_SOURCES = ["improwiki", "learnimprov"] as const;

export type ActiveSource = (typeof ACTIVE_SOURCES)[number];

/**
 * Sources that still have data in `output/raw` and `output/normalized` but are
 * not published. Used where a stale file should be reported, not silently
 * ignored.
 */
export const ARCHIVED_SOURCES = ["ircwiki"] as const;

export function isActiveSource(sourceName: string): boolean {
  return (ACTIVE_SOURCES as readonly string[]).includes(sourceName);
}