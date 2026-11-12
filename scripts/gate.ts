#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The nine quality gates that decide whether a pipeline run may be published.
 *
 * Reads the artifacts under `output/`, writes `output/run-report.json` and
 * exits non-zero when any gate fails. The report shape and numbers are the
 * contract the deployment checks — keep them stable.
 */

const storage = process.env.STORAGE_PATH || process.cwd();
const outputDir = join(storage, "output");

function readJson(relativePath: string): any {
  const filePath = join(storage, relativePath);
  if (!existsSync(filePath)) {
    throw new Error(`Gate input missing: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Linear-interpolation percentile, matching the published report. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const position = ((sorted.length - 1) * p) / 100;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function countBy(
  items: any[],
  key: (item: any) => string,
  order: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of order) counts[name] = 0;
  for (const item of items) {
    const name = key(item);
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

const SOURCES = [
  { key: "improwiki", file: "improwiki.json" },
  { key: "learnimprov", file: "learnimprov.json" },
];

const normalizedWorks = readJson(join("output", "normalized-works.json"));
const workMerges = readJson("work-merges.json");
const artifact = readJson(join("output", "improbib.json"));
const graph = readJson(join("output", "graph.json"));

const works: any[] = Array.isArray(normalizedWorks.works)
  ? normalizedWorks.works
  : [];
const mergeGroups: any[] = Array.isArray(workMerges.merges)
  ? workMerges.merges
  : [];
const elements: any[] = Array.isArray(artifact.elements)
  ? artifact.elements
  : [];
const artifactWorks: any[] = Array.isArray(artifact.works)
  ? artifact.works
  : [];

const groupKey = (ids: string[]): string => [...ids].sort().join("|");

// ---------------------------------------------------------------------------
// 1. normalized works
// ---------------------------------------------------------------------------

const memberIdSet = new Set<string>();
for (const work of works) {
  for (const id of work.memberIds || []) memberIdSet.add(id);
}

const expectedIds: string[] = mergeGroups.flatMap((group) => group.ids || []);
const expectedIdSet = new Set(expectedIds);

const missingIds = [...expectedIdSet].filter((id) => !memberIdSet.has(id));
const extraIds = [...memberIdSet].filter((id) => !expectedIdSet.has(id));

const groupMatchProblems: any[] = [];
for (const group of mergeGroups) {
  const key = groupKey(group.ids || []);
  const matches = works.filter(
    (work) => groupKey(work.memberIds || []) === key
  );
  if (matches.length !== 1) {
    groupMatchProblems.push({ ids: group.ids || [], matches: matches.length });
  }
}

const gate1 = {
  pass:
    missingIds.length === 0 &&
    extraIds.length === 0 &&
    groupMatchProblems.length === 0 &&
    works.every(
      (work) =>
        text(work.normalized?.summary) && text(work.normalized?.description)
    ),
  workCount: works.length,
  memberIdCount: memberIdSet.size,
  expectedMemberIds: expectedIds.length,
  missingIds,
  extraIds,
  emptySummaries: works.filter((work) => !text(work.normalized?.summary))
    .length,
  emptyDescriptions: works.filter(
    (work) => !text(work.normalized?.description)
  ).length,
  groupMatchProblems,
};

// ---------------------------------------------------------------------------
// 2. per-source coverage
// ---------------------------------------------------------------------------

const memberToWork = new Map<string, any>();
for (const work of works) {
  for (const id of work.memberIds || []) memberToWork.set(id, work);
}

const foundMergedAnywhere = new Set<string>();
const sourceReports: Record<string, any> = {};

for (const source of SOURCES) {
  const data = readJson(join("output", "normalized", source.file));
  const sourceElements: any[] = Array.isArray(data.elements)
    ? data.elements
    : [];
  const byId = new Map<string, any>();
  for (const element of sourceElements) byId.set(element.identifier, element);

  let mergedMembersHere = 0;
  let summaryMismatches = 0;
  const summaryMismatchSamples: any[] = [];

  for (const [id, work] of memberToWork) {
    const element = byId.get(id);
    if (!element) continue;
    mergedMembersHere++;
    foundMergedAnywhere.add(id);

    const elementSummary = text(element.normalized?.summary);
    const workSummary = text(work.normalized?.summary);
    if (elementSummary !== workSummary) {
      summaryMismatches++;
      if (summaryMismatchSamples.length < 3) {
        summaryMismatchSamples.push({
          id,
          element: elementSummary.slice(0, 120),
          work: workSummary.slice(0, 120),
        });
      }
    }
  }

  sourceReports[source.key] = {
    file: source.file,
    elementCount: sourceElements.length,
    emptySummaries: sourceElements.filter(
      (element) => !text(element.normalized?.summary)
    ).length,
    mergedMembersHere,
    summaryMismatches,
    summaryMismatchSamples,
  };
}

const missingMergedAnywhere = [...memberToWork.keys()].filter(
  (id) => !foundMergedAnywhere.has(id)
);

const gate2 = {
  pass:
    missingMergedAnywhere.length === 0 &&
    Object.values(sourceReports).every(
      (source: any) =>
        source.emptySummaries === 0 && source.summaryMismatches === 0
    ),
  sources: sourceReports,
  missingMergedAnywhere,
};

// ---------------------------------------------------------------------------
// 3. steps distribution
// ---------------------------------------------------------------------------

const stepCounts: number[] = [];
const namesOver8Steps: string[] = [];
let withHowToPlay = 0;

for (const element of elements) {
  const howToPlay = element.normalized?.howToPlay;
  if (!howToPlay) continue;
  withHowToPlay++;
  const steps = Array.isArray(howToPlay.steps) ? howToPlay.steps.length : 0;
  stepCounts.push(steps);
  if (steps > 8) namesOver8Steps.push(element.name);
}

const sortedSteps = [...stepCounts].sort((a, b) => a - b);
const maxSteps = sortedSteps.length ? sortedSteps[sortedSteps.length - 1] : 0;
const gate3Pass = namesOver8Steps.length === 0;

const gate3 = {
  p50: Math.round(percentile(sortedSteps, 50)),
  p95: Math.round(percentile(sortedSteps, 95)),
  max: maxSteps,
  elementsOver8Steps: namesOver8Steps.length,
  namesOver8Steps,
  withHowToPlay,
  totalElements: elements.length,
};

// ---------------------------------------------------------------------------
// 4. skills
// ---------------------------------------------------------------------------

const skillIds: string[] = Array.isArray(artifact.skills)
  ? artifact.skills.map((skill: any) => skill.id)
  : [];
const skillDistribution: Record<string, number> = {};
for (const id of skillIds) skillDistribution[id] = 0;

let invalidSkillValues = 0;
const invalidSkillSamples: any[] = [];
let elementsWithZeroSkills = 0;

for (const element of elements) {
  const skills = Array.isArray(element.normalized?.skills)
    ? element.normalized.skills
    : [];
  if (skills.length === 0) elementsWithZeroSkills++;

  for (const skill of skills) {
    if (typeof skill === "string" && skill in skillDistribution) {
      skillDistribution[skill]++;
    } else {
      invalidSkillValues++;
      if (invalidSkillSamples.length < 5) {
        invalidSkillSamples.push({ element: element.name, value: skill });
      }
    }
  }
}

const gate4 = {
  pass: invalidSkillValues === 0,
  invalidValues: invalidSkillValues,
  invalidSamples: invalidSkillSamples,
  elementsWithZeroSkills,
  distribution: skillDistribution,
};

// ---------------------------------------------------------------------------
// 5. practical fields
// ---------------------------------------------------------------------------

const usageDistribution: Record<string, number> = { rehearsal: 0, show: 0 };
let usageNonEmpty = 0;
let usageEmpty = 0;
let usageInvalidValues = 0;
let requiresNonEmpty = 0;

for (const element of elements) {
  const practical = element.normalized?.practical || {};
  const usage = Array.isArray(practical.usage) ? practical.usage : [];

  if (usage.length > 0) usageNonEmpty++;
  else usageEmpty++;

  for (const value of usage) {
    if (value === "rehearsal" || value === "show") {
      usageDistribution[value]++;
    } else {
      usageInvalidValues++;
    }
  }

  if (text(practical.requires)) requiresNonEmpty++;
}

const usageNonEmptyShare = elements.length
  ? round4(usageNonEmpty / elements.length)
  : 0;
const requiresNonEmptyShare = elements.length
  ? round4(requiresNonEmpty / elements.length)
  : 0;
const gate5Pass = usageInvalidValues === 0;

const gate5 = {
  usageNonEmptyShare,
  usageNonEmpty,
  usageEmpty,
  usageDistribution,
  usageInvalidValues,
  requiresNonEmptyShare,
  requiresNonEmpty,
};

// ---------------------------------------------------------------------------
// 6. languages
// ---------------------------------------------------------------------------

const normalizedSourceElements = new Map<string, any>();
for (const source of SOURCES) {
  const data = readJson(join("output", "normalized", source.file));
  for (const element of data.elements || []) {
    normalizedSourceElements.set(element.identifier, element);
  }
}

let worksContradictingLanguage = 0;
let worksWithMixedOrMissingLanguage = 0;
const languageIssues: any[] = [];

for (const work of works) {
  const languages = new Set<string>();
  let missingLanguage = false;

  for (const id of work.memberIds || []) {
    const element = normalizedSourceElements.get(id);
    const language = text(element?.languageCode);
    if (!language) missingLanguage = true;
    else languages.add(language);
  }

  const workLanguage = text(work.languageCode);
  const mixed = missingLanguage || !workLanguage || languages.size > 1;

  if (mixed) {
    worksWithMixedOrMissingLanguage++;
    languageIssues.push({
      workId: work.id,
      reason: "mixed or missing language",
      languages: [...languages],
      workLanguage,
    });
  } else if ([...languages].some((language) => language !== workLanguage)) {
    worksContradictingLanguage++;
    languageIssues.push({
      workId: work.id,
      reason: "member language differs from work language",
      languages: [...languages],
      workLanguage,
    });
  }
}

const ambiguousRatio = works.length
  ? round4(worksWithMixedOrMissingLanguage / works.length)
  : 0;

const gate6 = {
  worksChecked: works.length,
  worksContradictingLanguage,
  worksWithMixedOrMissingLanguage,
  ambiguousRatio,
  issues: languageIssues,
  pass:
    worksContradictingLanguage === 0 &&
    worksWithMixedOrMissingLanguage === 0,
};

// ---------------------------------------------------------------------------
// 7. artifact
// ---------------------------------------------------------------------------

let worksWithZeroSources = 0;
let worksMissingLicense = 0;
const missingLicenseSamples: any[] = [];

for (const work of artifactWorks) {
  const sources = Array.isArray(work.sources) ? work.sources : [];
  if (sources.length === 0) worksWithZeroSources++;

  const missing = sources.filter(
    (source: any) => !text(source.licenseSpdxIdentifier)
  );
  if (missing.length > 0) {
    worksMissingLicense++;
    if (missingLicenseSamples.length < 5) {
      missingLicenseSamples.push({
        workId: work.id,
        work: work.name,
        source: missing[0].identifier,
      });
    }
  }
}

const mergedProblems: any[] = [];
for (const group of mergeGroups) {
  const key = groupKey(group.ids || []);
  const matches = artifactWorks.filter(
    (work) => groupKey(work.memberIds || []) === key
  );
  if (matches.length !== 1) {
    mergedProblems.push({ ids: group.ids || [], matches: matches.length });
  }
}

const gate7 = {
  pass:
    worksWithZeroSources === 0 &&
    worksMissingLicense === 0 &&
    mergedProblems.length === 0,
  elementCount: elements.length,
  workCount: artifactWorks.length,
  worksWithZeroSources,
  worksMissingLicense,
  missingLicenseSamples,
  mergedGroupsNotExactlyOneWork: mergedProblems.length,
  mergedProblems,
};

// ---------------------------------------------------------------------------
// 8. duplicate hashes
// ---------------------------------------------------------------------------

const hashGroups = new Map<string, string[]>();
for (const element of elements) {
  const hash = text(element.normalized?.contentHash);
  if (!hash) continue;
  const ids = hashGroups.get(hash) || [];
  ids.push(element.identifier);
  hashGroups.set(hash, ids);
}

const duplicateGroups = [...hashGroups.entries()].filter(
  ([, ids]) => ids.length > 1
);
const expectedDuplicateSets = new Set(
  mergeGroups
    .filter((group) => (group.ids || []).length > 1)
    .map((group) => groupKey(group.ids))
);
const unexpectedDuplicateGroups = duplicateGroups.filter(
  ([, ids]) => !expectedDuplicateSets.has(groupKey(ids))
);

const gate8Pass = unexpectedDuplicateGroups.length === 0;

const gate8 = {
  duplicateHashGroups: duplicateGroups.length,
  expectedMergedGroups: expectedDuplicateSets.size,
  unexpectedDuplicateGroups: unexpectedDuplicateGroups.length,
  unexpectedSamples: unexpectedDuplicateGroups.slice(0, 5).map(([hash, ids]) => ({
    hash,
    ids,
  })),
};

// ---------------------------------------------------------------------------
// 9. graph
// ---------------------------------------------------------------------------

const nodes: any[] = Array.isArray(graph.nodes) ? graph.nodes : [];
const edges: any[] = Array.isArray(graph.edges) ? graph.edges : [];
const nodeIds = new Set(nodes.map((node) => node.id));
const invalidEdges = edges.filter(
  (edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to)
).length;
const graphCountsMatch =
  graph.meta?.nodeCount === nodes.length && graph.meta?.edgeCount === edges.length;

const gate9 = {
  pass: invalidEdges === 0 && graphCountsMatch,
  nodes: nodes.length,
  edges: edges.length,
  nodeTypes: countBy(nodes, (node) => node.type, [
    "Element",
    "Mechanic",
    "Skill",
    "Tag",
    "Source",
    "Requirement",
  ]),
  edgeTypes: countBy(edges, (edge) => edge.type, [
    "sourcedFrom",
    "translationOf",
    "canonicalOf",
    "hasMechanic",
    "trainsSkill",
    "hasTag",
    "requires",
    "buildsOn",
  ]),
};

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const gatePasses = [
  gate1.pass,
  gate2.pass,
  gate3Pass,
  gate4.pass,
  gate5Pass,
  gate6.pass,
  gate7.pass,
  gate8Pass,
  gate9.pass,
];

const report = {
  generatedAt: new Date().toISOString(),
  storage,
  pass: gatePasses.every(Boolean),
  gates: {
    "1_normalized_works": gate1,
    "2_per_source": gate2,
    "3_steps": gate3,
    "4_skills": gate4,
    "5_practical": gate5,
    "6_languages": gate6,
    "7_artifact": gate7,
    "8_duplicate_hashes": gate8,
    "9_graph": gate9,
  },
};

const reportPath = join(outputDir, "run-report.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

for (const [index, passed] of gatePasses.entries()) {
  const name = Object.keys(report.gates)[index];
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
}
console.log(`\n${report.pass ? "All gates passed" : "Gate check failed"} — ${reportPath}`);

if (!report.pass) process.exit(1);
