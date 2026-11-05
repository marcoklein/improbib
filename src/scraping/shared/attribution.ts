import { load } from "cheerio";

/**
 * Attribution information a source page carries about itself.
 *
 * The sources rarely name natural persons: improwiki and learnimprov attribute
 * a site account, ircwiki attributes nobody on the page. The legally relevant
 * attribution is therefore the source URL plus the license; these fields are
 * the extra information where the page provides it.
 */
export interface SourceAttribution {
  authors: string[];
  lastEditedBy?: string;
  /** ISO 8601 date (YYYY-MM-DD or full timestamp), when the page shows one. */
  lastModified?: string;
}

const NO_ATTRIBUTION: SourceAttribution = { authors: [] };

function isoDay(day: string, month: string, year: string): string | undefined {
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString().slice(0, 10);
}

/**
 * improwiki renders its edit footer as
 * `Last edited by improwiki, 11.05.2026 19:48` (or the German equivalent).
 */
export function extractImprowikiAttribution(html: string): SourceAttribution {
  const match = html.match(
    /(?:Zuletzt bearbeitet von|Last edited by)\s+([^,<\n]{1,80}),\s*(\d{2})\.(\d{2})\.(\d{4})/
  );
  if (!match) {
    return NO_ATTRIBUTION;
  }

  const [, editor, day, month, year] = match;
  return {
    authors: [],
    lastEditedBy: editor.trim(),
    lastModified: isoDay(day, month, year),
  };
}

/**
 * learnimprov renders a WordPress byline: `By learnimprov | January 30, 2019`.
 */
export function extractLearnImprovAttribution(html: string): SourceAttribution {
  const $ = load(html);
  const authors = $(".vcard.author .fn")
    .map((_, el) => $(el).text().trim())
    .toArray()
    .filter(Boolean);

  const dateText = $(".date.updated").first().text().trim();
  const date = dateText ? new Date(dateText) : undefined;

  return {
    authors: [...new Set(authors)],
    lastModified:
      date && !Number.isNaN(date.getTime())
        ? date.toISOString().slice(0, 10)
        : undefined,
  };
}

/**
 * ircwiki (MediaWiki) shows `This page was last edited on 1 January 2020,
 * at 12:00` in the footer and attributes no author on the article page.
 */
export function extractIrcWikiAttribution(html: string): SourceAttribution {
  const $ = load(html);
  const text = $("#footer li#lastmod").text().trim();
  const match = text.match(
    /on (\d{1,2})\s+(\w+)\s+(\d{4}),\s+at\s+(\d{2}):(\d{2})/
  );
  if (!match) {
    return NO_ATTRIBUTION;
  }

  const [, day, month, year, hour, minute] = match;
  const date = new Date(`${month} ${day}, ${year} ${hour}:${minute}:00 UTC`);
  return {
    authors: [],
    lastModified: Number.isNaN(date.getTime())
      ? undefined
      : date.toISOString(),
  };
}

export function extractAttribution(
  sourceName: string,
  html: string
): SourceAttribution {
  switch (sourceName) {
    case "improwiki":
      return extractImprowikiAttribution(html);
    case "learnimprov":
      return extractLearnImprovAttribution(html);
    case "ircwiki":
      return extractIrcWikiAttribution(html);
    default:
      return NO_ATTRIBUTION;
  }
}
