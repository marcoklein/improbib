import { createHash } from "crypto";
import { load } from "cheerio";

export interface Section {
  /** Position in the page, stable for a given HTML input. */
  index: number;
  level: number;
  heading: string;
  /** Section body without the heading itself. */
  html: string;
  text: string;
  charCount: number;
}

function textOf(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Splits an article fragment at its top-level headings.
 *
 * Wiki pages are almost always flat (`p, h2, p, h2, …`), so a single pass over
 * the body children is enough. Pages that only use `h3` fall back to `h3`
 * boundaries. The heading itself is not part of the section body: the child
 * element's `name` carries it.
 */
export function extractSections(html: string): Section[] {
  if (!html.trim()) return [];

  const $ = load(html);
  const bodyChildren = $("body").children();
  const nodes =
    bodyChildren.length > 0 ? bodyChildren.toArray() : $.root().children().toArray();

  const h2Count = nodes.filter(
    (node) => (node as { tagName?: string }).tagName?.toLowerCase() === "h2"
  ).length;
  const boundary = h2Count >= 2 ? "h2" : "h3";

  const sections: Section[] = [];
  let current:
    | { level: number; heading: string; nodes: unknown[] }
    | undefined;

  const flush = () => {
    if (!current) return;
    const wrapper = $("<div>");
    for (const node of current.nodes) {
      wrapper.append($(node as never).clone());
    }
    const sectionHtml = (wrapper.html() ?? "").trim();
    const text = textOf(wrapper.text());
    if (current.heading && text.length > 0) {
      sections.push({
        index: sections.length,
        level: current.level,
        heading: current.heading,
        html: sectionHtml,
        text,
        charCount: sectionHtml.length,
      });
    }
    current = undefined;
  };

  for (const node of nodes) {
    const tag = (node as { tagName?: string }).tagName?.toLowerCase();
    if (tag === boundary) {
      flush();
      current = {
        level: Number(tag.slice(1)),
        heading: textOf($(node as never).text()),
        nodes: [],
      };
    } else if (current) {
      current.nodes.push(node);
    }
  }
  flush();

  return sections;
}

const SLUG_REPLACEMENTS: [RegExp, string][] = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

export function slugify(text: string): string {
  let value = text.toLowerCase();
  for (const [pattern, replacement] of SLUG_REPLACEMENTS) {
    value = value.replace(pattern, replacement);
  }

  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "section";
}

export function splitIdentifier(
  parentIdentifier: string,
  heading: string
): string {
  return createHash("md5")
    .update(
      `split:${parentIdentifier}:${heading.toLowerCase().replace(/\s+/g, " ").trim()}`
    )
    .digest("hex");
}
