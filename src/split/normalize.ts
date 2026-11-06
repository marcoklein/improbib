import { createHash } from "crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  createOpencodeGoClient,
  getApiKey,
  getPromptHash,
} from "../normalize/llm-client";
import {
  getNormalizedBy,
  type NormalizedElement,
} from "../normalize/normalized-schema";
import type { ElementType } from "../scraping/shared/element-type";
import type { SplitFile } from "./build";

const DEFAULT_MODEL = "glm-5.3-flash";
const CONCURRENCY = 6;

interface SplitNormalizedFile {
  meta: {
    sourceName: string;
    model: string;
    promptHash: string;
    schemaHash: string;
    generatedAt: string;
  };
  elements: NormalizedElement[];
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

function contentHash(html: string): string {
  return createHash("md5").update(html).digest("hex");
}

export interface NormalizeSplitStats {
  children: number;
  normalized: number;
  cached: number;
  errors: number;
}

/**
 * Runs the normal extraction prompt on every split child.
 *
 * Children whose extraction fails still keep their markdown and are published;
 * they simply lack a summary/work entry.
 */
export async function normalizeSplitChildren(params: {
  splits: Map<string, SplitFile>;
  parents: Map<string, ElementType>;
  model?: string;
  force?: boolean;
}): Promise<NormalizeSplitStats> {
  const model = params.model ?? process.env.SPLIT_MODEL ?? DEFAULT_MODEL;
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("No LLM API key: set OPENCODE_GO_API_KEY or OPENCODE_API_KEY");
  }

  const client = createOpencodeGoClient([model]);
  const promptHash = getPromptHash();
  const schemaHash = getNormalizedBy();
  const stats: NormalizeSplitStats = {
    children: 0,
    normalized: 0,
    cached: 0,
    errors: 0,
  };

  const outDir = path.join(process.cwd(), "output", "normalized-splits");
  await mkdir(outDir, { recursive: true });

  for (const [source, splitFile] of params.splits) {
    const outPath = path.join(outDir, `${source}.json`);
    const existing = await readJson<SplitNormalizedFile>(outPath);
    const sameEnvironment =
      existing?.meta?.model === model &&
      existing.meta.promptHash === promptHash &&
      existing.meta.schemaHash === schemaHash;

    const previous = new Map(
      (existing?.elements ?? []).map((element) => [element.identifier, element])
    );
    const elements = new Map(previous);

    const children = splitFile.pages.flatMap((page) =>
      page.children.map((child) => ({
        child,
        parent: params.parents.get(child.parentIdentifier),
      }))
    );
    stats.children += children.length;

    console.log(
      `[split] normalize ${source}: ${children.length} children (model ${model})`
    );

    let index = 0;
    let processed = 0;
    let writeLock = false;

    async function write() {
      if (writeLock) return;
      writeLock = true;
      try {
        const file: SplitNormalizedFile = {
          meta: {
            sourceName: source,
            model,
            promptHash,
            schemaHash,
            generatedAt: new Date().toISOString(),
          },
          elements: [...elements.values()],
        };
        await Bun.write(outPath, JSON.stringify(file, null, 2));
      } finally {
        writeLock = false;
      }
    }

    async function worker(): Promise<void> {
      while (index < children.length) {
        const { child, parent } = children[index++];
        const hash = contentHash(child.htmlContent);
        const cached = previous.get(child.identifier);

        if (
          !params.force &&
          sameEnvironment &&
          cached?.normalized?.contentHash === hash &&
          // An extraction that came back empty is a failure, not a result.
          // Without this check it would be cached forever.
          cached.normalized.summary.trim() !== "" &&
          cached.normalized.description.trim() !== ""
        ) {
          elements.set(child.identifier, cached);
          stats.cached++;
          stats.normalized++;
          processed++;
          continue;
        }

        try {
          const result = await client.normalizeElement(
            child.name,
            child.htmlContent,
            parent?.languageCode ?? splitFile.pages[0]?.languageCode ?? "en",
            parent?.tags ?? []
          );

          const normalized = Array.isArray(result) ? result[0] : result;
          if (!normalized) throw new Error("empty normalization");

          elements.set(child.identifier, {
            ...normalized,
            identifier: child.identifier,
            name: child.name,
            url: child.url,
            sourceName: parent?.sourceName ?? source,
            languageCode:
              (parent?.languageCode as "de" | "en") ??
              splitFile.pages[0]?.languageCode ??
              "en",
            tags: parent?.tags ?? [],
            htmlContent: child.htmlContent,
            splitFrom: child.parentIdentifier,
            playerCountMin: undefined,
            playerCountMax: undefined,
            lastModified: parent?.lastModified,
            normalized: {
              ...normalized.normalized,
              contentHash: hash,
              extractedAt: new Date().toISOString(),
              normalizedBy: schemaHash,
              // Provenance: the split pipeline uses its own model, which is
              // not the same one as the regular extraction.
              model: normalized.normalized.model ?? model,
              promptHash: normalized.normalized.promptHash ?? promptHash,
            },
            derivedElements: [],
            relatedIdentifiers: [],
          });
          stats.normalized++;
        } catch (error) {
          stats.errors++;
          console.warn(
            `[split] normalize ${source}/${child.name}: ${(error as Error).message.slice(0, 160)}`
          );
          if (cached) elements.set(child.identifier, cached);
        }

        processed++;
        if (processed % 25 === 0) {
          await write();
          console.log(
            `[split] normalize ${source}: ${processed}/${children.length} (${stats.errors} errors)`
          );
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, children.length) }, () =>
        worker()
      )
    );
    await write();
  }

  return stats;
}
