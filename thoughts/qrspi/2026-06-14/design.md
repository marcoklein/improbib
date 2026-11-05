# Design: Knowledge Graph Ontology Documentation

## Current State

The graph is derived by `deriveGraph()` in `src/graph/derive.ts:449-800` through 5 phases. There is no explicit ontology — edge/node types and their semantics exist only as code paths and string literal unions. `GraphEdge.type` is a free string union (`derive.ts:42`); `GraphNode.type` is the same. Any code can produce any edge type string without the type system knowing whether it's valid or what it means.

**Known problems:**
- `derivedFrom` edge type in union but never produced — vestigial
- `dedupSteps()` defined (`derive.ts:413-424`) but never called — dead code
- Only 4 of 10 override types have CLI commands (`review.ts:444,454`)
- No compile-time connection between what `derive.ts` produces and what the graph should contain
- No artifact an LLM agent can consume to understand the graph's structure, vocabulary, or derivation logic

## Desired End State

1. **`src/graph/ontology.ts`** — const objects defining every node type and edge type with full schemas, derivation rules, confidence semantics, and real examples. This is the source of truth.
2. **Compile-time integration** — `derive.ts`'s `GraphEdge.type` and `GraphNode.type` reference the ontology's type keys. TypeScript rejects any edge type not declared in the ontology. Zero drift possible.
3. **`output/ontology.json`** — JSON export of the ontology, written during graph derivation, served at `GET /ontology.json`. Contains everything an LLM needs: vocabulary, schema, derivation rules, examples, confidence tiers.
4. **`docs/ontology.md`** — human-readable prose referencing the ontology module. Not the source of truth; the `.ts` file is.
5. **Phase A cleanup** — remove dead code, fix override CLI gap.
6. **CI test** — derives graph from fixtures, verifies every node/edge conforms to the ontology schema (runtime structural check).

## The Ontology Module (`src/graph/ontology.ts`)

Two const objects, structured for both TypeScript type extraction and JSON serialization:

```ts
export const NODE_TYPES = {
  Element: {
    discriminator: "canonical", // true | false
    properties: {
      id: "string (md5)",
      label: "string",
      description: "string",
      summary: "string | null",
      howToPlay: "HowToPlayStep[] | null",
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
      sources: "SourceProvenance[] | null",
    },
    idRule: "md5(element:{label.lowercase()})",
    prefixes: { canonical: "canon", source: "element" },
    createdIn: "Phase 1 (source) / Phase 2 (canonical)",
  },
  Mechanic: {
    properties: { id: "string (md5)", label: "string (vocabulary-canonicalized)" },
    idRule: "md5(mechanic:{label.lowercase()})",
    createdIn: "Phase 3",
  },
  Skill: { /* same structure */ },
  Tag: { /* not vocabulary-canonicalized */ },
  Source: { /* same structure */ },
  Requirement: { /* static lookup table */ },
} as const;

export const EDGE_TYPES = {
  sourcedFrom: {
    from: "Element", to: "Source",
    cardinality: "N:1 (one element → one source)",
    confidence: { tier: "deterministic" },
    semantics: "this element was scraped from this source",
    derivedBy: "sourceName field on NormalizedElement",
    examples: [{ from: "md5(element:{freeze_tag})", to: "md5(source:ircwiki)" }],
  },
  canonicalOf: {
    from: "Element (canonical)", to: "Element (source)",
    confidence: { tier: "matching", range: [0, 1], drivenBy: "average of relatedIdentifier + translation link scores" },
    semantics: "source element is an instance of this canonical element (same game, same language)",
    derivedBy: "Union-Find clustering of relatedIdentifiers + translation links → createCanonicalElement()",
    examples: [{ from: "md5(canon:{freeze_tag})", to: "md5(element:{freeze_tag_ircwiki})", confidence: 0.82 }],
  },
  translationOf: {
    from: "Element (canonical)", to: "Element (canonical)",
    confidence: { tier: "deterministic", value: 1.0 },
    semantics: "EN canonical ↔ DE canonical (same game concept)",
    derivedBy: "translationLinkEnIdentifier / translationLinkDeIdentifier on source elements",
  },
  variationOf: {
    from: "Element (source, derived)", to: "Element (source, parent)",
    confidence: { tier: "deterministic", value: 1.0 },
    semantics: "derived element is a variant/child of parent element",
    derivedBy: "derivedElements[] field → variationOf edge from child to parent",
  },
  hasMechanic:    { from: "Element", to: "Mechanic",    confidence: { tier: "deterministic" }, /* ... */ },
  trainsSkill:    { from: "Element", to: "Skill",       confidence: { tier: "deterministic" }, /* ... */ },
  hasTag:         { from: "Element", to: "Tag",         confidence: { tier: "deterministic" }, /* ... */ },
  requires:       { from: "Element", to: "Requirement", confidence: { tier: "deterministic" }, /* ... */ },
  buildsOn:       { from: "Element", to: "Element",     confidence: { tier: "heuristic" },     /* ... */ },
} as const;

// Type exports for compile-time enforcement
export type NodeType = keyof typeof NODE_TYPES;
export type EdgeType = keyof typeof EDGE_TYPES;

// LLM export — serializes ontology with vocabulary injected at write time
export function exportOntologyJSON(vocab: VocabularyMap, examples: { [edgeType: string]: ExampleEdge[] }): OntologyJSON {
  // merges NODE_TYPES + EDGE_TYPES + vocab.clusters + real graph examples into one JSON blob
}
```

The `examples` field on each edge type is populated from the live graph at write time — `exportOntologyJSON()` samples 2-3 real edges per type from the just-derived graph. This means the ontology JSON stays current even if element IDs change.

## Compile-Time Integration

In `derive.ts`, the type unions become:

```ts
import type { EdgeType, NodeType } from "./ontology";

export interface GraphEdge {
  type: EdgeType;  // was: string literal union of 10 values
  from: string;
  to: string;
  confidence?: number;
}

export interface GraphNode {
  type: NodeType;  // was: string literal union of 7 values
  id: string;
  label: string;
}
```

This is the anti-drift mechanism. If someone adds a new edge type string to `derive.ts` without adding it to `EDGE_TYPES`, TypeScript rejects it. If someone adds a type to `EDGE_TYPES` without producing it, the CI test catches the declared-but-unused gap. Drift is impossible in either direction.

## JSON Export for LLM Consumption

Written by `writeOntology()` during `deriveGraphStage()`, alongside `graph.json`:

```
output/
  graph.json        ← KnowledgeGraph (existing)
  ontology.json     ← NEW: OntologyJSON (for LLM agents)
```

**Served at `GET /ontology.json`** (`src/serve.ts`). Structure:

```json
{
  "meta": { "derivedAt": "...", "nodeTypeCount": 7, "edgeTypeCount": 9 },
  "nodeTypes": { ...NODE_TYPES with real example IDs from current graph },
  "edgeTypes": { ...EDGE_TYPES with real example edges from current graph },
  "vocabulary": {
    "mechanics": ["Accepting", "Audience Suggestion", ...],
    "skills": ["Character Work", "Listening", ...]
  },
  "confidenceTiers": {
    "deterministic": { "meaning": "always correct, no confidence field", "edges": ["sourcedFrom", "translationOf", ...] },
    "matching": { "meaning": "from dedup scores, lower = needs review", "edges": ["canonicalOf"] },
    "heuristic": { "meaning": "rule-inferred, may be wrong", "edges": ["buildsOn"] }
  }
}
```

This gives an LLM agent everything to classify: the schema of every node (what fields exist), the closed vocabulary of mechanics/skills (canonical labels), the rules that produce each edge type (semantics + derivation), confidence tiers (which edges to trust), and real examples (few-shot).

## Human Documentation (`docs/ontology.md`)

Prose document referencing the ontology module. Sections: node types, edge types, derivation pipeline, vocabulary, overrides, consumers. Code examples show the TypeScript interface from `ontology.ts`, not raw `derive.ts` code. The `.ts` file is canonical; the markdown is explanatory.

## Phase A: Cleanup (before ontology)

Same as prior draft — remove `derivedFrom` from `GraphEdge` union, delete `dedupSteps()`, remove `VocabularyCluster.parent` + LLM prompt references, add 6 override CLI commands to `review.ts` + expand `--add-edge`/`--remove-edge` to accept all edge types.

## CI Verification

**Test:** `src/graph/ontology.test.ts`

1. Derives graph from minimal fixture (3-5 elements exercising all types)
2. Asserts every `edge.type` matches an `EDGE_TYPES` key
3. Asserts every `node.type` matches a `NODE_TYPES` key
4. Asserts every declared edge type appears in output (no declared-but-unused)
5. Asserts every declared node type appears in output
6. Asserts `exportOntologyJSON()` produces valid JSON with example edges populated

## Design Decisions

### D1: TypeScript as source of truth, not markdown

`docs/ontology.md` can drift from code. `src/graph/ontology.ts` cannot — `derive.ts` imports its types. Markdown is human commentary; the `.ts` file is authoritative.

### D2: Compile-time + runtime dual guard

The `type: EdgeType` constraint prevents adding undeclared edge types at compile time. The CI test prevents declaring types that are never produced. Both directions covered.

### D3: Three confidence tiers, no new fields

`canonicalOf` stores 0-1 (matching tier). Deterministic edges have no field (implicit 1.0). `buildsOn` is heuristic — no field, but the ontology declares it as such so reviewers know to audit it. No schema changes needed.

### D4: JSON export alongside graph, not separate build step

`ontology.json` is written during graph derivation so it can inject real example edges from the current graph. This avoids stale example IDs. Served at `GET /ontology.json` like `graph.json`.

### D5: Dead code removal + CLI gap fix before ontology

Clean slate. Removal order: dead code → override CLI → ontology module → `derive.ts` integration → `docs/ontology.md` → CI test.

## What We're NOT Doing

- Not adding confidence fields to `buildsOn` — no schema change
- Not LLM-generating the ontology — the `exportOntologyJSON()` format is designed for LLM consumption, but the ontology content is hand-defined
- Not refactoring the derivation pipeline — ontology describes it, doesn't redesign it
- Not replacing hardcoded difficulty ranking (`derive.ts:710`) — separate enhancement
- Not adding test coverage for stale-detection or translation-link fallback — separate testing gaps

## Open Risks

1. **TypeScript constraint on `GraphEdge.type`** — this changes `derive.ts`'s edge creation code. Every place that constructs `{ type: "...", ... }` must use a key of `EDGE_TYPES`. Mitigation: TypeScript catches mismatches at compile time; no runtime surprises.

2. **Example staleness in `ontology.json`** — examples are sampled from the live graph at write time. If schema changes make old examples invalid, export may crash. Mitigation: `exportOntologyJSON()` gracefully handles missing examples (omits the examples field rather than throwing).

3. **LLM prompt drift** — removing `parent` from `VocabularyCluster` edits the LLM prompt at `llm-client.ts`. Mitigation: run `bun run src/normalize/normalize.ts --vocabulary` and spot-check output.

4. **Two copies of type names** — `EDGE_TYPES` keys and the `GraphEdge.type` union in `derive.ts` were previously independent. After integration, only `EDGE_TYPES` is authoritative. If a review override creates an edge by type string, that string must match an `EDGE_TYPES` key. Mitigation: TypeScript catches this; `overrides.ts` uses the same `EdgeType` import.

5. **`dedupSteps()` removal** — if planned for future canonical howToPlay dedup, no design doc exists. Mitigation: git history preserves it.
