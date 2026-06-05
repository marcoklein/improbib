import path from "path";
import type { VocabularyMap } from "./llm-client";
import type { NormalizedElement } from "./normalized-schema";
import { canonicalizeVocabulary } from "./vocab-cluster";

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
        if (m.originalName) {
          const { originalName: _, ...rest } = m;
          return rest;
        }
        return m;
      }),
      skills: el.normalized.skills.map(s => {
        const canonical = skillMap.get(s.name.toLowerCase());
        if (canonical && canonical !== s.name) {
          return { ...s, originalName: s.name, name: canonical };
        }
        if (s.originalName) {
          const { originalName: _, ...rest } = s;
          return rest;
        }
        return s;
      }),
    },
  }));
}

async function loadThesaurus(): Promise<VocabularyMap> {
  const p = path.join(import.meta.dirname, "vocabulary-thesaurus.json");
  const f = Bun.file(p);
  if (!(await f.exists())) return { mechanics: [], skills: [] };
  try {
    const data = await f.json();
    return {
      mechanics: data.mechanics || [],
      skills: data.skills || [],
    };
  } catch {
    return { mechanics: [], skills: [] };
  }
}

export async function normalizeVocabulary(
  elements: NormalizedElement[],
): Promise<VocabularyMap> {
  const thesaurus = await loadThesaurus();
  const terms = collectTerms(elements);

  if (terms.mechanics.length === 0 && terms.skills.length === 0) {
    return { mechanics: [], skills: [] };
  }

  const vocab = canonicalizeVocabulary(elements, thesaurus);
  const termCount = vocab.mechanics.reduce((s, c) => s + 1 + c.variants.length, 0) +
    vocab.skills.reduce((s, c) => s + 1 + c.variants.length, 0);
  console.log(`Vocabulary: ${vocab.mechanics.length} mechanic clusters, ${vocab.skills.length} skill clusters (${termCount} terms covered)`);
  return vocab;
}
