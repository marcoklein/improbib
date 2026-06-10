import { createHash } from "crypto";
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
  edgeType: "hasMechanic" | "trainsSkill" | "hasTag" | "requires" | "buildsOn" | "variationOf";
  elementId: string;
  targetId: string;
  note?: string;
  contentHash?: string;
}

interface RequiresOverride {
  type: "add_requires" | "remove_requires";
  elementId: string;
  requirementLabel: string;
  note?: string;
}

interface BuildsOnOverride {
  type: "add_buildsOn" | "remove_buildsOn";
  fromElementId: string;
  toElementId: string;
  note?: string;
}

interface VariationOfOverride {
  type: "add_variationOf" | "remove_variationOf";
  fromElementId: string;
  toElementId: string;
  note?: string;
}

type Override = DedupOverride | EdgeOverride | RequiresOverride | BuildsOnOverride | VariationOfOverride;
export type { Override };

function requirementNodeId(label: string): string {
  return createHash("md5").update(`requirement:${label.toLowerCase()}`).digest("hex");
}

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
  const stats: OverrideStats = { applied: 0, stale: 0, staleDetails: [] };

  const removeSet = new Set<string>();
  const addList: GraphEdgeLike[] = [];

  // Existing edge overrides (add_edge / remove_edge)
  for (const o of overrides) {
    if (o.type !== "remove_edge" && o.type !== "add_edge") continue;
    const override = o as EdgeOverride;
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
      addList.push({
        type: override.edgeType,
        from: override.elementId,
        to: override.targetId,
        confidence: 1.0,
      });
    }
    stats.applied++;
  }

  // Requires overrides
  for (const o of overrides) {
    if (o.type !== "add_requires" && o.type !== "remove_requires") continue;
    const override = o as { type: string; elementId: string; requirementLabel: string };
    const reqId = requirementNodeId(override.requirementLabel);
    if (override.type === "remove_requires") {
      removeSet.add(`requires:${override.elementId}→${reqId}`);
    } else {
      addList.push({
        type: "requires",
        from: override.elementId,
        to: reqId,
        confidence: 1.0,
      });
    }
    stats.applied++;
  }

  // BuildsOn overrides
  for (const o of overrides) {
    if (o.type !== "add_buildsOn" && o.type !== "remove_buildsOn") continue;
    const override = o as { type: string; fromElementId: string; toElementId: string };
    if (override.type === "remove_buildsOn") {
      removeSet.add(`buildsOn:${override.fromElementId}→${override.toElementId}`);
    } else {
      addList.push({
        type: "buildsOn",
        from: override.fromElementId,
        to: override.toElementId,
        confidence: 1.0,
      });
    }
    stats.applied++;
  }

  // VariationOf overrides
  for (const o of overrides) {
    if (o.type !== "add_variationOf" && o.type !== "remove_variationOf") continue;
    const override = o as { type: string; fromElementId: string; toElementId: string };
    if (override.type === "remove_variationOf") {
      removeSet.add(`variationOf:${override.fromElementId}→${override.toElementId}`);
    } else {
      addList.push({
        type: "variationOf",
        from: override.fromElementId,
        to: override.toElementId,
        confidence: 1.0,
      });
    }
    stats.applied++;
  }

  const filtered = edges.filter(e => {
    const key = `${e.type}:${e.from}→${e.to}`;
    return !removeSet.has(key);
  });

  for (const add of addList) {
    const alreadyExists = filtered.some(
      e => e.type === add.type && e.from === add.from && e.to === add.to,
    );
    if (!alreadyExists) {
      filtered.push(add);
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
