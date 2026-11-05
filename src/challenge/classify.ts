import { createHash } from "crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { NormalizedElement } from "../normalize/normalized-schema";
import { callApi, getApiKey } from "../normalize/llm-client";
import {
  challengeFileSchema,
  normalizeForMatch,
  toAnnotations,
  type ChallengeAnnotation,
  type ChallengeFile,
  type ClassifiableVariation,
  type RawChallengeItem,
} from "./challenge-schema";

const SOURCES = ["improwiki", "learnimprov", "ircwiki"] as const;
const DEFAULT_MODEL = "glm-5.3-flash";
const CONCURRENCY = 6;
const MAX_VARIATIONS_PER_CALL = 20;

const SYSTEM_PROMPT = `You analyse variations of improvisation theatre exercises.

For every variation decide, relative to the base exercise:
- direction: "easier", "harder", "lateral" or "unknown"
  - harder: the variation increases the challenge for the players (less information, more players, no support, elimination/competition, speed, additional constraints).
  - easier: it reduces the challenge (fixed input, more support, fewer players, slower pace, fewer constraints).
  - lateral: it changes theme, setting, story or medium without clearly changing difficulty.
  - unknown: the text does not contain enough information. Do NOT guess.
- lever: the one thing being turned: "players", "information", "rules", "context", "medium", "audience" or null.
- evidence: a verbatim quote (max 12 words) from the variation description or differsBy that justifies direction and lever. Empty string when direction is unknown.

Rules:
- Base your decision only on the provided text, never on outside knowledge of the game.
- "competitive", "elimination", "blind", "eyes closed", "no handles", "faster" are harder.
- "simpler", "easier", "fixed", "predetermined", "fewer players", "with support" are easier.
- A different theme or setting alone is lateral.
- Return ONLY JSON: {"variations":[{"index":number,"direction":string,"lever":string|null,"evidence":string}]}`;

/**
 * Bump when the post-processing rules change (evidence grounding, signal gate).
 * The prompt hash alone would not invalidate the cache in that case.
 */
const CLASSIFIER_VERSION = "3";

export function getChallengePromptHash(): string {
  return createHash("md5")
    .update(`${SYSTEM_PROMPT}:${CLASSIFIER_VERSION}`)
    .digest("hex");
}

function buildUserPrompt(
  element: NormalizedElement,
  variations: ClassifiableVariation[]
): string {
  return JSON.stringify({
    base: {
      name: element.name,
      language: element.languageCode,
      description: (element.normalized.description ?? "").slice(0, 700),
    },
    variations: variations.map((variation, index) => ({
      index,
      name: variation.name,
      description: variation.description,
      differsBy: variation.differsBy,
    })),
  });
}

function hashInput(
  element: NormalizedElement,
  variations: ClassifiableVariation[]
): string {
  return createHash("md5")
    .update(
      JSON.stringify({
        name: element.name,
        languageCode: element.languageCode,
        description: element.normalized.description ?? "",
        variations,
      })
    )
    .digest("hex");
}

function parseResponse(
  text: string,
  variations: ClassifiableVariation[]
): ChallengeAnnotation[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as { variations?: RawChallengeItem[] };
  if (!Array.isArray(parsed.variations)) {
    throw new Error("Response has no variations array");
  }
  return toAnnotations(variations, parsed.variations);
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

function emptyCache(): ChallengeFile {
  return {
    meta: { model: "", promptHash: "", generatedAt: "" },
    elements: {},
  };
}

export interface ChallengeStats {
  elements: number;
  classified: number;
  cached: number;
  errors: number;
  variations: number;
  easier: number;
  harder: number;
  lateral: number;
  unknown: number;
}

export interface ChallengeOptions {
  sources?: readonly string[];
  maxElements?: number;
  force?: boolean;
  model?: string;
}

/**
 * Classifies every published variation as easier / harder / lateral / unknown
 * and stores the result in `output/challenge/{source}.json`.
 *
 * The cache is keyed by element identifier and invalidated by (a) a change in
 * the variation text and (b) a change in model or prompt. The stage never
 * touches `output/normalized/*.json`, so it cannot invalidate the expensive
 * extraction cache.
 */
export async function classifyChallenges(
  options: ChallengeOptions = {}
): Promise<ChallengeStats> {
  const model = options.model ?? process.env.CHALLENGE_MODEL ?? DEFAULT_MODEL;
  const promptHash = getChallengePromptHash();
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "No LLM API key: set OPENCODE_GO_API_KEY or OPENCODE_API_KEY"
    );
  }

  // Fail fast when the credential or model is broken instead of logging 523
  // identical errors and writing an empty cache.
  try {
    await callApi(
      apiKey,
      [model],
      "Return only JSON.",
      JSON.stringify({ ok: true }),
      300,
      0,
      true,
      true
    );
  } catch (error) {
    throw new Error(
      `LLM probe failed (model ${model}): ${(error as Error).message}`
    );
  }

  const stats: ChallengeStats = {
    elements: 0,
    classified: 0,
    cached: 0,
    errors: 0,
    variations: 0,
    easier: 0,
    harder: 0,
    lateral: 0,
    unknown: 0,
  };

  const outDir = path.join(process.cwd(), "output", "challenge");
  await mkdir(outDir, { recursive: true });

  for (const source of options.sources ?? SOURCES) {
    const normalizedPath = path.join(
      process.cwd(),
      "output",
      "normalized",
      `${source}.json`
    );
    const normalized = await readJson<{ elements: NormalizedElement[] }>(
      normalizedPath
    );
    if (!normalized) {
      console.log(`[challenge] ${source}: no normalized output, skipping`);
      continue;
    }

    const cachePath = path.join(outDir, `${source}.json`);
    const cache = challengeFileSchema.safeParse(await readJson(cachePath));
    const file: ChallengeFile = cache.success ? cache.data : emptyCache();

    const sameEnvironment =
      file.meta.model === model && file.meta.promptHash === promptHash;

    const candidates = normalized.elements.filter(
      (element) => (element.normalized.variations ?? []).length > 0
    );

    const limited = options.maxElements
      ? candidates.slice(0, options.maxElements)
      : candidates;

    console.log(
      `[challenge] ${source}: ${limited.length} elements with variations (model ${model})`
    );

    let index = 0;
    let processed = 0;
    let writeLock = false;

    async function write() {
      if (writeLock) return;
      writeLock = true;
      try {
        file.meta = {
          model,
          promptHash,
          generatedAt: new Date().toISOString(),
        };
        await Bun.write(cachePath, JSON.stringify(file, null, 2));
      } finally {
        writeLock = false;
      }
    }

    async function worker(): Promise<void> {
      while (index < limited.length) {
        const element = limited[index++];
        stats.elements++;
        const variations = element.normalized
          .variations as ClassifiableVariation[];
        const inputHash = hashInput(element, variations);
        const previous = file.elements[element.identifier];

        if (
          !options.force &&
          sameEnvironment &&
          previous?.inputHash === inputHash
        ) {
          stats.cached++;
          stats.classified++;
          collectStats(stats, previous.variations);
          processed++;
          continue;
        }

        try {
          const annotations: ChallengeAnnotation[] = [];
          for (
            let offset = 0;
            offset < variations.length;
            offset += MAX_VARIATIONS_PER_CALL
          ) {
            const batch = variations.slice(
              offset,
              offset + MAX_VARIATIONS_PER_CALL
            );
            const raw = await callApi(
              apiKey,
              [model],
              SYSTEM_PROMPT,
              buildUserPrompt(element, batch),
              8000,
              2,
              true,
              true
            );
            const batchAnnotations = parseResponse(raw, batch);
            annotations.push(...batchAnnotations);
          }

          file.elements[element.identifier] = { inputHash, variations: annotations };
          stats.classified++;
          collectStats(stats, annotations);
        } catch (error) {
          stats.errors++;
          console.warn(
            `[challenge] ${source}/${element.name}: ${(error as Error).message.slice(0, 160)}`
          );
          if (previous) {
            collectStats(stats, previous.variations);
          }
        }

        processed++;
        if (processed % 25 === 0) {
          await write();
          console.log(
            `[challenge] ${source}: ${processed}/${limited.length} (${stats.errors} errors)`
          );
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, limited.length) }, () =>
        worker()
      )
    );
    await write();
  }

  return stats;
}

function collectStats(
  stats: ChallengeStats,
  annotations: ChallengeAnnotation[]
): void {
  for (const annotation of annotations) {
    stats.variations++;
    stats[annotation.direction]++;
  }
}

if (import.meta.main) {
  const storagePath = process.env.STORAGE_PATH || process.cwd();
  await mkdir(storagePath, { recursive: true });
  process.chdir(storagePath);

  const args = process.argv.slice(2);
  const sourceArg = args.find((arg) => arg.startsWith("--source="));
  const maxArg = args.find((arg) => arg.startsWith("--max="));
  const modelArg = args.find((arg) => arg.startsWith("--model="));

  const stats = await classifyChallenges({
    sources: sourceArg ? [sourceArg.split("=")[1]] : undefined,
    maxElements: maxArg ? Number(maxArg.split("=")[1]) : undefined,
    model: modelArg ? modelArg.split("=")[1] : undefined,
    force: args.includes("--force"),
  });

  console.log(
    `[challenge] done: ${stats.classified}/${stats.elements} elements, ${stats.cached} cached, ${stats.errors} errors`
  );
  console.log(
    `[challenge] variations: ${stats.variations} (easier ${stats.easier}, harder ${stats.harder}, lateral ${stats.lateral}, unknown ${stats.unknown})`
  );
}
