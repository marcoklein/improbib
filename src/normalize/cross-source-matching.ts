import type { LlmClient, MatchCandidate, ConfirmedMatch } from "./llm-client";

export function seedTranslationPairs(elements: { identifier: string }[] & { translationLinkEnIdentifier?: string; translationLinkDeIdentifier?: string }[]): { a: string; b: string; confidence: number }[] {
  const pairs: { a: string; b: string; confidence: number }[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    if (el.translationLinkEnIdentifier) {
      const key = `${el.identifier}:${el.translationLinkEnIdentifier}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ a: el.identifier, b: el.translationLinkEnIdentifier, confidence: 1.0 });
      }
    }
    if (el.translationLinkDeIdentifier) {
      const key = `${el.translationLinkDeIdentifier}:${el.identifier}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ a: el.translationLinkDeIdentifier, b: el.identifier, confidence: 1.0 });
      }
    }
  }

  return pairs;
}

export function buildMatchBatches(
  candidates: MatchCandidate[],
  batchSize: number = 100,
): { sourceA: MatchCandidate[]; sourceB: MatchCandidate[] }[] {
  const bySource = new Map<string, MatchCandidate[]>();
  for (const c of candidates) {
    const existing = bySource.get(c.sourceName) || [];
    existing.push(c);
    bySource.set(c.sourceName, existing);
  }

  const sourceNames = [...bySource.keys()];
  const batches: { sourceA: MatchCandidate[]; sourceB: MatchCandidate[] }[] = [];

  for (let i = 0; i < sourceNames.length; i++) {
    for (let j = i + 1; j < sourceNames.length; j++) {
      const listA = bySource.get(sourceNames[i])!;
      const listB = bySource.get(sourceNames[j])!;

      for (let a = 0; a < listA.length; a += batchSize) {
        for (let b = 0; b < listB.length; b += batchSize) {
          batches.push({
            sourceA: listA.slice(a, a + batchSize),
            sourceB: listB.slice(b, b + batchSize),
          });
        }
      }
    }
  }

  return batches;
}

export async function buildRelatedIdentifiers(
  candidates: MatchCandidate[],
  client: LlmClient,
  existingPairs?: { a: string; b: string; confidence: number }[],
): Promise<Map<string, { identifier: string; confidence: number }[]>> {
  const related = new Map<string, { identifier: string; confidence: number }[]>();
  const seededIds = new Set<string>();

  const addPair = (a: string, b: string, confidence: number) => {
    if (!related.has(a)) related.set(a, []);
    if (!related.has(b)) related.set(b, []);
    related.get(a)!.push({ identifier: b, confidence });
    related.get(b)!.push({ identifier: a, confidence });
  };

  if (existingPairs) {
    for (const p of existingPairs) {
      addPair(p.a, p.b, p.confidence);
      seededIds.add(`${p.a}:${p.b}`);
      seededIds.add(`${p.b}:${p.a}`);
    }
  }

  const batches = buildMatchBatches(candidates);
  let batchIndex = 0;

  for (const batch of batches) {
    batchIndex++;
    const sourceAPrefix = batch.sourceA[0]?.sourceName || "A";
    const sourceBPrefix = batch.sourceB[0]?.sourceName || "B";

    const filteredA = batch.sourceA.filter(c => !seededIds.has(`${c.identifier}:`));
    const filteredB = batch.sourceB.filter(c => !seededIds.has(`${c.identifier}:`));

    if (filteredA.length === 0 || filteredB.length === 0) continue;

    // Throttle to avoid rate limiting
    if (batchIndex > 1) await new Promise(r => setTimeout(r, 2000));

    try {
      const matches = await client.findCrossSourceMatches(filteredA, filteredB);
      for (const m of matches) {
        if (m.confidence >= 0.5) {
          addPair(m.a, m.b, m.confidence);
        }
      }
      console.log(`  Matched ${sourceAPrefix}↔${sourceBPrefix} batch: ${filteredA.length}×${filteredB.length} → ${matches.length} pairs`);
    } catch (err: any) {
      console.warn(`  Match failed for ${sourceAPrefix}↔${sourceBPrefix} batch: ${err.message}`);
    }
  }

  return related;
}
