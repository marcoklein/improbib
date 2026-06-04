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
    console.warn(`Vocabulary normalization failed: ${err.message}. Retrying with split calls...`);
    return await normalizeVocabularySplit(client, terms);
  }
}

async function normalizeVocabularySplit(
  client: LlmClient,
  terms: { mechanics: string[]; skills: string[] },
): Promise<VocabularyMap> {
  let mechanics: { canonical: string; variants: string[] }[] = [];
  let skills: { canonical: string; variants: string[] }[] = [];

  if (terms.mechanics.length > 0) {
    try {
      const result = await client.normalizeVocabulary({ mechanics: terms.mechanics, skills: [] });
      mechanics = result.mechanics;
    } catch (err: any) {
      console.warn(`Mechanics vocabulary failed: ${err.message}`);
    }
  }

  if (terms.skills.length > 0) {
    try {
      const result = await client.normalizeVocabulary({ mechanics: [], skills: terms.skills });
      skills = result.skills;
    } catch (err: any) {
      console.warn(`Skills vocabulary failed: ${err.message}`);
    }
  }

  return { mechanics, skills };
}
