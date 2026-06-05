import type { LlmClient, VocabularyMap } from "./llm-client";
import type { NormalizedElement } from "./normalized-schema";

export function collectTerms(elements: NormalizedElement[]): { mechanics: string[]; skills: string[] } {
  const mechanics = new Set<string>();
  const skills = new Set<string>();

  for (const el of elements) {
    for (const m of el.normalized.mechanics) {
      if (m.name) mechanics.add(m.name);
    }
    for (const s of el.normalized.skills) {
      if (s.name) skills.add(s.name);
    }
  }

  return {
    mechanics: [...mechanics].sort(),
    skills: [...skills].sort(),
  };
}

function buildTermMap(clusters: { canonical: string; variants: string[] }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of clusters) {
    map.set(c.canonical.toLowerCase(), c.canonical);
    for (const v of c.variants) {
      if (v.toLowerCase() !== c.canonical.toLowerCase()) {
        map.set(v.toLowerCase(), c.canonical);
      }
    }
  }
  return map;
}

export function applyCanonicalTerms(elements: NormalizedElement[], vocab: VocabularyMap): NormalizedElement[] {
  const mechMap = buildTermMap(vocab.mechanics);
  const skillMap = buildTermMap(vocab.skills);

  return elements.map(el => ({
    ...el,
    normalized: {
      ...el.normalized,
      mechanics: el.normalized.mechanics.map(m => {
        const canonical = mechMap.get(m.name.toLowerCase());
        if (canonical && canonical !== m.name) {
          return { ...m, originalName: m.name, name: canonical };
        }
        return m;
      }),
      skills: el.normalized.skills.map(s => {
        const canonical = skillMap.get(s.name.toLowerCase());
        if (canonical && canonical !== s.name) {
          return { ...s, originalName: s.name, name: canonical };
        }
        return s;
      }),
    },
  }));
}

export async function normalizeVocabulary(
  client: LlmClient,
  elements: NormalizedElement[],
): Promise<VocabularyMap> {
  const terms = collectTerms(elements);

  if (terms.mechanics.length === 0 && terms.skills.length === 0) {
    return { mechanics: [], skills: [] };
  }

  try {
    const vocab = await client.normalizeVocabulary(terms);
    console.log(`Vocabulary: ${vocab.mechanics.length} mechanic clusters, ${vocab.skills.length} skill clusters`);
    return vocab;
  } catch (err: any) {
    console.warn(`Vocabulary normalization failed: ${err.message}. Retrying with chunked calls...`);
    return await normalizeVocabularyChunked(client, terms);
  }
}

async function normalizeVocabularyChunked(
  client: LlmClient,
  terms: { mechanics: string[]; skills: string[] },
  chunkSize: number = 500,
): Promise<VocabularyMap> {
  let mechanics: { canonical: string; variants: string[] }[] = [];
  let skills: { canonical: string; variants: string[] }[] = [];

  // Mechanics in one shot (already works)
  if (terms.mechanics.length > 0) {
    try {
      const result = await client.normalizeVocabulary({ mechanics: terms.mechanics, skills: [] });
      mechanics = result.mechanics;
      console.log(`  Mechanics: ${mechanics.length} clusters from ${terms.mechanics.length} terms`);
    } catch (err: any) {
      console.warn(`  Mechanics single call failed: ${err.message}. Retrying chunked...`);
      mechanics = await chunkAndMerge(client, terms.mechanics, chunkSize, "Mechanics");
    }
  }

  // Chunk skills
  if (terms.skills.length > 0) {
    skills = await chunkAndMerge(client, terms.skills, chunkSize, "Skills");
  }

  return { mechanics, skills };
}

async function chunkAndMerge(
  client: LlmClient,
  terms: string[],
  chunkSize: number,
  label: string,
): Promise<{ canonical: string; variants: string[] }[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < terms.length; i += chunkSize) {
    chunks.push(terms.slice(i, i + chunkSize));
  }
  console.log(`  ${label} chunked: ${chunks.length} chunks of up to ${chunkSize} terms each`);

  const allClusters: { canonical: string; variants: string[] }[] = [];

  for (const [i, chunk] of chunks.entries()) {
    try {
      const result = await client.normalizeVocabulary(
        label === "Mechanics" ? { mechanics: chunk, skills: [] } : { mechanics: [], skills: chunk },
      );
      const clusters = label === "Mechanics" ? result.mechanics : result.skills;
      allClusters.push(...clusters);
      console.log(`    Chunk ${i + 1}/${chunks.length}: ${clusters.length} clusters from ${chunk.length} terms`);
    } catch (err: any) {
      console.warn(`    Chunk ${i + 1}/${chunks.length} failed: ${err.message}`);
    }
  }

  if (allClusters.length === 0) {
    console.warn(`  All ${label.toLowerCase()} chunks failed — no vocabulary produced`);
    return [];
  }

  if (chunks.length === 1) return allClusters;

  // Merge pass: deduplicate overlapping canonical names across chunks
  const allCanonicals = [...new Set(allClusters.map(c => c.canonical.toLowerCase()))];
  console.log(`  Merge pass: ${allCanonicals.length} candidate canonical names from ${chunks.length} chunks`);

  try {
    const merged = await client.normalizeVocabulary(
      label === "Mechanics" ? { mechanics: allCanonicals, skills: [] } : { mechanics: [], skills: allCanonicals },
    );
    const mergedClusters = label === "Mechanics" ? merged.mechanics : merged.skills;
    const mergedCanonicalLower = new Set(mergedClusters.map(c => c.canonical.toLowerCase()));
    const variantMap = new Map<string, Set<string>>();

    for (const cluster of allClusters) {
      const canonicalLower = cluster.canonical.toLowerCase();
      let target = canonicalLower;
      if (!mergedCanonicalLower.has(canonicalLower)) {
        for (const mc of mergedClusters) {
          if (cluster.variants.some(v => v.toLowerCase() === mc.canonical.toLowerCase()) ||
              mc.variants.some(v => v.toLowerCase() === canonicalLower)) {
            target = mc.canonical.toLowerCase();
            break;
          }
        }
      }

      if (!variantMap.has(target)) variantMap.set(target, new Set());
      variantMap.get(target)!.add(cluster.canonical);
      for (const v of cluster.variants) {
        if (v.toLowerCase() !== target) {
          variantMap.get(target)!.add(v);
        }
      }
    }

    const result = mergedClusters.map(mc => ({
      canonical: mc.canonical,
      variants: [...(variantMap.get(mc.canonical.toLowerCase()) || new Set([mc.canonical]))].filter(v => v.toLowerCase() !== mc.canonical.toLowerCase()),
    }));

    console.log(`  Merged ${label.toLowerCase()}: ${result.length} clusters from ${allClusters.length} partial clusters`);
    return result;
  } catch (err: any) {
    console.warn(`  Merge pass failed: ${err.message} — keeping unmerged clusters`);
    return allClusters;
  }
}
