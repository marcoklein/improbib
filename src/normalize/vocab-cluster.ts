import type { NormalizedElement } from "./normalized-schema";
import type { VocabularyMap, VocabularyCluster } from "./llm-client";

function normalizeTerm(t: string): string {
  return t
    .toLowerCase()
    .replace(/[-/]/g, " ")
    .replace(/[^a-z0-9 äöüß]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter(w => w.length > 0));
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let prev = 0;

  for (let i = 1; i <= m; i++) {
    prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(dp[j], dp[j - 1], prev);
      prev = temp;
    }
  }

  return dp[n];
}

function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function tokenJaccard(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;

  let intersection = 0;
  for (const w of ta) {
    if (tb.has(w)) intersection++;
  }
  const union = new Set([...ta, ...tb]).size;
  return intersection / union;
}

function isEnglishTerm(t: string): boolean {
  return !/[äöüß]/.test(t.toLowerCase());
}

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(x: number, y: number): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;
    if (this.rank[rx] < this.rank[ry]) {
      this.parent[rx] = ry;
    } else if (this.rank[rx] > this.rank[ry]) {
      this.parent[ry] = rx;
    } else {
      this.parent[ry] = rx;
      this.rank[rx]++;
    }
  }

  groups(): Map<number, number[]> {
    const groupMap = new Map<number, number[]>();
    for (let i = 0; i < this.parent.length; i++) {
      const root = this.find(i);
      const g = groupMap.get(root) || [];
      g.push(i);
      groupMap.set(root, g);
    }
    return groupMap;
  }
}

interface TermMeta {
  count: number;
  categories: string[];
}

function buildTranslationSeeds(
  elements: NormalizedElement[],
): { mechMap: Map<string, string>; skillMap: Map<string, string> } {
  const mechMap = new Map<string, string>();
  const skillMap = new Map<string, string>();
  const byId = new Map(elements.map(e => [e.identifier, e]));

  for (const el of elements) {
    if (el.languageCode !== "de" || !el.translationLinkEnIdentifier) continue;
    const en = byId.get(el.translationLinkEnIdentifier);
    if (!en) continue;

    const deMechs = el.normalized.mechanics;
    const enMechs = en.normalized.mechanics;
    if (deMechs.length === 1 && enMechs.length === 1) {
      const deName = deMechs[0].name.toLowerCase();
      const enName = enMechs[0].name;
      if (deName !== enName.toLowerCase() && deMechs[0].category === enMechs[0].category) {
        mechMap.set(deName, enName);
      }
    }

    const deSkills = el.normalized.skills;
    const enSkills = en.normalized.skills;
    if (deSkills.length === 1 && enSkills.length === 1) {
      const deName = deSkills[0].name.toLowerCase();
      const enName = enSkills[0].name;
      if (deName !== enName.toLowerCase() && deSkills[0].category === enSkills[0].category) {
        skillMap.set(deName, enName);
      }
    }
  }

  return { mechMap, skillMap };
}

function pickCanonical(
  clusterTerms: string[],
  originalTerms: string[],
  meta: Map<string, TermMeta>,
  seedCanonicals: Set<string>,
): string {
  const candidates = [...originalTerms];

  candidates.sort((a, b) => {
    const metaA = meta.get(a.toLowerCase());
    const metaB = meta.get(b.toLowerCase());
    const countA = metaA?.count ?? 0;
    const countB = metaB?.count ?? 0;

    const aSeeded = seedCanonicals.has(a.toLowerCase());
    const bSeeded = seedCanonicals.has(b.toLowerCase());
    if (aSeeded && !bSeeded) return -1;
    if (!aSeeded && bSeeded) return 1;

    if (countA !== countB) return countB - countA;

    const aMulti = a.includes(" ");
    const bMulti = b.includes(" ");
    if (aMulti && !bMulti) return -1;
    if (!aMulti && bMulti) return 1;

    const aEng = isEnglishTerm(a);
    const bEng = isEnglishTerm(b);
    if (aEng && !bEng) return -1;
    if (!aEng && bEng) return 1;

    return a.length - b.length;
  });

  return candidates[0]!;
}

function clusterTerms(
  terms: string[],
  meta: Map<string, TermMeta>,
  seedCanonicals: Set<string>,
  options: { jaccardThreshold: number; levenshteinThreshold: number },
): VocabularyCluster[] {
  if (terms.length === 0) return [];

  const normalized = terms.map(t => normalizeTerm(t));
  const uf = new UnionFind(terms.length);

  for (let i = 0; i < terms.length; i++) {
    for (let j = i + 1; j < terms.length; j++) {
      const jaccard = tokenJaccard(normalized[i], normalized[j]);
      if (jaccard >= options.jaccardThreshold) {
        uf.union(i, j);
        continue;
      }

      if (normalized[i].length <= 15 && normalized[j].length <= 15) {
        const ratio = levenshteinRatio(normalized[i], normalized[j]);
        if (ratio >= options.levenshteinThreshold) {
          uf.union(i, j);
        }
      }
    }
  }

  const groups = uf.groups();
  const clusters: VocabularyCluster[] = [];

  for (const [, indices] of groups) {
    const groupTerms = indices.map(i => terms[i]).filter(t => t.length > 0);
    const originalNames = [...new Set(groupTerms)];
    const canonical = pickCanonical(groupTerms, originalNames, meta, seedCanonicals);
    const variants = originalNames.filter(t => t.toLowerCase() !== canonical.toLowerCase());

    clusters.push({ canonical, variants, parent: null });
  }

  return clusters;
}

function collectTermMeta(elements: NormalizedElement[]): {
  mechMeta: Map<string, TermMeta>;
  skillMeta: Map<string, TermMeta>;
} {
  const mechMeta = new Map<string, TermMeta>();
  const skillMeta = new Map<string, TermMeta>();

  for (const el of elements) {
    for (const m of el.normalized.mechanics) {
      const key = m.name.toLowerCase();
      const existing = mechMeta.get(key);
      if (existing) {
        existing.count++;
        if (m.category) existing.categories.push(m.category);
      } else {
        mechMeta.set(key, { count: 1, categories: m.category ? [m.category] : [] });
      }
    }
    for (const s of el.normalized.skills) {
      const key = s.name.toLowerCase();
      const existing = skillMeta.get(key);
      if (existing) {
        existing.count++;
        if (s.category) existing.categories.push(s.category);
      } else {
        skillMeta.set(key, { count: 1, categories: s.category ? [s.category] : [] });
      }
    }
  }

  return { mechMeta, skillMeta };
}

function buildThesaurusMap(thesaurus: VocabularyMap): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of thesaurus.mechanics) {
    map.set(c.canonical.toLowerCase(), c.canonical);
    for (const v of c.variants) {
      map.set(v.toLowerCase(), c.canonical);
    }
  }
  for (const c of thesaurus.skills) {
    map.set(c.canonical.toLowerCase(), c.canonical);
    for (const v of c.variants) {
      map.set(v.toLowerCase(), c.canonical);
    }
  }
  return map;
}

function thesaurusClustersFor(
  thesaurus: VocabularyMap,
  kind: "mechanics" | "skills",
  remainingTermLower: Set<string>,
): VocabularyCluster[] {
  const clusters: VocabularyCluster[] = [];
  const raw = kind === "mechanics" ? thesaurus.mechanics : thesaurus.skills;

  for (const c of raw) {
    const allVariants = [c.canonical, ...c.variants]
      .filter(t => remainingTermLower.has(t.toLowerCase()));
    if (allVariants.length === 0) continue;

    const canonical = c.canonical;
    const variants = allVariants.filter(t => t.toLowerCase() !== canonical.toLowerCase());

    clusters.push({ canonical, variants, parent: c.parent });
  }

  return clusters;
}

export function canonicalizeVocabulary(
  elements: NormalizedElement[],
  thesaurus?: VocabularyMap,
): VocabularyMap {
  const { mechMeta, skillMeta } = collectTermMeta(elements);
  const seeds = buildTranslationSeeds(elements);
  const seedCanonicals = new Set([
    ...seeds.mechMap.values(),
    ...seeds.skillMap.values(),
  ].map(t => t.toLowerCase()));

  const thesaurusMap = thesaurus ? buildThesaurusMap(thesaurus) : new Map<string, string>();

  const allUniqueMechs = [...new Set(elements.flatMap(el =>
    el.normalized.mechanics.map(m => m.name),
  ))].filter(t => t.length > 0);

  const allUniqueSkills = [...new Set(elements.flatMap(el =>
    el.normalized.skills.map(s => s.name),
  ))].filter(t => t.length > 0);

  const thesaurusCoveredMechs = new Set(allUniqueMechs.filter(t => thesaurusMap.has(t.toLowerCase())));
  const thesaurusCoveredSkills = new Set(allUniqueSkills.filter(t => thesaurusMap.has(t.toLowerCase())));

  const remainingMechs = allUniqueMechs.filter(t => !thesaurusCoveredMechs.has(t));
  const remainingSkills = allUniqueSkills.filter(t => !thesaurusCoveredSkills.has(t));

  const mechThesaurus = thesaurusClustersFor(
    thesaurus ?? { mechanics: [], skills: [] },
    "mechanics",
    new Set(allUniqueMechs.map(t => t.toLowerCase())),
  );

  const skillThesaurus = thesaurusClustersFor(
    thesaurus ?? { mechanics: [], skills: [] },
    "skills",
    new Set(allUniqueSkills.map(t => t.toLowerCase())),
  );

  const mechClusters = clusterTerms(remainingMechs, mechMeta, seedCanonicals, {
    jaccardThreshold: 0.5,
    levenshteinThreshold: 0.6,
  });

  const skillClusters = clusterTerms(remainingSkills, skillMeta, seedCanonicals, {
    jaccardThreshold: 0.5,
    levenshteinThreshold: 0.6,
  });

  for (const [deTerm, enCanonical] of seeds.mechMap) {
    let found = false;
    for (const cluster of mechClusters) {
      if (cluster.canonical.toLowerCase() === enCanonical.toLowerCase()) {
        if (!cluster.variants.some(v => v.toLowerCase() === deTerm)) {
          cluster.variants.push(deTerm);
        }
        found = true;
        break;
      }
      if (cluster.variants.some(v => v.toLowerCase() === deTerm)) {
        cluster.variants = [enCanonical, ...cluster.variants.filter(v => v.toLowerCase() !== deTerm && v.toLowerCase() !== enCanonical.toLowerCase())];
        cluster.canonical = enCanonical;
        found = true;
        break;
      }
    }
    if (!found) {
      mechClusters.push({ canonical: enCanonical, variants: [deTerm], parent: null });
    }
  }

  for (const [deTerm, enCanonical] of seeds.skillMap) {
    let found = false;
    for (const cluster of skillClusters) {
      if (cluster.canonical.toLowerCase() === enCanonical.toLowerCase()) {
        if (!cluster.variants.some(v => v.toLowerCase() === deTerm)) {
          cluster.variants.push(deTerm);
        }
        found = true;
        break;
      }
      if (cluster.variants.some(v => v.toLowerCase() === deTerm)) {
        cluster.variants = [enCanonical, ...cluster.variants.filter(v => v.toLowerCase() !== deTerm && v.toLowerCase() !== enCanonical.toLowerCase())];
        cluster.canonical = enCanonical;
        found = true;
        break;
      }
    }
    if (!found) {
      skillClusters.push({ canonical: enCanonical, variants: [deTerm], parent: null });
    }
  }

  return {
    mechanics: [...mechThesaurus, ...mechClusters],
    skills: [...skillThesaurus, ...skillClusters],
  };
}
