import type { NormalizedElement } from "../normalize/normalized-schema";

interface GraphEdgeLike {
  type: string;
  from: string;
  to: string;
  confidence?: number;
}

interface DedupOverride {
  type: "reject_match" | "add_match";
  elementA: string;
  elementB: string;
  note?: string;
  contentHashes?: Record<string, string>;
}

interface EdgeOverride {
  type: "remove_edge" | "add_edge";
  edgeType: "hasMechanic" | "trainsSkill" | "hasTag";
  elementId: string;
  targetId: string;
  note?: string;
  contentHash?: string;
}

type Override = DedupOverride | EdgeOverride;
export type { Override };

interface OverrideFile {
  version: 1;
  overrides: Override[];
}

export interface OverrideStats {
  applied: number;
  stale: number;
  staleDetails: string[];
}

function checkContentHash(
  elementId: string,
  storedHash: string | undefined,
  currentHash: string | undefined,
): boolean {
  if (!storedHash) return true;
  if (!currentHash) return true;
  return storedHash === currentHash;
}

export function applyDedupOverrides(
  elements: NormalizedElement[],
  overrides: Override[],
): { elements: NormalizedElement[]; stats: OverrideStats } {
  const dedupOverrides = overrides.filter(
    (o): o is DedupOverride => o.type === "reject_match" || o.type === "add_match",
  );
  const stats: OverrideStats = { applied: 0, stale: 0, staleDetails: [] };

  const dedupApplied = new Set<string>();
  for (const override of dedupOverrides) {
    const key = [override.elementA, override.elementB].sort().join("|");
    if (dedupApplied.has(key)) continue;
    dedupApplied.add(key);

    const elA = elements.find(e => e.identifier === override.elementA);
    const elB = elements.find(e => e.identifier === override.elementB);
    if (!elA || !elB) continue;

    const staleA = !checkContentHash(
      override.elementA,
      override.contentHashes?.[override.elementA],
      elA.normalized.contentHash,
    );
    const staleB = !checkContentHash(
      override.elementB,
      override.contentHashes?.[override.elementB],
      elB.normalized.contentHash,
    );

    if (staleA || staleB) {
      stats.stale++;
      const names = [elA.name, elB.name].join(", ");
      stats.staleDetails.push(
        `${override.type}(${names}): content changed since review — override skipped`,
      );
      continue;
    }

    if (override.type === "reject_match") {
      // Remove relatedIdentifier entries between A and B (both directions)
      elA.relatedIdentifiers = elA.relatedIdentifiers.filter(
        ri => ri.identifier !== override.elementB,
      );
      elB.relatedIdentifiers = elB.relatedIdentifiers.filter(
        ri => ri.identifier !== override.elementA,
      );
    } else {
      // add_match: add relatedIdentifier entries with confidence 1.0
      const existsA = elA.relatedIdentifiers.some(ri => ri.identifier === override.elementB);
      const existsB = elB.relatedIdentifiers.some(ri => ri.identifier === override.elementA);
      if (!existsA) {
        elA.relatedIdentifiers.push({ identifier: override.elementB, confidence: 1.0 });
      }
      if (!existsB) {
        elB.relatedIdentifiers.push({ identifier: override.elementA, confidence: 1.0 });
      }
    }
    stats.applied++;
  }

  return { elements, stats };
}

export function applyEdgeOverrides(
  edges: GraphEdgeLike[],
  overrides: Override[],
  elements: NormalizedElement[],
): { edges: GraphEdgeLike[]; stats: OverrideStats } {
  const edgeOverrides = overrides.filter(
    (o): o is EdgeOverride => o.type === "remove_edge" || o.type === "add_edge",
  );
  const stats: OverrideStats = { applied: 0, stale: 0, staleDetails: [] };

  const removeSet = new Set<string>();
  const addList: EdgeOverride[] = [];

  for (const override of edgeOverrides) {
    const el = elements.find(e => e.identifier === override.elementId);
    const stale = !checkContentHash(
      override.elementId,
      override.contentHash,
      el?.normalized.contentHash,
    );

    if (stale) {
      stats.stale++;
      stats.staleDetails.push(
        `${override.type} ${override.edgeType} on ${el?.name ?? override.elementId}: content changed — override skipped`,
      );
      continue;
    }

    if (override.type === "remove_edge") {
      removeSet.add(`${override.edgeType}:${override.elementId}→${override.targetId}`);
    } else {
      addList.push(override);
    }
    stats.applied++;
  }

  const filtered = edges.filter(e => {
    const key = `${e.type}:${e.from}→${e.to}`;
    return !removeSet.has(key);
  });

  for (const add of addList) {
    const alreadyExists = filtered.some(
      e => e.type === add.edgeType && e.from === add.elementId && e.to === add.targetId,
    );
    if (!alreadyExists) {
      filtered.push({
        type: add.edgeType,
        from: add.elementId,
        to: add.targetId,
        confidence: 1.0,
      });
    }
  }

  return { edges: filtered, stats };
}

export async function loadOverrides(filePath: string): Promise<Override[]> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return [];
  const data = await file.json() as OverrideFile;
  if (!data || data.version !== 1) return [];
  return data.overrides || [];
}

export async function writeOverrides(filePath: string, overrides: Override[]): Promise<void> {
  const data: OverrideFile = { version: 1, overrides };
  await Bun.write(filePath, JSON.stringify(data, null, 2));
}
