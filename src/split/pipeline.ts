import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { ElementType } from "../scraping/shared/element-type";
import { auditSplits, type AuditFile } from "./audit";
import { buildSplits, type SplitFile } from "./build";
import { normalizeSplitChildren } from "./normalize";
import { extractSections } from "./sections";

const SOURCES = ["improwiki", "learnimprov", "ircwiki"] as const;
const MIN_PAGE_TEXT = 300;

async function loadRaw(source: string): Promise<ElementType[]> {
  const file = Bun.file(
    path.join(process.cwd(), "output", "raw", `${source}.json`)
  );
  if (!(await file.exists())) return [];
  const data = await file.json();
  return data.elements ?? [];
}

async function loadJson<T>(filePath: string): Promise<T | undefined> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return undefined;
  try {
    return (await file.json()) as T;
  } catch {
    return undefined;
  }
}

export interface SplitPipelineOptions {
  stage?: "audit" | "build" | "normalize" | "all";
  sources?: readonly string[];
  maxPages?: number;
  force?: boolean;
}

export async function runSplitPipeline(options: SplitPipelineOptions = {}) {
  const stage = options.stage ?? "all";
  const sources = options.sources ?? SOURCES;

  const elementsBySource = new Map<string, ElementType[]>();
  const parents = new Map<string, ElementType>();

  for (const source of sources) {
    const elements = await loadRaw(source);
    elementsBySource.set(source, elements);
    for (const element of elements) {
      parents.set(element.identifier, element);
    }
  }

  let audit: AuditFile | undefined;
  if (stage === "audit" || stage === "all") {
    const candidates = [...elementsBySource.values()]
      .flat()
      .map((element) => ({ element, sections: extractSections(element.htmlContent ?? "") }))
      .filter(
        (candidate) =>
          candidate.sections.length >= 2 &&
          candidate.sections.reduce((sum, section) => sum + section.text.length, 0) >=
            MIN_PAGE_TEXT
      );

    console.log(`[split] audit candidates: ${candidates.length}`);
    const result = await auditSplits(candidates, {
      maxPages: options.maxPages,
      force: options.force,
    });
    audit = result.file;
    console.log(
      `[split] audit done: ${result.stats.audited} pages, ${result.stats.collections} collections, ${result.stats.children} child candidates, ${result.stats.errors} errors`
    );
  } else {
    audit = await loadJson<AuditFile>(
      path.join(process.cwd(), "output", "splits", "audit.json")
    );
    if (!audit) throw new Error("No audit found. Run with --stage=audit first.");
  }

  let files = new Map<string, SplitFile>();
  if (stage === "build" || stage === "all") {
    const result = await buildSplits(elementsBySource, audit);
    files = result.files;
    console.log(
      `[split] built ${result.stats.collections} collections with ${result.stats.children} children`
    );
  } else if (stage === "normalize") {
    for (const source of sources) {
      const file = await loadJson<SplitFile>(
        path.join(process.cwd(), "output", "splits", `${source}.json`)
      );
      if (file) files.set(source, file);
    }
    if (files.size === 0) {
      throw new Error("No split files found. Run with --stage=build first.");
    }
  }

  if (stage === "normalize" || stage === "all") {
    const stats = await normalizeSplitChildren({
      splits: files,
      parents,
      force: options.force,
    });
    console.log(
      `[split] normalized ${stats.normalized}/${stats.children} children (${stats.cached} cached, ${stats.errors} errors)`
    );
  }
}

if (import.meta.main) {
  const storagePath = process.env.STORAGE_PATH || process.cwd();
  await mkdir(storagePath, { recursive: true });
  process.chdir(storagePath);

  const args = process.argv.slice(2);
  const value = (name: string) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];

  await runSplitPipeline({
    stage: value("stage") as SplitPipelineOptions["stage"],
    sources: value("source") ? [value("source") as string] : undefined,
    maxPages: value("max") ? Number(value("max")) : undefined,
    force: args.includes("--force"),
  });
}
