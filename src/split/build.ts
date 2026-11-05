import { mkdir } from "node:fs/promises";
import path from "node:path";
import TurndownService from "turndown";
import type { ElementType } from "../scraping/shared/element-type";
import type { AuditFile, AuditPage } from "./audit";
import { extractSections, slugify, splitIdentifier } from "./sections";

const MIN_SECTION_CHARS = 150;
const MIN_MARKDOWN_CHARS = 100;

/**
 * Headings that are navigation, categories or structural sections rather than
 * playable games. The audit prompt already says not to pick them; this is the
 * deterministic guard for the cases where the model still does.
 */
const NON_GAME_HEADING =
  /^(contents|see also|references|external links|books|experiences|list of|warmups and games|song forms|abstract|presentational|scenic|video|format|cast|crew|trivia|purpose|instructions|how it works|example|examples|notes|tips|variants|varianten)\b/i;

function normalizeHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Duet 1" under "Duet", "Version 2" under "Madrigal", "König 2" under "König".
 * These are variants of one game, not independent games.
 */
export function isVersionHeading(heading: string, parentName: string): boolean {
  const child = normalizeHeading(heading);
  const parent = normalizeHeading(parentName);

  if (!child) return false;
  if (/^(version|variante|variation|teil|part|nr|no)\b/.test(child)) return true;
  if (parent && child.startsWith(parent)) {
    const remainder = child.slice(parent.length).trim();
    if (/^\d+$/.test(remainder)) return true;
    if (/^(i|ii|iii|iv|v|a|b|c)$/.test(remainder)) return true;
  }
  return false;
}

export interface SplitChild {
  identifier: string;
  parentIdentifier: string;
  name: string;
  url: string;
  htmlContent: string;
  markdown: string;
  order: number;
}

export interface SplitPage {
  parentIdentifier: string;
  parentName: string;
  sourceName: string;
  languageCode: "de" | "en";
  children: SplitChild[];
}

export interface SplitFile {
  meta: {
    generatedAt: string;
    collectionCount: number;
    childCount: number;
  };
  pages: SplitPage[];
}

const SOURCES = ["improwiki", "learnimprov", "ircwiki"] as const;

function toMarkdown(html: string): string {
  const turndown = new TurndownService({ headingStyle: "atx" });
  return turndown.turndown(html).trim();
}

function baseUrl(url: string): string {
  return url.split("#")[0] ?? url;
}

/**
 * Turns one audited page into a split page.
 *
 * Pure: no file access, so the rules (thresholds, slug de-duplication,
 * inheritance) can be tested directly.
 */
export function materializeSplitPage(
  element: ElementType,
  auditPage: AuditPage
): SplitPage | undefined {
  if (auditPage.kind !== "collection" || !element.htmlContent) {
    return undefined;
  }

  const sections = extractSections(element.htmlContent);
  const byIndex = new Map(sections.map((section) => [section.index, section]));
  const usedNames = new Set<string>();
  const usedSlugs = new Map<string, number>();
  const children: SplitChild[] = [];

  for (const index of auditPage.children) {
    const section = byIndex.get(index);
    if (!section) continue;
    if (section.charCount < MIN_SECTION_CHARS) continue;

    const name = section.heading
      .trim()
      .replace(/[\s:–—-]+$/g, "")
      .trim();
    if (!name) continue;
    if (NON_GAME_HEADING.test(name)) continue;
    if (isVersionHeading(name, element.name)) continue;
    const dedupeKey = name.toLowerCase();
    if (usedNames.has(dedupeKey)) continue;
    usedNames.add(dedupeKey);

    const markdown = toMarkdown(section.html);
    if (markdown.length < MIN_MARKDOWN_CHARS) continue;

    const slugBase = slugify(name);
    const seen = usedSlugs.get(slugBase) ?? 0;
    usedSlugs.set(slugBase, seen + 1);
    const slug = seen === 0 ? slugBase : `${slugBase}-${seen + 1}`;

    children.push({
      identifier: splitIdentifier(element.identifier, name),
      parentIdentifier: element.identifier,
      name,
      url: `${baseUrl(element.url)}#${slug}`,
      htmlContent: section.html,
      markdown,
      order: index,
    });
  }

  if (children.length < 2) return undefined;

  return {
    parentIdentifier: element.identifier,
    parentName: element.name,
    sourceName: element.sourceName,
    languageCode: element.languageCode as "de" | "en",
    children,
  };
}

/**
 * Materialises the audited collections into child elements.
 *
 * The raw layer is not modified: children live in `output/splits/{source}.json`
 * and are merged into the artifact by `assemble`.
 */
export async function buildSplits(
  elementsBySource: Map<string, ElementType[]>,
  audit: AuditFile
): Promise<{ files: Map<string, SplitFile>; stats: { collections: number; children: number } }> {
  const files = new Map<string, SplitFile>();
  const stats = { collections: 0, children: 0 };

  for (const source of SOURCES) {
    const elements = elementsBySource.get(source) ?? [];
    const pages: SplitPage[] = [];

    for (const element of elements) {
      const auditPage = audit.pages[element.identifier];
      if (!auditPage) continue;

      const page = materializeSplitPage(element, auditPage);
      if (!page) continue;

      pages.push(page);
      stats.collections++;
      stats.children += page.children.length;
    }

    const file: SplitFile = {
      meta: {
        generatedAt: new Date().toISOString(),
        collectionCount: pages.length,
        childCount: pages.reduce((sum, page) => sum + page.children.length, 0),
      },
      pages,
    };
    files.set(source, file);

    const outPath = path.join(process.cwd(), "output", "splits", `${source}.json`);
    await mkdir(path.dirname(outPath), { recursive: true });
    await Bun.write(outPath, JSON.stringify(file, null, 2));
  }

  return { files, stats };
}
