# Plan: Knowledge Graph Ontology Documentation

## Summary

Four phases, each delivering a testable checkpoint. Derived from `structure.md` and `design.md`. Implementation order: ontology core → JSON export → CLI completion + vocab cleanup → docs + CI.

**Deviations from structure:** None. All files, types, and checkpoints match structure.md exactly.

---

## Phase 1: Ontology Core + Type Enforcement

### Files

| File | Action | Lines |
|------|--------|-------|
| `src/graph/ontology.ts` | **CREATE** | full file |
| `src/graph/derive.ts` | **MODIFY** | lines 12, 42, 413–424 |

---

### `src/graph/ontology.ts` — CREATE

Full content:

```ts
import type { VocabularyMap, VocabularyCluster } from "../normalize/llm-client";

export const NODE_TYPES = {
  Element: {
    discriminator: "canonical",
    properties: {
      id: "string (md5)",
      label: "string",
      description: "string",
      summary: "string",
      howToPlay: "{ steps: { action: string; role?: string; constraint?: string }[] } | null",
      mechanics: "string[]",
      skills: "string[]",
      tags: "string[]",
      difficulty: "string | null",
      typicalDurationMinutes: "number | null",
      energyLevel: "string | null",
      groupSize: "{ min?: number; max?: number } | null",
      playerCountMin: "number | null",
      playerCountMax: "number | null",
      url: "string | null",
      sources: "{ sourceName: string; url: string; identifier: string }[] | null",
      sourceName: "string | undefined",
      languageCode: "string",
    },
    idRule: "md5(element:{label.lowercase()})",
    prefixes: { canonical: "canon", source: "element" },
    createdIn: "Phase 1 (source) / Phase 2 (canonical)",
  },
  Mechanic: {
    properties: {
      id: "string (md5)",
      label: "string (vocabulary-canonicalized)",
    },
    idRule: "md5(mechanic:{label.lowercase()})",
    createdIn: "Phase 3",
  },
  Skill: {
    properties: {
      id: "string (md5)",
      label: "string (vocabulary-canonicalized)",
    },
    idRule: "md5(skill:{label.lowercase()})",
    createdIn: "Phase 3",
  },
  Tag: {
    properties: {
      id: "string (md5)",
      label: "string (raw, not vocabulary-canonicalized)",
    },
    idRule: "md5(tag:{label.lowercase()})",
    createdIn: "Phase 3",
  },
  Source: {
    properties: {
      id: "string (md5)",
      label: "string (sourceName)",
    },
    idRule: "md5(source:{label.lowercase()})",
    createdIn: "Phase 1",
  },
  Requirement: {
    properties: {
      id: "string (md5)",
      label: "string",
    },
    idRule: "md5(requirement:{label.lowercase()})",
    createdIn: "Phase 3a",
  },
} as const;

export const EDGE_TYPES = {
  sourcedFrom: {
    from: "Element",
    to: "Source",
    cardinality: "N:1 (one element → one source)",
    confidence: { tier: "deterministic" },
    semantics: "this element was scraped from this source",
    derivedBy: "sourceName field on NormalizedElement",
  },
  canonicalOf: {
    from: "Element (canonical)",
    to: "Element (source)",
    confidence: {
      tier: "matching",
      range: [0, 1],
      drivenBy: "average of relatedIdentifier + translation link scores",
    },
    semantics: "source element is an instance of this canonical element (same game, same language)",
    derivedBy: "Union-Find clustering of relatedIdentifiers + translation links → createCanonicalElement()",
  },
  translationOf: {
    from: "Element (canonical)",
    to: "Element (canonical)",
    cardinality: "1:1",
    confidence: { tier: "deterministic", value: 1.0 },
    semantics: "EN canonical ↔ DE canonical (same game concept)",
    derivedBy: "translationLinkEnIdentifier / translationLinkDeIdentifier on source elements",
  },
  variationOf: {
    from: "Element (source, derived)",
    to: "Element (source, parent)",
    cardinality: "N:1",
    confidence: { tier: "deterministic", value: 1.0 },
    semantics: "derived element is a variant/child of parent element",
    derivedBy: "derivedElements[] field → variationOf edge from child to parent",
  },
  hasMechanic: {
    from: "Element",
    to: "Mechanic",
    cardinality: "N:M",
    confidence: { tier: "deterministic" },
    semantics: "element exercises this mechanic",
    derivedBy: "element mechanics resolved through vocabulary map",
  },
  trainsSkill: {
    from: "Element",
    to: "Skill",
    cardinality: "N:M",
    confidence: { tier: "deterministic" },
    semantics: "element trains this skill",
    derivedBy: "element skills resolved through vocabulary map",
  },
  hasTag: {
    from: "Element",
    to: "Tag",
    cardinality: "N:M",
    confidence: { tier: "deterministic" },
    semantics: "element has this tag (not vocabulary-canonicalized)",
    derivedBy: "element tags (raw, no vocabulary resolution)",
  },
  requires: {
    from: "Element",
    to: "Requirement",
    cardinality: "N:M",
    confidence: { tier: "deterministic" },
    semantics: "element requires this resource/condition for play",
    derivedBy: "deriveRequirements() static mapping: mechanics+tags → requirement labels",
  },
  buildsOn: {
    from: "Element",
    to: "Element",
    cardinality: "N:M",
    confidence: { tier: "heuristic" },
    semantics: "superset element builds on the mechanics of subset element (proper subset + difficulty/duration constraints)",
    derivedBy: "mechanic proper-subset check for same-source non-canonical elements",
  },
} as const;

export type NodeType = keyof typeof NODE_TYPES;
export type EdgeType = keyof typeof EDGE_TYPES;

// ── Ontology JSON export (Phase 2) ──

export interface OntologyJSON {
  meta: {
    derivedAt: string;
    nodeTypeCount: number;
    edgeTypeCount: number;
  };
  nodeTypes: Record<NodeType, {
    description: typeof NODE_TYPES[NodeType];
    exampleIds: string[];
  }>;
  edgeTypes: Record<EdgeType, {
    description: typeof EDGE_TYPES[EdgeType];
    examples: Array<{ from: string; to: string; confidence?: number }>;
  }>;
  vocabulary: {
    mechanics: string[];
    skills: string[];
  };
  confidenceTiers: {
    deterministic: { meaning: string; edges: string[] };
    matching: { meaning: string; edges: string[] };
    heuristic: { meaning: string; edges: string[] };
  };
}

export function exportOntologyJSON(
  vocab: VocabularyMap,
  examples: Partial<Record<EdgeType, Array<{ from: string; to: string; confidence?: number }>>>,
): OntologyJSON {
  const tierMap: Record<string, string[]> = { deterministic: [], matching: [], heuristic: [] };
  for (const [key, def] of Object.entries(EDGE_TYPES)) {
    const tier = def.confidence?.tier ?? "deterministic";
    tierMap[tier].push(key);
  }

  const nodeTypes = {} as OntologyJSON["nodeTypes"];
  for (const key of Object.keys(NODE_TYPES) as NodeType[]) {
    nodeTypes[key] = {
      description: NODE_TYPES[key],
      exampleIds: [],
    };
  }

  const edgeTypes = {} as OntologyJSON["edgeTypes"];
  for (const key of Object.keys(EDGE_TYPES) as EdgeType[]) {
    edgeTypes[key] = {
      description: EDGE_TYPES[key],
      examples: examples[key] ?? [],
    };
  }

  const flatLabels = (clusters: VocabularyCluster[]): string[] =>
    clusters.map(c => c.canonical);

  return {
    meta: {
      derivedAt: new Date().toISOString(),
      nodeTypeCount: Object.keys(NODE_TYPES).length,
      edgeTypeCount: Object.keys(EDGE_TYPES).length,
    },
    nodeTypes,
    edgeTypes,
    vocabulary: {
      mechanics: flatLabels(vocab.mechanics),
      skills: flatLabels(vocab.skills),
    },
    confidenceTiers: {
      deterministic: { meaning: "always correct, no confidence field needed", edges: tierMap.deterministic },
      matching: { meaning: "from dedup matching scores, lower = needs review", edges: tierMap.matching },
      heuristic: { meaning: "rule-inferred, may be wrong — audit recommended", edges: tierMap.heuristic },
    },
  };
}
```

---

### `src/graph/derive.ts` — MODIFY

#### Change A1: Add import after line 8

Insert after `import { deriveRequirements } from "./requirement-mapping";` (line 8):

```ts
import { EDGE_TYPES } from "./ontology";
import type { EdgeType, NodeType } from "./ontology";
```

#### Change A2: Replace `GraphNode.type` (line 12)

Old:
```ts
  type: "Element" | "Mechanic" | "Skill" | "Tag" | "Source" | "Requirement";
```

New:
```ts
  type: NodeType;
```

#### Change A3: Replace `GraphEdge.type` (line 42)

Old:
```ts
  type: "hasMechanic" | "trainsSkill" | "hasTag" | "sourcedFrom" | "translationOf" | "derivedFrom" | "canonicalOf" | "requires" | "buildsOn" | "variationOf";
```

New:
```ts
  type: EdgeType;
```

Note: `derivedFrom` disappears because `EdgeType` = `keyof typeof EDGE_TYPES` and `derivedFrom` is not a key of `EDGE_TYPES`.

#### Change A4: Delete `dedupSteps()` (lines 413–424)

Delete the entire function and the blank line preceding it (the blank line after `pickLongestHowToPlay`).

#### Change A5: Add `writeOntology()` (insert before `if (import.meta.main)` at line 852)

```ts
export async function writeOntology(graph: KnowledgeGraph): Promise<void> {
  const vocabPath = path.join(process.cwd(), "output", "vocabulary.json");
  let vocabulary: VocabularyMap = { mechanics: [], skills: [] };
  const vf = Bun.file(vocabPath);
  if (await vf.exists()) {
    vocabulary = await vf.json();
  }

  const examples: Partial<Record<string, Array<{ from: string; to: string; confidence?: number }>>> = {};
  for (const edgeType of Object.keys(EDGE_TYPES)) {
    const ofType = graph.edges.filter(e => e.type === edgeType);
    const sample = ofType.slice(0, 3).map(e => ({
      from: e.from,
      to: e.to,
      ...(e.confidence !== undefined ? { confidence: e.confidence } : {}),
    }));
    if (sample.length > 0) {
      examples[edgeType] = sample;
    }
  }

  const { exportOntologyJSON } = await import("./ontology");
  const json = exportOntologyJSON(vocabulary, examples);

  const outPath = path.join(process.cwd(), "output", "ontology.json");
  await mkdir(path.dirname(outPath), { recursive: true });
  await Bun.write(outPath, JSON.stringify(json, null, 2));
  console.log(`Ontology: ${json.meta.nodeTypeCount} node types, ${json.meta.edgeTypeCount} edge types`);
  console.log(`Wrote ${outPath}`);
}
```

#### Change A6: Call `writeOntology()` from `writeGraph()` (after `console.log(\`Wrote ${outPath}\`);` at line 847)

```ts
  await writeOntology(graph);
```

---

### Verification (Phase 1)

- [ ] `bun test` — all existing tests pass, 0 regressions
- [ ] TypeScript: adding `"bogusEdge"` to `EDGE_TYPES` is NOT needed — verify by adding a bogus edge type string in `derive.ts` and confirming TypeScript rejects it at compile time
- [ ] `bun run src/normalize/normalize.ts --graph` — produces `output/graph.json` with identical node/edge counts as before
- [ ] Manual: confirm `derivedFrom` no longer appears in `GraphEdge.type`; `dedupSteps()` is gone from `derive.ts`

---

## Phase 2: Ontology JSON Export + HTTP Endpoint

### Files

| File | Action |
|------|--------|
| `src/graph/ontology.ts` | (already done in Phase 1 — `OntologyJSON` + `exportOntologyJSON()` are included) |
| `src/graph/derive.ts` | (already done in Phase 1 — `writeOntology()` + call from `writeGraph()` are included) |
| `src/serve.ts` | **MODIFY** — add `GET /ontology.json` handler |

---

### `src/serve.ts` — add `GET /ontology.json`

Insert after the `/graph.json` handler block (after line 313):

```ts
    if (url.pathname === "/ontology.json") {
      const res = serveFile(path.join(process.cwd(), "output", "ontology.json"), req);
      if (res) return res;
      return jsonResponse({ error: "ontology.json not found — derive graph first via POST /api/graph" }, req);
    }
```

---

### Verification (Phase 2)

- [ ] `bun run src/normalize/normalize.ts --graph` — `output/ontology.json` is created with all sections populated
- [ ] `bun run src/serve.ts` (in background), then `curl http://localhost:5000/ontology.json` — returns 200 with valid JSON
- [ ] Spot-check: `ontology.json` contains real edge IDs matching `graph.json`
- [ ] Spot-check: `confidenceTiers.deterministic.edges` includes `sourcedFrom`, `translationOf`, `variationOf`, `hasMechanic`, `trainsSkill`, `hasTag`, `requires`
- [ ] Spot-check: `confidenceTiers.matching.edges` includes only `canonicalOf`
- [ ] Spot-check: `confidenceTiers.heuristic.edges` includes only `buildsOn`
- [ ] Spot-check: `vocabulary.mechanics` and `vocabulary.skills` are non-empty arrays of canonical names
- [ ] `ontology.json` is valid per `OntologyJSON` structure (nodeTypes has 6 entries, edgeTypes has 9 entries)

---

## Phase 3: Override CLI Completion + Vocabulary Cleanup

### Files

| File | Action | Lines |
|------|--------|-------|
| `src/review.ts` | **MODIFY** | add 6 CLI commands; expand edgeType cast; update `printUsage()` |
| `src/normalize/llm-client.ts` | **MODIFY** | remove `parent` from interface (L23), prompt (L360–361, L364), parse (L375, L380) |
| `src/normalize/vocab-cluster.ts` | **MODIFY** | remove `parent: null` from L212, L284, L357, L379 |
| `src/normalize/__testdata__/vocabulary.test.ts` | **MODIFY** | remove `parent` from fixtures (L74, L75, L78, L100, L229); remove tests (L239–261) |

---

### `src/review.ts` — MODIFY

#### Change B1: Update import

Add at top (after line 4):
```ts
import type { EdgeOverride } from "./graph/overrides";
```

#### Change B2: Expand `--remove-edge` edgeType (line 444)

Old:
```ts
      edgeType: args[2] as "hasMechanic" | "trainsSkill" | "hasTag",
```

New:
```ts
      edgeType: args[2] as EdgeOverride["edgeType"],
```

#### Change B3: Expand `--add-edge` edgeType (line 455)

Old:
```ts
      edgeType: args[2] as "hasMechanic" | "trainsSkill" | "hasTag",
```

New:
```ts
      edgeType: args[2] as EdgeOverride["edgeType"],
```

#### Change B4: Add 6 new CLI commands

Insert after the `--add-edge` block (after line 459):

```ts
  if (mode === "--add-requires") {
    if (args.length < 3) printUsage();
    await addOverride({
      type: "add_requires",
      elementId: args[1],
      requirementLabel: args[2],
    });
    return;
  }

  if (mode === "--remove-requires") {
    if (args.length < 3) printUsage();
    await addOverride({
      type: "remove_requires",
      elementId: args[1],
      requirementLabel: args[2],
    });
    return;
  }

  if (mode === "--add-buildsOn") {
    if (args.length < 3) printUsage();
    await addOverride({
      type: "add_buildsOn",
      fromElementId: args[1],
      toElementId: args[2],
    });
    return;
  }

  if (mode === "--remove-buildsOn") {
    if (args.length < 3) printUsage();
    await addOverride({
      type: "remove_buildsOn",
      fromElementId: args[1],
      toElementId: args[2],
    });
    return;
  }

  if (mode === "--add-variationOf") {
    if (args.length < 3) printUsage();
    await addOverride({
      type: "add_variationOf",
      fromElementId: args[1],
      toElementId: args[2],
    });
    return;
  }

  if (mode === "--remove-variationOf") {
    if (args.length < 3) printUsage();
    await addOverride({
      type: "remove_variationOf",
      fromElementId: args[1],
      toElementId: args[2],
    });
    return;
  }
```

#### Change B5: Update `printUsage()` (lines 10–17)

Old:
```ts
  console.log("Modes:");
  console.log("  --clusters       List clusters sorted by lowest dedup confidence");
  console.log("  --hubs           Show top skill/mechanic/tag hubs by degree");
  console.log("  --element <id>   Show full details for an element (by ID or name substring)");
  console.log("  --random <N>     Show N random canonical elements with their edges");
  console.log("  --reject <a> <b> Add reject_match override (use element IDs)");
  console.log("  --add-match <a> <b>  Add add_match override (use element IDs)");
  console.log("  --remove-edge <elt> <type> <target>  Add remove_edge override");
  console.log("  --add-edge <elt> <type> <target>     Add add_edge override");
```

New:
```ts
  console.log("Modes:");
  console.log("  --clusters              List clusters sorted by lowest dedup confidence");
  console.log("  --hubs                  Show top skill/mechanic/tag hubs by degree");
  console.log("  --element <id>          Show full details for an element (by ID or name substring)");
  console.log("  --random <N>            Show N random canonical elements with their edges");
  console.log("  --reject <a> <b>        Add reject_match override (use element IDs)");
  console.log("  --add-match <a> <b>     Add add_match override (use element IDs)");
  console.log("  --remove-edge <elt> <type> <target>  Add remove_edge override");
  console.log("  --add-edge <elt> <type> <target>     Add add_edge override");
  console.log("  --add-requires <id> <label>          Add add_requires override");
  console.log("  --remove-requires <id> <label>       Add remove_requires override");
  console.log("  --add-buildsOn <from> <to>           Add add_buildsOn override");
  console.log("  --remove-buildsOn <from> <to>        Add remove_buildsOn override");
  console.log("  --add-variationOf <from> <to>        Add add_variationOf override");
  console.log("  --remove-variationOf <from> <to>     Add remove_variationOf override");
```

---

### `src/normalize/llm-client.ts` — MODIFY

#### Change C1: Remove `parent` from `VocabularyCluster` (line 23)

Old (line 23):
```ts
  parent: string | null;
```

New: delete this line (interface becomes `{ canonical: string; variants: string[]; }`).

#### Change C2: Remove `parent` from prompt example (line 360)

Old:
```ts
   "mechanics": [{"canonical": "canonical name", "variants": ["synonym1", "synonym2"], "parent": null}],
```

New:
```ts
   "mechanics": [{"canonical": "canonical name", "variants": ["synonym1", "synonym2"]}],
```

#### Change C3: Remove `parent` from prompt example (line 361)

Old:
```ts
   "skills": [{"canonical": "canonical name", "variants": ["synonym1", "synonym2"], "parent": null}]
```

New:
```ts
   "skills": [{"canonical": "canonical name", "variants": ["synonym1", "synonym2"]}]
```

#### Change C4: Remove `parent is always null` line (line 364)

Old (line 364):
```ts
parent is always null — reserved for future taxonomy hierarchy.

```

New: delete this line (leave the blank line after the JSON example blank).

#### Change C5: Simplify `parseVocabularyResponse()` (lines 372–382)

Old:
```ts
    mechanics: (json.mechanics || []).map((c: any) => ({
      canonical: String(c.canonical || ""),
      variants: (c.variants || []).map(String),
      parent: typeof c.parent === "string" ? c.parent : null,
    })),
    skills: (json.skills || []).map((c: any) => ({
      canonical: String(c.canonical || ""),
      variants: (c.variants || []).map(String),
      parent: typeof c.parent === "string" ? c.parent : null,
    })),
```

New:
```ts
    mechanics: (json.mechanics || []).map((c: any) => ({
      canonical: String(c.canonical || ""),
      variants: (c.variants || []).map(String),
    })),
    skills: (json.skills || []).map((c: any) => ({
      canonical: String(c.canonical || ""),
      variants: (c.variants || []).map(String),
    })),
```

---

### `src/normalize/vocab-cluster.ts` — MODIFY

#### Change D1: Line 212

Old: `result.push({ canonical, variants, parent: null });`
New: `result.push({ canonical, variants });`

#### Change D2: Line 284

Old: `clusters.push({ canonical, variants, parent: c.parent });`
New: `clusters.push({ canonical, variants });`

#### Change D3: Line 357

Old: `mechClusters.push({ canonical: enCanonical, variants: [deTerm], parent: null });`
New: `mechClusters.push({ canonical: enCanonical, variants: [deTerm] });`

#### Change D4: Line 379

Old: `skillClusters.push({ canonical: enCanonical, variants: [deTerm], parent: null });`
New: `skillClusters.push({ canonical: enCanonical, variants: [deTerm] });`

---

### `src/normalize/__testdata__/vocabulary.test.ts` — MODIFY

#### Change E1: Remove `parent: null` from fixtures

- Line 74: `{ canonical: "freeze signal", variants: ["freeze", "stop signal"], parent: null }` → `{ canonical: "freeze signal", variants: ["freeze", "stop signal"] }`
- Line 75: `{ canonical: "tap out", variants: ["tap out"], parent: null }` → `{ canonical: "tap out", variants: ["tap out"] }`
- Line 78: `{ canonical: "active listening", variants: ["listening", "active listening"], parent: null }` → `{ canonical: "active listening", variants: ["listening", "active listening"] }`
- Line 100: `{ canonical: "tap out", variants: ["tap out"], parent: null }` → `{ canonical: "tap out", variants: ["tap out"] }`
- Line 229: `{ canonical: "freeze mechanic", variants: ["freeze signal", "stop signal", "freezing"], parent: null }` → `{ canonical: "freeze mechanic", variants: ["freeze signal", "stop signal", "freezing"] }`

#### Change E2: Remove tests (lines 239–262)

Delete both tests: "preserves parent field from thesaurus" and "assigns parent: null to automated clusters".

---

### Verification (Phase 3)

- [ ] `bun test` — all tests pass (vocabulary tests compile with no parent references)
- [ ] `bun run src/normalize/normalize.ts --vocabulary` — runs successfully, `output/vocabulary.json` contains no `parent` field in any cluster
- [ ] `bun run src/review.ts --add-requires abc123 audience_input` — `graph-overrides.json` contains `{ "type": "add_requires", "elementId": "abc123", "requirementLabel": "audience_input" }`
- [ ] `bun run src/review.ts --remove-requires abc123 audience_input` — same for `remove_requires`
- [ ] `bun run src/review.ts --add-buildsOn abc123 def456` — `graph-overrides.json` contains `{ "type": "add_buildsOn", "fromElementId": "abc123", "toElementId": "def456" }`
- [ ] `bun run src/review.ts --remove-buildsOn abc123 def456` — same for `remove_buildsOn`
- [ ] `bun run src/review.ts --add-variationOf abc123 def456` — `graph-overrides.json` contains `{ "type": "add_variationOf", "fromElementId": "abc123", "toElementId": "def456" }`
- [ ] `bun run src/review.ts --remove-variationOf abc123 def456` — same for `remove_variationOf`
- [ ] `bun run src/review.ts --remove-edge abc123 requires abc123` — `remove_edge` override with `edgeType: "requires"` (previously rejected because requires was not in the cast)
- [ ] `bun run src/review.ts --add-edge abc123 buildsOn def456` — `add_edge` override with `edgeType: "buildsOn"` (previously rejected)
- [ ] `bun run src/review.ts --help` — lists all 14 commands

---

## Phase 4: Human Documentation + CI Validation

### Files

| File | Action |
|------|--------|
| `docs/ontology.md` | **CREATE** — prose documentation |
| `src/graph/ontology.test.ts` | **CREATE** — CI conformance test (inline fixture) |

---

### `docs/ontology.md` — CREATE

```markdown
# Knowledge Graph Ontology

The improbib knowledge graph models improvisation theatre elements and their relationships.
The authoritative source of truth is `src/graph/ontology.ts` — this document explains the concepts.

## Node Types

| Type | Meaning | ID Rule |
|------|---------|---------|
| `Element` | A game, exercise, or warmup. `canonical: true` = merged cluster; `canonical: false` = source/derived. | `md5(element:{label})` |
| `Mechanic` | A reusable building block (constraint, signal, role, structure, interaction). | `md5(mechanic:{label})` |
| `Skill` | A competency trained by elements (social, physical, cognitive, narrative, vocal). | `md5(skill:{label})` |
| `Tag` | A freeform tag (not vocabulary-canonicalized). | `md5(tag:{label})` |
| `Source` | An origin website (improwiki, learnimprov, ircwiki). | `md5(source:{label})` |
| `Requirement` | A resource/condition needed to play (e.g. audience input, physical contact). | `md5(requirement:{label})` |

See `NODE_TYPES` in `src/graph/ontology.ts` for full property schemas.

## Edge Types

| Type | From | To | Confidence |
|------|------|----|------------|
| `sourcedFrom` | Element | Source | deterministic |
| `canonicalOf` | Element (canonical) | Element (source) | matching (0–1) |
| `translationOf` | Element (canonical EN) | Element (canonical DE) | deterministic (1.0) |
| `variationOf` | Element (derived) | Element (parent) | deterministic (1.0) |
| `hasMechanic` | Element | Mechanic | deterministic |
| `trainsSkill` | Element | Skill | deterministic |
| `hasTag` | Element | Tag | deterministic |
| `requires` | Element | Requirement | deterministic |
| `buildsOn` | Element (superset) | Element (subset) | heuristic |

See `EDGE_TYPES` in `src/graph/ontology.ts` for full semantics, derivation rules, and cardinality.

## Confidence Tiers

- **Deterministic** — always correct, fully rule-derived. No confidence field on edges. Covers 7 of 9 edge types.
- **Matching** — from dedup scores (name similarity, mechanic overlap, LLM confidence). `canonicalOf` edges carry a `confidence: 0–1` field. Lower scores flag weak matches for human review via `bun run src/review.ts --clusters`.
- **Heuristic** — rule-inferred, higher false-positive risk. `buildsOn` edges use mechanic proper-subset + difficulty/duration heuristics. No confidence field, but reviewers should audit via `bun run src/review.ts --hubs`.

## Derivation Pipeline

`deriveGraph()` in `src/graph/derive.ts` runs 5 internal phases:

1. **Source nodes** — `Element` (canonical=false) per input element + derived/variant elements → `sourcedFrom`, `translationOf`, `variationOf` edges
2. **Canonical clustering** — Union-Find on `relatedIdentifiers` + translation links → `Element` (canonical=true) + `canonicalOf` edges
3. **Entity edges** — `hasMechanic`, `trainsSkill`, `hasTag` + `Mechanic`/`Skill`/`Tag`/`Source` nodes
4. **Requirements + dependencies** — `requires` (static lookup) + `buildsOn` (mechanic subset heuristic)
5. **Override application** — human corrections from `graph-overrides.json` filter/add edges

## Vocabulary

Mechanics and skills are canonicalized via `src/normalize/vocab-cluster.ts` using:
- Token Jaccard similarity (≥0.5) for synonym clustering
- Levenshtein distance (≥0.6) for inflection variants
- Translation seed pairs (DE↔EN elements with exactly 1 mechanic/skill each)
- Human thesaurus (`vocabulary-thesaurus.json`) overrides automated clustering

The vocabulary is applied twice: once rewriting normalized source files (Stage 3), and again at graph derivation via `resolveTerm()`.

## Overrides

10 override types in `graph-overrides.json`, applied during graph derivation:

| Type | Affects |
|------|---------|
| `reject_match` / `add_match` | Dedup clustering (add/remove `relatedIdentifiers` entries) |
| `remove_edge` / `add_edge` | Any edge type (hasMechanic, trainsSkill, hasTag, requires, buildsOn, variationOf) |
| `add_requires` / `remove_requires` | Requirement edges |
| `add_buildsOn` / `remove_buildsOn` | buildsOn dependency edges |
| `add_variationOf` / `remove_variationOf` | Variation edges |

Manage via: `bun run src/review.ts <command>`

## Consumers

- `GET /graph.json` — full knowledge graph via HTTP
- `GET /ontology.json` — auto-generated ontology schema (for LLM agents)
- `bun run src/review.ts` — human QA CLI
- `src/query/graph-query.ts` — programmatic graph query API
```

---

### `src/graph/ontology.test.ts` — CREATE

```ts
import { describe, it, expect } from "bun:test";
import { createHash } from "crypto";
import { deriveGraph } from "./derive";
import { NODE_TYPES, EDGE_TYPES, exportOntologyJSON } from "./ontology";
import type { NormalizedElement } from "../normalize/normalized-schema";
import type { VocabularyMap } from "../normalize/llm-client";

function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

function elem(id: string, overrides: Partial<NormalizedElement> = {}): NormalizedElement {
  return {
    identifier: md5(id),
    name: id,
    url: "https://example.com/" + id,
    sourceName: "improwiki",
    languageCode: "en",
    tags: [],
    htmlContent: "",
    normalized: {
      summary: `Summary for ${id}`,
      description: `Description for ${id} with enough characters.`,
      howToPlay: { steps: [{ action: "do something" }] },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [],
      skills: [],
      practical: {},
      contentHash: md5(`html:${id}`),
      extractedAt: new Date().toISOString(),
      normalizedBy: "test",
    },
    derivedElements: [],
    relatedIdentifiers: [],
    ...overrides,
  };
}

const emptyVocab: VocabularyMap = { mechanics: [], skills: [] };

describe("ontology conformance", () => {
  it("all edge types and node types are declared in ontology", async () => {
    const elements: NormalizedElement[] = [
      elem("GameA", {
        normalized: {
          summary: "GameA summary",
          description: "GameA description with more chars.",
          howToPlay: { steps: [{ action: "step one" }] },
          variations: [],
          tips: [],
          referencedElements: [],
          mechanics: [{ name: "freeze signal", category: "signal" }],
          skills: [{ name: "listening", category: "social" }],
          practical: { difficulty: "beginner", typicalDurationMinutes: 5 },
          contentHash: md5("html:a"),
          extractedAt: new Date().toISOString(),
          normalizedBy: "test",
        },
        tags: ["Warm-up"],
        relatedIdentifiers: [{ identifier: md5("GameB"), confidence: 0.9 }],
        translationLinkEnIdentifier: md5("GameA_de") as any,
      }),
      elem("GameB", {
        normalized: {
          summary: "GameB summary",
          description: "GameB description with more chars.",
          howToPlay: { steps: [{ action: "step two" }] },
          variations: [],
          tips: [],
          referencedElements: [],
          mechanics: [
            { name: "freeze signal", category: "signal" },
            { name: "audience suggestion", category: "interaction" },
          ],
          skills: [{ name: "listening", category: "social" }],
          practical: { difficulty: "intermediate", typicalDurationMinutes: 10 },
          contentHash: md5("html:b"),
          extractedAt: new Date().toISOString(),
          normalizedBy: "test",
        },
        tags: ["Warm-up", "Ask For"],
        relatedIdentifiers: [{ identifier: md5("GameA"), confidence: 0.9 }],
        derivedElements: [{ name: "GameB Variant", url: "", description: "", differsBy: [] }],
      }),
      elem("GameA_de", {
        languageCode: "de",
        normalized: {
          summary: "GameA de summary",
          description: "GameA de description with more chars.",
          howToPlay: { steps: [{ action: "schritt eins" }] },
          variations: [],
          tips: [],
          referencedElements: [],
          mechanics: [{ name: "freeze signal", category: "signal" }],
          skills: [{ name: "listening", category: "social" }],
          practical: {},
          contentHash: md5("html:a_de"),
          extractedAt: new Date().toISOString(),
          normalizedBy: "test",
        },
        tags: ["Warm-up"],
      }),
    ];

    const graph = await deriveGraph(elements, emptyVocab, []);

    for (const e of graph.edges) {
      expect(e.type in EDGE_TYPES).toBe(true);
    }
    for (const n of graph.nodes) {
      expect(n.type in NODE_TYPES).toBe(true);
    }
  });

  it("every declared edge type is produced", async () => {
    const elements: NormalizedElement[] = [
      elem("Superset", {
        normalized: {
          summary: "Superset summary",
          description: "Superset description with more chars.",
          howToPlay: { steps: [{ action: "step" }] },
          variations: [],
          tips: [],
          referencedElements: [],
          mechanics: [
            { name: "freeze signal", category: "signal" },
            { name: "audience suggestion", category: "interaction" },
          ],
          skills: [{ name: "listening", category: "social" }],
          practical: { difficulty: "advanced", typicalDurationMinutes: 15 },
          contentHash: md5("html:superset"),
          extractedAt: new Date().toISOString(),
          normalizedBy: "test",
        },
        tags: ["Warm-up", "Ask For"],
      }),
      elem("Subset", {
        normalized: {
          summary: "Subset summary",
          description: "Subset description with more chars.",
          howToPlay: { steps: [{ action: "step" }] },
          variations: [],
          tips: [],
          referencedElements: [],
          mechanics: [{ name: "freeze signal", category: "signal" }],
          skills: [{ name: "spontaneity", category: "cognitive" }],
          practical: { difficulty: "beginner", typicalDurationMinutes: 5 },
          contentHash: md5("html:subset"),
          extractedAt: new Date().toISOString(),
          normalizedBy: "test",
        },
        tags: ["Warm-up"],
        relatedIdentifiers: [{ identifier: md5("SubsetDE"), confidence: 0.8 }],
        translationLinkEnIdentifier: md5("SubsetDE") as any,
      }),
      elem("SubsetDE", {
        languageCode: "de",
        normalized: {
          summary: "SubsetDE summary",
          description: "SubsetDE description with more chars.",
          howToPlay: { steps: [{ action: "schritt" }] },
          variations: [],
          tips: [],
          referencedElements: [],
          mechanics: [{ name: "freeze signal", category: "signal" }],
          skills: [{ name: "spontaneity", category: "cognitive" }],
          practical: {},
          contentHash: md5("html:subsetde"),
          extractedAt: new Date().toISOString(),
          normalizedBy: "test",
        },
        tags: ["Warm-up"],
        relatedIdentifiers: [{ identifier: md5("Subset"), confidence: 0.8 }],
        translationLinkDeIdentifier: md5("Subset") as any,
      }),
      elem("Parent", {
        normalized: {
          summary: "Parent summary",
          description: "Parent description with more chars.",
          howToPlay: { steps: [{ action: "step" }] },
          variations: [],
          tips: [],
          referencedElements: [],
          mechanics: [{ name: "tap out", category: "role" }],
          skills: [{ name: "teamwork", category: "social" }],
          practical: {},
          contentHash: md5("html:parent"),
          extractedAt: new Date().toISOString(),
          normalizedBy: "test",
        },
        tags: ["Performance"],
        derivedElements: [{ name: "Child", url: "", description: "", differsBy: ["fewer players"] }],
      }),
    ];

    const graph = await deriveGraph(elements, emptyVocab, []);

    const produced = new Set(graph.edges.map(e => e.type));
    for (const t of Object.keys(EDGE_TYPES)) {
      expect(produced.has(t)).toBe(true);
    }
  });

  it("every declared node type is produced", async () => {
    const elements: NormalizedElement[] = [
      elem("NodeTest", {
        normalized: {
          summary: "NodeTest summary",
          description: "NodeTest description with more chars.",
          howToPlay: { steps: [{ action: "step" }] },
          variations: [],
          tips: [],
          referencedElements: [],
          mechanics: [{ name: "audience suggestion", category: "interaction" }],
          skills: [{ name: "listening", category: "social" }],
          practical: {},
          contentHash: md5("html:nodetest"),
          extractedAt: new Date().toISOString(),
          normalizedBy: "test",
        },
        tags: ["Ask For"],
      }),
    ];

    const graph = await deriveGraph(elements, emptyVocab, []);

    const produced = new Set(graph.nodes.map(n => n.type));
    for (const t of Object.keys(NODE_TYPES)) {
      expect(produced.has(t)).toBe(true);
    }
  });

  it("exportOntologyJSON produces valid JSON with examples", () => {
    const vocab: VocabularyMap = {
      mechanics: [{ canonical: "freeze signal", variants: ["freeze"] }],
      skills: [{ canonical: "listening", variants: ["active listening"] }],
    };

    const json = exportOntologyJSON(vocab, {
      sourcedFrom: [{ from: "from1", to: "to1" }],
      canonicalOf: [{ from: "from2", to: "to2", confidence: 0.85 }],
    });

    expect(json.meta.edgeTypeCount).toBe(Object.keys(EDGE_TYPES).length);
    expect(json.meta.nodeTypeCount).toBe(Object.keys(NODE_TYPES).length);
    expect(json.vocabulary.mechanics).toEqual(["freeze signal"]);
    expect(json.vocabulary.skills).toEqual(["listening"]);
    expect(json.confidenceTiers.deterministic.edges.length).toBeGreaterThan(0);
    expect(json.confidenceTiers.matching.edges).toContain("canonicalOf");
    expect(json.confidenceTiers.heuristic.edges).toContain("buildsOn");
    expect(json.edgeTypes.sourcedFrom.examples.length).toBe(1);
    expect(json.edgeTypes.canonicalOf.examples.length).toBe(1);

    for (const key of Object.keys(EDGE_TYPES)) {
      expect(json.edgeTypes[key as keyof typeof EDGE_TYPES].examples).toBeDefined();
    }
  });
});
```

---

### Verification (Phase 4)

- [ ] `bun test src/graph/ontology.test.ts` — all 4 assertions pass (every edge type produced, every node type produced, all types declared, exportOntologyJSON valid)
- [ ] `bun test` — full test suite passes, no regressions
- [ ] Manual: review `docs/ontology.md` against `src/graph/ontology.ts` for accuracy (node types match, edge types match, confidence tiers correct, pipeline phases accurate)

---

## Testing Checkpoints Summary

| Phase | Verify command | What confirms success |
|------|----------------|----------------------|
| 1 | `bun test` | All existing tests pass; TypeScript rejects undeclared edge types |
| 2 | `bun run src/normalize/normalize.ts --graph` → `curl :5000/ontology.json` | 200 with valid OntologyJSON |
| 3 | `bun test` + spot-check `graph-overrides.json` | Updated vocab tests pass; all 10 override types writeable via CLI |
| 4 | `bun test src/graph/ontology.test.ts` | 4/4 ontology conformance assertions pass |

---

## Deviations from Structure

**None.** Every file from `structure.md` appears with exact changes specified. One implementation detail resolved:

- `writeOntology()` re-reads `output/vocabulary.json` from disk (same pattern as `deriveGraphFromFiles()` at `derive.ts:817–821`). This avoids changing the `deriveGraphFromFiles()` return signature.

---

Next: `/qrspi/6_worktree` or `/qrspi/7_implement thoughts/qrspi/2026-06-14/`
