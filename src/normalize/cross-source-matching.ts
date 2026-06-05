import type { LlmClient, MatchCandidate, ConfirmedMatch } from "./llm-client";

export function jaccardWordSimilarity(a: string, b: string, threshold: number = 0): boolean {
  const wordsA = new Set(a.toLowerCase().split(/[\s\-—–,.;:!?()]+/).filter(w => w.length > 0));
  const wordsB = new Set(b.toLowerCase().split(/[\s\-—–,.;:!?()]+/).filter(w => w.length > 0));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union > threshold;
}

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
  batchSize: number = 50,
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
      seededIds.add(p.a);
      seededIds.add(p.b);
    }
  }

  // Group non-seeded candidates by source
  const bySource = new Map<string, MatchCandidate[]>();
  for (const c of candidates) {
    if (seededIds.has(c.identifier)) continue;
    const list = bySource.get(c.sourceName) || [];
    list.push(c);
    bySource.set(c.sourceName, list);
  }

  const sourceNames = [...bySource.keys()];

  // Name-similarity pre-filter: only compare elements with shared words
  let totalBatches = 0;
  let totalSucceeded = 0;
  let totalPairs = 0;

  for (let i = 0; i < sourceNames.length; i++) {
    for (let j = i + 1; j < sourceNames.length; j++) {
      const listA = bySource.get(sourceNames[i])!;
      const listB = bySource.get(sourceNames[j])!;

      const similarA: MatchCandidate[] = [];
      const similarB = new Set<string>();

      for (const a of listA) {
        for (const b of listB) {
          if (jaccardWordSimilarity(a.name, b.name, 0)) {
            similarB.add(b.identifier);
            similarA.push(a);
            break;
          }
        }
      }

      if (similarA.length === 0 || similarB.size === 0) continue;

      const prefixedSourceA = sourceNames[i];
      const prefixedSourceB = sourceNames[j];
      const filteredB = listB.filter(b => similarB.has(b.identifier));

      // Throttle
      console.log(`  Pre-filtered ${prefixedSourceA}↔${prefixedSourceB}: ${listA.length}×${listB.length} → ${similarA.length}×${filteredB.length} candidates`);

      let pairBatches = 0;
      let pairSucceeded = 0;

      // Split into manageable batches if still large
      const batchSize = 40;
      for (let a = 0; a < similarA.length; a += batchSize) {
        for (let b = 0; b < filteredB.length; b += batchSize) {
          const batchA = similarA.slice(a, a + batchSize);
          const batchB = filteredB.slice(b, b + batchSize);

          await new Promise(r => setTimeout(r, 1000));
          pairBatches++;
          totalBatches++;

          try {
            const matches = await client.findCrossSourceMatches(batchA, batchB);
            for (const m of matches) {
              if (m.confidence >= 0.5) {
                addPair(m.a, m.b, m.confidence);
                totalPairs++;
              }
            }
            pairSucceeded++;
            totalSucceeded++;
            console.log(`  Matched ${prefixedSourceA}↔${prefixedSourceB} batch: ${batchA.length}×${batchB.length} → ${matches.length} pairs`);
          } catch (err: any) {
            console.warn(`  Match failed for ${prefixedSourceA}↔${prefixedSourceB} batch: ${err.message}`);
          }
        }
      }
      if (pairBatches > 0) {
        console.log(`  ${prefixedSourceA}↔${prefixedSourceB}: ${pairSucceeded}/${pairBatches} batches succeeded`);
      }
    }
  }

  if (totalBatches > 0) {
    console.log(`  Cross-source matching: ${totalSucceeded}/${totalBatches} batches succeeded, ${totalPairs} LLM-confirmed pairs`);
  }

  return related;
}
