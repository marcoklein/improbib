import { createHash } from "crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { callApi, getApiKey } from "../normalize/llm-client";
import type { ElementType } from "../scraping/shared/element-type";
import type { Section } from "./sections";

const DEFAULT_MODEL = "glm-5.3-flash";
const CONCURRENCY = 6;

export const AUDIT_PROMPT = `You decide whether a wiki page is one exercise or a collection of several independent exercises.

The page comes from an improvisation theatre library. A reader wants one element per game or exercise, so a page like "Tag Games" with 13 separate games should become 13 elements, while "Freeze Tag" with sections like Setup, How to Play, Tips and Variants should stay one element.

Return ONLY JSON:
{"kind":"single"|"collection","children":[section indices],"reason":"short explanation"}

Rules:
- "collection": the page is an overview or list of several DISTINCT games or exercises. This is usually signalled by a plural/collective title ("Tag Games", "Fangenspiele", "Leading Exercises", "Blind Lead") and several different game names as sections. Select those sections.
- "single": one game, exercise or show format. This includes a single game with several versions, levels or numbered variants ("Version 1/2", "Duet 1–5", "König 1/2", "Namenskreis 1/2", "Variante A/B"), and structural sections (Goal, Setup, How to Play, Tips, Variants, Examples, Acts, Part 1/2/3, Notes).
- If the page title is singular and the sections are versions or numbered variants of that title, return "single".
- Never select navigation or overview headings such as Contents, See also, References, Books, External links.
- Never select a heading that only groups other sections or lists ("Warmups and games", "Song forms", "Experiences", "List of …").
- Never select a heading that names a category or style rather than a playable game ("Abstract", "Presentational", "Scenic", "Video").
- A page about a concept or technique is "single", even when it has several headings.
- If in doubt, return "single".`;

export function getAuditPromptHash(): string {
  return createHash("md5").update(AUDIT_PROMPT).digest("hex");
}

export interface AuditPage {
  inputHash: string;
  kind: "single" | "collection";
  children: number[];
  reason: string;
}

export interface AuditFile {
  meta: {
    model: string;
    promptHash: string;
    generatedAt: string;
  };
  pages: Record<string, AuditPage>;
}

export interface AuditCandidate {
  element: ElementType;
  sections: Section[];
}

export interface AuditOptions {
  model?: string;
  force?: boolean;
  maxPages?: number;
}

function hashInput(element: ElementType, sections: Section[]): string {
  return createHash("md5")
    .update(
      JSON.stringify({
        name: element.name,
        languageCode: element.languageCode,
        sections: sections.map((section) => ({
          level: section.level,
          heading: section.heading,
          excerpt: section.text.slice(0, 400),
        })),
      })
    )
    .digest("hex");
}

function buildUserPrompt(element: ElementType, sections: Section[]): string {
  return JSON.stringify({
    title: element.name,
    language: element.languageCode,
    sections: sections.map((section) => ({
      index: section.index,
      level: section.level,
      heading: section.heading,
      excerpt: section.text.slice(0, 400),
    })),
  });
}

export function parseAudit(
  raw: string,
  sections: Section[],
  inputHash: string
): AuditPage {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as {
    kind?: unknown;
    children?: unknown;
    reason?: unknown;
  };

  const validIndices = new Set(sections.map((section) => section.index));
  const children = Array.isArray(parsed.children)
    ? [...new Set(parsed.children.map(Number))].filter((index) =>
        validIndices.has(index)
      )
    : [];

  const kind =
    parsed.kind === "collection" && children.length >= 2
      ? "collection"
      : "single";

  return {
    inputHash,
    kind,
    children: kind === "collection" ? children.sort((a, b) => a - b) : [],
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "",
  };
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return undefined;
  try {
    return (await file.json()) as T;
  } catch {
    return undefined;
  }
}

export interface AuditStats {
  candidates: number;
  audited: number;
  cached: number;
  errors: number;
  collections: number;
  children: number;
}

/**
 * Asks the model which pages describe several independent games and caches the
 * answer in `output/splits/audit.json`.
 */
export async function auditSplits(
  candidates: AuditCandidate[],
  options: AuditOptions = {}
): Promise<{ file: AuditFile; stats: AuditStats }> {
  const model = options.model ?? process.env.SPLIT_MODEL ?? DEFAULT_MODEL;
  const promptHash = getAuditPromptHash();
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("No LLM API key: set OPENCODE_GO_API_KEY or OPENCODE_API_KEY");
  }

  const auditPath = path.join(process.cwd(), "output", "splits", "audit.json");
  await mkdir(path.dirname(auditPath), { recursive: true });

  const existing = await readJson<AuditFile>(auditPath);
  const sameEnvironment =
    existing?.meta?.promptHash === promptHash && existing.meta.model === model;
  // A changed prompt invalidates every cached decision; keeping the old pages
  // would silently mix two rule sets.
  const file: AuditFile = sameEnvironment
    ? (existing as AuditFile)
    : {
        meta: { model, promptHash, generatedAt: new Date().toISOString() },
        pages: {},
      };

  const stats: AuditStats = {
    candidates: candidates.length,
    audited: 0,
    cached: 0,
    errors: 0,
    collections: 0,
    children: 0,
  };

  const limited = options.maxPages
    ? candidates.slice(0, options.maxPages)
    : candidates;

  let index = 0;
  let writeLock = false;
  let processed = 0;

  async function write() {
    if (writeLock) return;
    writeLock = true;
    try {
      file.meta.generatedAt = new Date().toISOString();
      await Bun.write(auditPath, JSON.stringify(file, null, 2));
    } finally {
      writeLock = false;
    }
  }

  async function worker(): Promise<void> {
    while (index < limited.length) {
      const { element, sections } = limited[index++];
      const inputHash = hashInput(element, sections);
      const previous = file.pages[element.identifier];

      if (
        !options.force &&
        previous?.inputHash === inputHash &&
        file.meta.promptHash === promptHash
      ) {
        stats.cached++;
        stats.audited++;
        countPage(stats, previous);
        processed++;
        continue;
      }

      try {
        const raw = await callApi(
          apiKey,
          [model],
          AUDIT_PROMPT,
          buildUserPrompt(element, sections),
          3000,
          2,
          true,
          true
        );
        const page = parseAudit(raw, sections, inputHash);
        file.pages[element.identifier] = page;
        stats.audited++;
        countPage(stats, page);
      } catch (error) {
        stats.errors++;
        console.warn(
          `[split] audit ${element.sourceName}/${element.name}: ${(error as Error).message.slice(0, 160)}`
        );
      }

      processed++;
      if (processed % 25 === 0) {
        await write();
        console.log(
          `[split] audit ${processed}/${limited.length} (${stats.collections} collections, ${stats.errors} errors)`
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, limited.length) }, () => worker())
  );
  await write();

  return { file, stats };
}

function countPage(stats: AuditStats, page: AuditPage): void {
  if (page.kind === "collection") {
    stats.collections++;
    stats.children += page.children.length;
  }
}
