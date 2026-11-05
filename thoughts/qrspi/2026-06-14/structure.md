# Structure: Knowledge Graph Ontology Documentation

## Approach

Four vertical phases, each delivering a testable capability across definition → derivation → export → consumption layers. Earlier phases are independently valuable; each builds on the previous.

---

## Phase 1: Ontology Core + Type Enforcement

**What it delivers:** `src/graph/ontology.ts` becomes the authoritative source of truth for every node and edge type. `derive.ts`'s type unions reference the ontology, making TypeScript reject any undeclared edge/node type at compile time. Dead code removed as prerequisite.

**Files affected:**

| File | Change |
|---|---|
| `src/graph/ontology.ts` | **NEW** — `NODE_TYPES` + `EDGE_TYPES` const objects, `NodeType`/`EdgeType` type exports |
| `src/graph/derive.ts` | REPLACE `GraphEdge.type` union (line 42) with `EdgeType` import; REPLACE `GraphNode.type` union (line 12) with `NodeType` import; REMOVE `derivedFrom` from union (vestigial); DELETE `dedupSteps()` (lines 413–424, dead code); ADD `import type { EdgeType, NodeType } from "./ontology"` |

**Key signatures/types:**

```ts
// ontology.ts
export const NODE_TYPES = {
  Element:    { discriminator: "canonical", ... },
  Mechanic:   { ... },
  Skill:      { ... },
  Tag:        { ... },
  Source:     { ... },
  Requirement:{ ... },
} as const;

export const EDGE_TYPES = {
  sourcedFrom:    { from: "Element", to: "Source", ... },
  canonicalOf:    { from: "Element", to: "Element", confidence: { tier: "matching", range: [0,1] }, ... },
  translationOf:  { from: "Element", to: "Element", ... },
  variationOf:    { from: "Element", to: "Element", ... },
  hasMechanic:    { from: "Element", to: "Mechanic", ... },
  trainsSkill:    { from: "Element", to: "Skill", ... },
  hasTag:         { from: "Element", to: "Tag", ... },
  requires:       { from: "Element", to: "Requirement", ... },
  buildsOn:       { from: "Element", to: "Element", confidence: { tier: "heuristic" }, ... },
} as const;

export type NodeType = keyof typeof NODE_TYPES;
export type EdgeType = keyof typeof EDGE_TYPES;

// derive.ts (after change)
import type { EdgeType, NodeType } from "./ontology";
export interface GraphNode { type: NodeType; ... }
export interface GraphEdge { type: EdgeType; ... }
```

Note: `derivedFrom` is deliberately absent from `EDGE_TYPES`. It was declared in the old string union but never produced by any code path.

**Verify:**

1. `bun test` — all existing tests pass (grail derivation runs, 0 regressions)
2. TypeScript compiles clean (adding an undeclared edge type string to `addEdge()` in `derive.ts` produces a type error)
3. Manual: `bun run src/normalize/normalize.ts --graph` produces `output/graph.json` with identical structure

---

## Phase 2: Ontology JSON Export + HTTP Endpoint

**What it delivers:** `ontology.json` is written alongside `graph.json` during derivation, populated with vocabulary + real example edges from the just-derived graph. Served at `GET /ontology.json` on the HTTP server — LLM agents can consume the full schema, vocabulary, confidence tiers, and few-shot examples.

**Files affected:**

| File | Change |
|---|---|
| `src/graph/ontology.ts` | ADD `exportOntologyJSON(vocab, examples)` function; ADD `OntologyJSON` interface |
| `src/graph/derive.ts` | ADD `writeOntology()` export called inside `writeGraph()`; samples 2–3 real edges per type from the live graph |
| `src/serve.ts` | ADD `GET /ontology.json` handler (same `serveFile` pattern as `/graph.json` at line 310) |

**Key signatures/types:**

```ts
// ontology.ts
export interface OntologyJSON {
  meta: { derivedAt: string; nodeTypeCount: number; edgeTypeCount: number };
  nodeTypes: Record<NodeType, /* NODE_TYPES value + example node IDs */>;
  edgeTypes: Record<EdgeType, /* EDGE_TYPES value + example edges from live graph */>;
  vocabulary: { mechanics: string[]; skills: string[] };
  confidenceTiers: { deterministic: {...}; matching: {...}; heuristic: {...} };
}

export function exportOntologyJSON(
  vocab: VocabularyMap,
  examples: Partial<Record<EdgeType, Array<{ from: string; to: string; confidence?: number }>>>
): OntologyJSON;
```

`writeOntology()` in `derive.ts` extracts example edges from the just-computed `edges[]` array, calls `exportOntologyJSON()`, and writes `output/ontology.json`. If no examples exist for an edge type, `exportOntologyJSON()` omits the examples field gracefully.

**Verify:**

1. `bun run src/normalize/normalize.ts --graph` — produces `output/ontology.json` with all sections populated
2. Start server, `curl http://localhost:5000/ontology.json` returns 200 with valid JSON matching `OntologyJSON` structure
3. Manual spot-check: `ontology.json` contains real edge IDs (matching `graph.json`), confidence tiers are correct, vocabulary lists are non-empty

---

## Phase 3: Override CLI Completion + Vocabulary Cleanup

**What it delivers:** All 10 graph override types have CLI commands in `review.ts`. The `parent` field is removed from `VocabularyCluster` and the LLM vocabulary prompt — eliminating dead fields and future taxonomy cruft.

**Files affected:**

| File | Change |
|---|---|
| `src/review.ts` | ADD 6 CLI commands: `--add-requires`, `--remove-requires`, `--add-buildsOn`, `--remove-buildsOn`, `--add-variationOf`, `--remove-variationOf`. EXPAND `--remove-edge`/`--add-edge` to accept `EdgeType` (full union) instead of `"hasMechanic" \| "trainsSkill" \| "hasTag"`. |
| `src/normalize/llm-client.ts` | REMOVE `parent: string \| null` from `VocabularyCluster` interface (line 23). REMOVE `"parent": null` from LLM prompt examples (lines 360–361). REMOVE `parent is always null` line from prompt (line 364). SIMPLIFY `parseVocabularyResponse()` to not parse/extract `parent` (lines 375, 380). |
| `src/normalize/vocab-cluster.ts` | REMOVE `parent: null` from cluster construction (lines 212, 284, 357, 379). |
| `src/normalize/__testdata__/vocabulary.test.ts` | REMOVE `parent` from fixture objects (lines 74–75, 78, 100, 229). REMOVE tests that assert `parent` behavior (lines 239–261: "preserves parent field from thesaurus", "assigns parent: null to automated clusters"). |

**CLI command signatures:**

```
--add-requires <element-id> <requirement-label>
--remove-requires <element-id> <requirement-label>
--add-buildsOn <from-element-id> <to-element-id>
--remove-buildsOn <from-element-id> <to-element-id>
--add-variationOf <from-element-id> <to-element-id>
--remove-variationOf <from-element-id> <to-element-id>
```

Each writes the corresponding `Override` type to `graph-overrides.json` via the existing `addOverride()` function. Deduplication by JSON key is already handled.

**Verify:**

1. `bun test` — all tests pass (including updated vocabulary tests)
2. `bun run src/normalize/normalize.ts --vocabulary` — runs successfully, `output/vocabulary.json` contains no `parent` fields
3. Manual: run each of the 6 new CLI commands with dummy IDs, inspect `graph-overrides.json` to confirm correct override type + fields written

---

## Phase 4: Human Documentation + CI Validation

**What it delivers:** `docs/ontology.md` provides human-readable prose documentation referencing the ontology module. `src/graph/ontology.test.ts` provides a CI test that derives a graph from fixtures and validates every node/edge against the ontology schema — preventing drift in both directions (undeclared types caught at compile-time Phase 1; declared-but-unused caught here).

**Files affected:**

| File | Change |
|---|---|
| `docs/ontology.md` | **NEW** — prose sections: node types, edge types, derivation pipeline overview, vocabulary, overrides, consumers. Code snippets reference `ontology.ts` interfaces. |
| `src/graph/ontology.test.ts` | **NEW** — imports `deriveGraph()`, derives from a minimal 5-element fixture exercising all node/edge types, then asserts: (1) every `edge.type` ∈ `EDGE_TYPES`, (2) every `node.type` ∈ `NODE_TYPES`, (3) every declared edge type appears in output, (4) every declared node type appears in output, (5) `exportOntologyJSON()` produces valid JSON with example edges populated. |
| `src/graph/__testdata__/` or inline fixture | Minimal fixture: 5 `NormalizedElement` objects with `relatedIdentifiers` + `translationLinkEnIdentifier`/`translationLinkDeIdentifier` + varied mechanics/skills/tags to exercise all edge types. |

**Test structure:**

```ts
// ontology.test.ts
import { describe, it, expect } from "bun:test";
import { deriveGraph } from "./derive";
import { NODE_TYPES, EDGE_TYPES, exportOntologyJSON } from "./ontology";

const fixture: NormalizedElement[] = [...]; // 5 elements exercising all types

describe("ontology conformance", () => {
  const graph = await deriveGraph(fixture, emptyVocab, []);

  it("all edge types are declared in EDGE_TYPES", () => {
    for (const e of graph.edges) expect(e.type in EDGE_TYPES).toBe(true);
  });

  it("all node types are declared in NODE_TYPES", () => {
    for (const n of graph.nodes) expect(n.type in NODE_TYPES).toBe(true);
  });

  it("every declared edge type is produced", () => {
    const produced = new Set(graph.edges.map(e => e.type));
    for (const t of Object.keys(EDGE_TYPES))
      expect(produced.has(t)).toBe(true);
  });

  it("every declared node type is produced", () => {
    const produced = new Set(graph.nodes.map(n => n.type));
    for (const t of Object.keys(NODE_TYPES))
      expect(produced.has(t)).toBe(true);
  });

  it("exportOntologyJSON produces valid JSON with examples", () => {
    const json = exportOntologyJSON(vocab, sampledExamples);
    expect(json.meta.edgeTypeCount).toBe(Object.keys(EDGE_TYPES).length);
    // at least one edge type has examples
  });
});
```

**Verify:**

1. `bun test src/graph/ontology.test.ts` — all 5 assertions pass
2. `bun test` (full suite) — no regressions
3. Manual: review `docs/ontology.md` against `ontology.ts` for accuracy

---

## Testing Checkpoints Summary

| Phase | Verify command | What confirms success |
|---|---|---|
| 1 | `bun test` | All existing tests pass; TypeScript rejects undeclared edge types |
| 2 | `bun run .../normalize.ts --graph` then `curl :5000/ontology.json` | 200 with valid OntologyJSON (examples populated, vocabulary injected) |
| 3 | `bun test` + spot-check `graph-overrides.json` | Updated vocabulary tests pass; all 10 override types writeable via CLI |
| 4 | `bun test src/graph/ontology.test.ts` | 5/5 ontology conformance assertions pass |

---

## Phase Order Rationale

- **Phase 1 first** because the ontology module is the foundation. Type enforcement cannot work without it. Includes dead code removal so the ontology is clean from the start.
- **Phase 2 second** because it makes the ontology externally consumable — the JSON export depends on the ontology types defined in Phase 1 and the live graph from derivation.
- **Phase 3 third** because it's independent cleanup that touches different files (review CLI, LLM client) but benefits from `EdgeType` being available (from Phase 1) to type the expanded CLI edge type parameter.
- **Phase 4 last** because the CI test validates the full system — it needs both the ontology module (Phase 1) and the export function (Phase 2) to test. The docs should reflect the completed system.

---

Next: `/qrspi/5_plan thoughts/qrspi/2026-06-14/`
