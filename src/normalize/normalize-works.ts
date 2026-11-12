import path from "path";
import { createHash } from "crypto";
import { mkdir } from "node:fs/promises";
import type { NormalizedElement } from "./normalized-schema";
import { getNormalizedBy, isUsableNormalization } from "./normalized-schema";
import { CredentialRefreshError } from "./api-credential";
import { createOpencodeGoClient } from "./llm-client";
import { isForcedUnit, parseForceIds } from "./force-ids";
import { ACTIVE_SOURCES } from "../sources";

/**
 * One work = the source pages that describe it. The groups are curated in
 * `work-merges.json`, so the extraction sees every source of a work at once
 * instead of merging finished (and diverging) per-page extractions later.
 */
export interface RawSourceElement {
  identifier: string;
  name: string;
  sourceName: string;
  url: string;
  languageCode: "de" | "en";
  tags?: string[];
  htmlContent?: string;
  translationLinkEn?: string;
  translationLinkDe?: string;
  translationLinkEnIdentifier?: string;
  translationLinkDeIdentifier?: string;
  playerCountMin?: number;
  playerCountMax?: number;
  categories?: string[];
  postTags?: string[];
  lastModified?: string;
}

interface WorkMergeEntry {
  ids: string[];
  names?: string[];
  languageCode: "de" | "en";
}

interface WorkMergesFile {
  merges: WorkMergeEntry[];
}

export interface WorkUnit {
  /** The first identifier, sorted, so the id does not depend on review order. */
  groupId: string;
  languageCode: "de" | "en";
  members: RawSourceElement[];
}

export interface WorkNormalizationRecord {
  id: string;
  languageCode: "de" | "en";
  memberIds: string[];
  normalized: NormalizedElement["normalized"];
}

interface WorkNormalizationsFile {
  meta: { workCount: number; normalizedAt: string };
  works: WorkNormalizationRecord[];
}

function hashContent(html: string): string {
  return createHash("md5").update(html).digest("hex");
}

/**
 * Path to the curated merge decisions.
 *
 * The CLI runs with `STORAGE_PATH` as its working directory, where the
 * committed file does not exist. Falling back to the repository root keeps the
 * same file usable in the container without copying review data into storage.
 */
async function workMergesFile(): Promise<ReturnType<typeof Bun.file>> {
  const cwdPath = path.join(process.cwd(), "work-merges.json");
  const cwdFile = Bun.file(cwdPath);
  if (await cwdFile.exists()) return cwdFile;

  const modulePath = path.join(import.meta.dir, "..", "..", "work-merges.json");
  const moduleFile = Bun.file(modulePath);
  if (await moduleFile.exists()) return moduleFile;

  throw new Error(`work-merges.json not found at ${cwdPath} or ${modulePath}`);
}

async function loadWorkMerges(): Promise<WorkMergesFile> {
  return (await (await workMergesFile()).json()) as WorkMergesFile;
}

/**
 * The ids of every reviewed merge group, exactly as reviewed.
 *
 * The per-source stage uses this to skip those pages — the merged stage owns
 * their extraction, so normalizing them twice would only produce a second
 * walkthrough that is immediately overwritten.
 */
export async function loadWorkMergeGroups(): Promise<string[][]> {
  const file = await loadWorkMerges();
  return file.merges.map((merge) => merge.ids);
}

async function loadRawIndex(): Promise<Map<string, RawSourceElement>> {
  const index = new Map<string, RawSourceElement>();
  for (const source of ACTIVE_SOURCES) {
    const rawPath = path.join(process.cwd(), "output", "raw", `${source}.json`);
    const file = Bun.file(rawPath);
    if (!(await file.exists())) {
      console.warn(`Raw file not found for ${source}, skipping work members`);
      continue;
    }
    const data = await file.json();
    for (const element of data.elements ?? []) {
      index.set(element.identifier as string, element as RawSourceElement);
    }
  }
  return index;
}

/**
 * The units to extract: reviewed merge groups, restricted to pages that
 * actually exist in the current raw scrape.
 */
export async function buildWorkUnits(): Promise<WorkUnit[]> {
  const [merges, rawIndex] = await Promise.all([
    loadWorkMerges(),
    loadRawIndex(),
  ]);

  const units: WorkUnit[] = [];
  for (const merge of merges.merges) {
    if (merge.ids.length === 0) continue;
    const members = merge.ids
      .map((id) => rawIndex.get(id))
      .filter((element): element is RawSourceElement => Boolean(element))
      .sort((a, b) => a.identifier.localeCompare(b.identifier));
    if (members.length === 0) continue;

    units.push({
      groupId: [...merge.ids].sort()[0],
      languageCode: merge.languageCode,
      members,
    });
  }

  return units.sort((a, b) => a.groupId.localeCompare(b.groupId));
}

/**
 * Cache key of a unit: every member's identifier and HTML, plus the
 * extraction contract. Order-independent, so a reordered group is still a hit;
 * any changed page is a miss.
 */
export function computeUnitHash(
  members: { identifier: string; htmlContent?: string }[]
): string {
  const pairs = members
    .map((member) => `${member.identifier}:${hashContent(member.htmlContent ?? "")}`)
    .sort();
  return createHash("md5")
    .update([...pairs, getNormalizedBy()].join("\n"))
    .digest("hex");
}

/**
 * Whether a stored work extraction can be reused. Same rules as the
 * per-source cache: the unit content and the contract must match, and an empty
 * summary/description is always a miss.
 */
export function isReusableWorkNormalization(
  previous: { normalized: NormalizedElement["normalized"] } | undefined,
  unitHash: string,
  contractHash: string
): boolean {
  if (!previous) return false;
  const { normalized } = previous;
  if (!normalized || !isUsableNormalization(normalized)) return false;
  return (
    normalized.contentHash === unitHash &&
    normalized.normalizedBy === contractHash
  );
}

/**
 * The full cache decision of the works stage.
 *
 * `NORMALIZE_FORCE_IDS` wins over a matching hash: a listed member re-extracts
 * the whole unit, which is how a single work is rebuilt after a prompt change
 * without invalidating the global cache.
 */
export function shouldReuseWorkNormalization(
  previous: { normalized: NormalizedElement["normalized"] } | undefined,
  unitHash: string,
  contractHash: string,
  memberIds: readonly string[],
  forceIds: ReadonlySet<string>
): boolean {
  if (isForcedUnit(memberIds, forceIds)) return false;
  return isReusableWorkNormalization(previous, unitHash, contractHash);
}

async function readWorkNormalizationsFile(): Promise<
  WorkNormalizationsFile | undefined
> {
  const prevPath = path.join(
    process.cwd(),
    "output",
    "normalized-works.json"
  );
  const file = Bun.file(prevPath);
  if (!(await file.exists())) return undefined;

  try {
    return (await file.json()) as WorkNormalizationsFile;
  } catch {
    // A corrupt file is no cache — start over.
    return undefined;
  }
}

async function loadPreviousWorkNormalizations(): Promise<
  Map<string, WorkNormalizationRecord>
> {
  const result = new Map<string, WorkNormalizationRecord>();
  const data = await readWorkNormalizationsFile();
  for (const work of data?.works ?? []) result.set(work.id, work);
  return result;
}

/**
 * The merged block of every work member, keyed by member id. Empty when the
 * works stage has not run yet; the per-source stage then has nothing to add.
 */
export async function loadWorkNormalizations(): Promise<
  Map<string, NormalizedElement["normalized"]>
> {
  const result = new Map<string, NormalizedElement["normalized"]>();
  const data = await readWorkNormalizationsFile();
  for (const work of data?.works ?? []) {
    for (const memberId of work.memberIds) {
      result.set(memberId, work.normalized);
    }
  }
  return result;
}

/**
 * A complete per-source element whose content is the one merged work
 * extraction.
 *
 * The per-source stage skips merged members, so without this they would vanish
 * from `output/normalized/<source>.json` once that file is rewritten — and the
 * assembly step would have no element left to attach the work to. Returning
 * `undefined` for a missing block keeps the old skip behavior when the works
 * stage has not run yet.
 */
export function buildWorkMember(
  element: RawSourceElement,
  normalized: NormalizedElement["normalized"] | undefined
): NormalizedElement | undefined {
  if (!normalized) return undefined;

  return {
    identifier: element.identifier,
    name: element.name,
    url: element.url,
    sourceName: element.sourceName,
    languageCode: element.languageCode,
    tags: element.tags ?? [],
    htmlContent: element.htmlContent ?? "",
    translationLinkEn: element.translationLinkEn,
    translationLinkDe: element.translationLinkDe,
    translationLinkEnIdentifier: element.translationLinkEnIdentifier,
    translationLinkDeIdentifier: element.translationLinkDeIdentifier,
    playerCountMin: element.playerCountMin,
    playerCountMax: element.playerCountMax,
    categories: element.categories,
    postTags: element.postTags,
    lastModified: element.lastModified,
    // Keep the work's contentHash/extractedAt/normalizedBy untouched: the
    // cache key belongs to the unit, not to the member page.
    normalized,
    derivedElements: [],
    relatedIdentifiers: [],
  };
}

function buildOutput(
  records: Map<string, WorkNormalizationRecord>
): WorkNormalizationsFile {
  const works = [...records.values()].sort((a, b) => a.id.localeCompare(b.id));
  return {
    meta: {
      workCount: works.length,
      normalizedAt: new Date().toISOString(),
    },
    works,
  };
}

/**
 * Extract one normalization per reviewed work.
 *
 * Every member of a unit receives the same result later in the assembly step,
 * so the published elements of one work stay consistent. The cache lives in
 * `output/normalized-works.json`; a partial run writes what it has, so an
 * interrupted run resumes.
 */
export async function normalizeWorksStage(options?: {
  maxWorks?: number;
  dryRun?: boolean;
}): Promise<void> {
  const allUnits = await buildWorkUnits();
  const units = options?.maxWorks
    ? allUnits.slice(0, options.maxWorks)
    : allUnits;
  const previous = await loadPreviousWorkNormalizations();
  const contractHash = getNormalizedBy();
  const forceIds = parseForceIds();

  if (options?.dryRun) {
    const cached = units.filter((unit) =>
      shouldReuseWorkNormalization(
        previous.get(unit.groupId),
        computeUnitHash(unit.members),
        contractHash,
        unit.members.map((member) => member.identifier),
        forceIds
      )
    ).length;

    console.log(
      `Works: ${allUnits.length} units, ${units.length} selected, ${cached} cached`
    );
    for (const unit of units) {
      console.log(
        `  ${unit.groupId} (${unit.languageCode}) — ${unit.members
          .map((member) => member.name)
          .join(" / ")}`
      );
    }
    return;
  }

  const client = createOpencodeGoClient();
  const startTime = Date.now();
  const outDir = path.join(process.cwd(), "output");
  const worksPath = path.join(outDir, "normalized-works.json");
  await mkdir(outDir, { recursive: true });

  const records = new Map<string, WorkNormalizationRecord>();
  let dispatched = 0;
  let cached = 0;
  let errors = 0;
  let index = 0;
  let writeLock = false;

  console.log(
    `Normalizing works: ${units.length}${options?.maxWorks ? ` of ${allUnits.length}` : ""} units`
  );

  async function writeSnapshot() {
    if (writeLock) return;
    writeLock = true;
    try {
      await Bun.write(worksPath, JSON.stringify(buildOutput(records), null, 2));
    } catch (err: any) {
      console.warn(`  Write error works: ${err.message.slice(0, 100)}`);
    } finally {
      writeLock = false;
    }
  }

  function logProgress() {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (dispatched / parseFloat(elapsed)).toFixed(1);
    console.log(
      `  [${dispatched}/${units.length}] works: ${dispatched - cached} new, ${cached} cached, ${errors} errors (${rate}/s, ${elapsed}s)`
    );
  }

  async function processNext(): Promise<void> {
    while (index < units.length) {
      const unit = units[index++];
      const unitHash = computeUnitHash(unit.members);
      const memberIds = unit.members.map((member) => member.identifier);

      const prev = previous.get(unit.groupId);
      if (
        shouldReuseWorkNormalization(
          prev,
          unitHash,
          contractHash,
          memberIds,
          forceIds
        )
      ) {
        records.set(unit.groupId, {
          id: unit.groupId,
          languageCode: unit.languageCode,
          memberIds,
          normalized: prev!.normalized,
        });
        cached++;
        dispatched++;
        if (dispatched % 10 === 0) logProgress();
        continue;
      }

      try {
        const result = await client.normalizeWork(
          unit.members.map((member) => ({
            identifier: member.identifier,
            name: member.name,
            sourceName: member.sourceName,
            url: member.url,
            languageCode: member.languageCode,
            content: member.htmlContent ?? "",
          }))
        );

        records.set(unit.groupId, {
          id: unit.groupId,
          languageCode: unit.languageCode,
          memberIds,
          normalized: {
            ...result.normalized,
            contentHash: unitHash,
            extractedAt: new Date().toISOString(),
            normalizedBy: contractHash,
          },
        });
      } catch (err: any) {
        // A dead credential is not a per-work failure: abort instead of
        // publishing a run whose merged units silently kept old content.
        if (err instanceof CredentialRefreshError) throw err;
        // Do not store a half result. The missing unit means its members keep
        // no merged content, which the assembly step shows instead of hiding.
        console.warn(
          `  SKIP work ${unit.members.map((member) => member.name).join(" / ")}: ${err.message.slice(0, 150)}`
        );
        errors++;
      }

      dispatched++;
      if (dispatched % 10 === 0) logProgress();
      if (dispatched % 10 === 0) await writeSnapshot();
    }
  }

  const workers = Array.from(
    { length: Math.min(10, units.length) },
    () => processNext()
  );
  await Promise.all(workers);

  // Always write, even when the run was partial or every unit failed: the
  // cache is what makes the next run resume instead of paying again.
  await writeSnapshot();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `Finished works: ${records.size}/${units.length} extracted, ${cached} cached, ${errors} errors (${totalTime}s)`
  );
}
