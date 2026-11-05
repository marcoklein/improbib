# Research: Graph Derivation Pipeline

## Q1 — How `deriveGraph()` Populates the Graph

**File:** `src/graph/derive.ts:449-800`

### Node Types (6)
| Type | Added at | Summary |
|------|----------|---------|
| `Element` (source, canonical=false) | `derive.ts:486-504` | One per input `NormalizedElement` |
| `Element` (derived/variation, canonical=false) | `derive.ts:522-534` | One per `derivedElements[]` entry, id from `md5("derived:{parentId}:{name}")` |
| `Element` (canonical, canonical=true) | `derive.ts:563-569` | One per language (en/de) per cluster via `createCanonicalElement()` |
| `Mechanic` | `derive.ts:652` | From elements' mechanics, resolved through vocabulary map |
| `Skill` | `derive.ts:659` | From elements' skills, resolved through vocabulary map |
| `Tag` | `derive.ts:667` | From elements' tags (not vocabulary-canonicalized) |
| `Source` | `derive.ts:674,683` | From `sourceName` on elements and canonical element sources |
| `Requirement` | `derive.ts:694` | From `deriveRequirements()` lookup against mechanic+tag rules |

### Edge Types (10 declared, 9 produced)
| Type | Added at | Confidence |
|------|----------|------------|
| `sourcedFrom` | `derive.ts:507` | none |
| `translationOf` | `derive.ts:511,514` (source), `derive.ts:592` (canonical) | 1.0 |
| `variationOf` | `derive.ts:535` | 1.0 |
| `canonicalOf` | `derive.ts:577-587` | 0-1 from `computeClusterConfidence()` |
| `hasMechanic` | `derive.ts:653` | none |
| `trainsSkill` | `derive.ts:661` | none |
| `hasTag` | `derive.ts:668` | none |
| `requires` | `derive.ts:695` | none |
| `buildsOn` | `derive.ts:755` | none |
| `derivedFrom` | — | **Declared in union** at `derive.ts:42` but **never produced** by any code path |

### Internal Phases
| Phase | Lines | What |
|-------|-------|------|
| 0 Setup | 454-479 | Build vocab maps (`mechMap`, `skillMap`), init `nodes[]`/`edges[]` + dedup sets |
| 1 Source nodes | 481-537 | Source `Element` nodes + `sourcedFrom` + `translationOf` + derived elements + `variationOf` |
| 1b Dedup overrides | 539-548 | `applyDedupOverrides()` mutates `relatedIdentifiers` before clustering |
| 2 Canonical clustering | 550-600 | Union-Find via `buildClusters()` → `createCanonicalElement()` → `canonicalOf` + `translationOf` |
| 3 Entity edges | 602-686 | `hasMechanic`, `trainsSkill`, `hasTag` + `Source` nodes (vocabulary-canonicalized) |
| 3a Requirements | 688-697 | `deriveRequirements()` → `Requirement` nodes + `requires` edges |
| 3b Dependencies | 699-759 | `buildsOn` edges from mechanic-subset + difficulty/duration heuristics |
| 4 Edge overrides | 769-778 | `applyEdgeOverrides()` filters/adds edges per human overrides |
| Return | 780-800 | `KnowledgeGraph` object with `meta`, `nodes`, `edges` |

### Helper Functions (all in `derive.ts`)
- `nodeId(prefix, name)` (68-70) — MD5 deterministic ID from `{prefix}:{name.lowercase()}`
- `buildVocabMap(vocab)` (72-93) — vocabulary clusters → `Map<string,string>` (lowercase → canonical)
- `resolveTerm(name, vocabMap)` (95-100) — case-insensitive vocab lookup, falls back to raw name
- `buildClusters(elements, idMap)` (179-231) — Union-Find connected components from `relatedIdentifiers` + translation links, filters to size ≥2
- `deduplicateClusterBySource(members)` (108-176) — at most 1 element per source+language per cluster
- `pickCanonicalName(names)` (233-250) — prefers names without exercise/game/variant suffixes, then no-hyphen, then longest
- `pickLongestName(names)` (252-254) — returns longest string (reused for descriptions, summaries)
- `createCanonicalElement(cluster, lang, clusterId)` (256-403) — merges cluster members' names/descriptions/summaries/howToPlay/mechanics/skills/tags/practical fields
- `pickLongestHowToPlay(options)` (405-411) — picks howToPlay with most steps
- `dedupSteps(steps)` (413-424) — **defined but never called**; deduplicates howToPlay steps by action text
- `computeClusterConfidence(el, memberIds)` (426-447) — average confidence from `relatedIdentifiers` + translation links (1.0)
- `deriveGraphFromFiles()` (803-831) — reads from disk, calls `deriveGraph()`
- `writeGraph(outputPath?)` (833-849) — calls `deriveGraphFromFiles()`, serializes to `output/graph.json`

---

## Q2 — Canonical Element Clusters from Normalized Elements

### Union-Find Implementation
- Inline within `buildClusters()` at `src/graph/derive.ts:183-196`
- `parent = Map<string, string>` (183), `find(x)` with path compression (184-192), `union(a,b)` (194-196)
- Union edges come from two sources:
  - Each element's `relatedIdentifiers[]` entries (198-200)
  - Explicit translation links (`translationLinkEnIdentifier`/`translationLinkDeIdentifier`) if target exists in `idMap` (202-208)
- Groups by root, filters to size ≥2 (223), then applies `deduplicateClusterBySource` (224)
- A **second** Union-Find exists in `src/review.ts:125-151` — merges canonical nodes by `translationOf` edges for display grouping only

### `relatedIdentifiers` Flow
- **Schema:** `src/normalize/normalized-schema.ts:79-82` — `{ identifier: z.string().length(32), confidence: z.number().min(0).max(1) }`
- **Origin (dedup pipeline):** `src/normalize/element-dedup.ts:400-489` — three sources merged:
  1. Deterministic matches (`findDeterministicMatches`, 142-227): name Jaccard + Levenshtein + mechanic overlap, threshold ≥0.65
  2. Translation seed pairs (`seedTranslationPairs`, `src/normalize/cross-source-matching.ts:15-36`): explicit trans link → confidence 1.0
  3. LLM matches (`findEnhancedLLMMatches`, 284-398): batched LLM calls for remaining unmatched elements, threshold ≥0.5
- **Override mutation:** `src/graph/overrides.ts:77-139` — `reject_match` removes entries, `add_match` adds confidence 1.0 entries
- **Consumed by Union-Find:** `src/graph/derive.ts:198-200`

### Translation Links in Clustering
Used at 5 points:
1. Seed pairs for dedup: `src/normalize/cross-source-matching.ts:15-36`
2. Union-Find edges: `src/graph/derive.ts:202-208` (DE→EN, EN→DE)
3. Intra-cluster dedup scoring: `src/graph/derive.ts:137-146` (counts as confidence 1.0 when same-cluster different-source)
4. Canonical translation edges: `src/graph/derive.ts:590-593` (EN↔DE canonical `translationOf`, confidence 1.0)
5. Review display grouping: `src/review.ts:125-151`

### Canonical Element Selection Rules
`createCanonicalElement()` at `src/graph/derive.ts:256-403`, operating on one language's members:
- **Label:** `pickCanonicalName()` (233-250) — penalizes names matching `-exercise|-game|-variant|-handle|-übung|-spiel|-show|-format` suffix, penalizes hyphens, breaks ties by length
- **Description:** `pickLongestName()` (252-254) — longest string wins
- **Summary:** `pickLongestName()` — longest string wins
- **HowToPlay:** `pickLongestHowToPlay()` (405-411) — most steps wins
- **Mechanics/Skills/Tags:** Union (Set deduplication) across all members
- **Difficulty:** Mode (most common value) across members (349-351)
- **Duration:** Average rounded to integer (352-354)
- **EnergyLevel:** Mode (355-357)
- **GroupSize:** Min of mins, max of maxes (358-359)
- **PlayerCount:** Min of mins, max of maxes (360-361)
- **Language fallback:** If no EN canonical exists, EN members link to DE canonical; vice versa (`derive.ts:576-587`)

---

## Q3 — `buildsOn` and `requires` Edges

### `requires` Edges

**Static lookup:** `src/graph/requirement-mapping.ts:7-31` — 5 requirement types:

| Requirement | Triggering mechanics (lowercase) | Triggering tags |
|---|---|---|
| `audience_input` | `audience suggestion`, `audience voting` | `Ask For`, `Zuschauer auf der Bühne` |
| `physical_contact` | `physical contact`, `touch to speak` | `Physical Contact`, `Körperkontakt und Berührung` |
| `music_singing` | `singing constraint`, `musical accompaniment` | `Musik und Gesang`, `Musikspiele` |
| `props_objects` | `object prompt`, `Human Props` | `Objects`, `Spiele mit Gegenständen` |
| `audience_on_stage` | *(none)* | `Audience on stage`, `Zuschauer auf der Bühne` |

`deriveRequirements(mechanics, tags)` at `src/graph/requirement-mapping.ts:33-49`:
- Lowercases mechanics and trims tags into Sets
- For each mapping entry: matches if **any** mechanic OR **any** tag hits
- Returns array of requirement label strings

Wired at `src/graph/derive.ts:688-697` — for each element (source + canonical), resolves mechanics through vocabulary, calls `deriveRequirements()`, creates `Requirement` nodes and `requires` edges.

### `buildsOn` Edges

**Derivation:** `src/graph/derive.ts:699-759` — Phase 3b:

Only **non-canonical** source elements from the **same source** are considered (711-715).

For each pair `(a, b)` from same source:
1. Both must have ≥1 mechanic (726)
2. Mechanic sets must differ in size (727) — enforces proper subset
3. Checks subset direction both ways:
   - Proper subset: every mechanic in smaller set must be in larger set (743)
   - Difficulty constraint: `difficulty(subset) ≤ difficulty(superset)` (746-748). Ranking: `{ beginner: 0, intermediate: 1, advanced: 2 }` (710), anything else → 0.
   - Duration constraint: if both have `typicalDurationMinutes > 0`, `duration(subset) ≤ duration(superset)` (750-752)
   - Distinct labels: `smaller.label !== larger.label` (754)
4. Edge direction: from **larger** (superset mechanics) → **smaller** (subset mechanics) (755)

No confidence field on auto-derived `buildsOn` edges.

### Vocabulary Interaction
- `requires` uses vocabulary-canonicalized mechanic names (`derive.ts:690`)
- `buildsOn` uses mechanic **node IDs** from `hasMechanic` edges (which were created from canonicalized names) — indirect canonicalization
- Canonical elements participate in `requires` but are **excluded** from `buildsOn` (`derive.ts:713`)

### Override Support
- `requires`: `add_requires`/`remove_requires` (`src/graph/overrides.ts:28-33,183-199`) — no CLI entry in `review.ts`
- `buildsOn`: `add_buildsOn`/`remove_buildsOn` (`src/graph/overrides.ts:35-40,201-215`) — no CLI entry in `review.ts`

---

## Q4 — Graph Overrides

### Override Types (10 total)
**File:** `src/graph/overrides.ts:11-49`

| Type | Interface | Stale detection | CLI in review.ts |
|---|---|---|---|
| `reject_match` | `DedupOverride` (11-17) | `contentHashes: Record<string,string>` | `--reject` |
| `add_match` | `DedupOverride` (11-17) | `contentHashes: Record<string,string>` | `--add-match` |
| `remove_edge` | `EdgeOverride` (19-26) | `contentHash: string` | `--remove-edge` |
| `add_edge` | `EdgeOverride` (19-26) | `contentHash: string` | `--add-edge` |
| `remove_requires` | `RequiresOverride` (28-33) | none | **none** |
| `add_requires` | `RequiresOverride` (28-33) | none | **none** |
| `remove_buildsOn` | `BuildsOnOverride` (35-40) | none | **none** |
| `add_buildsOn` | `BuildsOnOverride` (35-40) | none | **none** |
| `remove_variationOf` | `VariationOfOverride` (42-47) | none | **none** |
| `add_variationOf` | `VariationOfOverride` (42-47) | none | **none** |

### Storage
- **File:** `graph-overrides.json` (project root, or `GRAPH_OVERRIDES_PATH` env var)
- **Format:** `{ "version": 1, "overrides": [...] }` (`OverrideFile` interface, `overrides.ts:56-59`)
- **Current contents:** 5 overrides, all `reject_match`, none with `contentHashes` fields
- **Load:** `loadOverrides(filePath)` at `overrides.ts:252-258` — validates `version === 1`, returns `[]` on missing/invalid
- **Write:** `writeOverrides(filePath, overrides)` at `overrides.ts:260-262` — serializes `{ version: 1, overrides }`

### Content Hash Stale Detection
- Hash computed from raw HTML: `md5(htmlContent)` — `src/normalize/normalize.ts:15-17`
- Stored as `normalized.contentHash` — `src/normalize/normalized-schema.ts:68`
- Checked by `checkContentHash()` — `src/graph/overrides.ts:67-75`:
  - No stored hash → never stale (always apply)
  - No current hash → never stale (safety)
  - Otherwise exact string match required
- Only `DedupOverride` and `EdgeOverride` have hash fields; `RequiresOverride`, `BuildsOnOverride`, `VariationOfOverride` have no hash → always applied
- Stale overrides: skipped, counted in `graph.meta.overridesStale`, logged to console

### Application in Pipeline
1. **Phase 1b (dedup):** `derive.ts:539-548` — `applyDedupOverrides()` modifies `relatedIdentifiers` arrays
2. **Phase 4 (edges):** `derive.ts:769-778` — `applyEdgeOverrides()` filters/adds edges
3. Stats tallied in `graph.meta.overridesApplied` and `graph.meta.overridesStale` (`derive.ts:793-795`)

---

## Q5 — Review CLI

**File:** `src/review.ts`

### Graph Loading & Indices
`loadGraph()` at `src/review.ts:54-94` reads `output/graph.json` (or `--graph-path`) and builds 6 indices in a single pass:

| Index | Type | Built at | Purpose |
|-------|------|----------|---------|
| `elementNodes` | `ElementNode[]` | 63, 74 | Flat list for iteration/substring search |
| `elementById` | `Map<string, ElementNode>` | 64, 75 | O(1) ID lookup |
| `edgesByFrom` | `Map<string, GraphEdge[]>` | 65, 80-82 | Outgoing edges by node ID |
| `edgesByTo` | `Map<string, GraphEdge[]>` | 66, 84-86 | Incoming edges by node ID |
| `edgesByType` | `Map<string, GraphEdge[]>` | 67, 88-90 | All edges of a given type |
| `nodeById` | `Map<string, {id,type,label}>` | 68, 71 | Generic node lookup |

`findElement()` (96-107): exact ID match → case-insensitive substring on label.

### View Modes (Read-Only)

| Mode | Handler | Lines | What it shows |
|------|---------|-------|---------------|
| `--clusters` | `showClusters()` | 122-238 | Dedup clusters sorted by ascending `minConf` (weakest first), with confidence histogram |
| `--hubs` | `showHubs()` | 241-285 | Top Mechanic/Skill/Tag nodes by degree (in+out), with sample connected elements |
| `--element <q>` | `showElement()` | 288-351 | Full element details + grouped edges (sourcedFrom, canonicalOf, translationOf, hasMechanic, trainsSkill, hasTag) |
| `--random <N>` | `showRandom()` | 354-383 | N random canonical elements with label/summary/mechanics/skills |

Options: `--limit <N>` (default 30), `--graph-path`, `--overrides-path`.

### Override Commands (Write)
`addOverride()` at `src/review.ts:390-406` — loads `graph-overrides.json`, deduplicates by JSON key, appends, writes.

| Command | Override type | Lines |
|---------|--------------|-------|
| `--reject <a> <b>` | `reject_match` | 421-425 |
| `--add-match <a> <b>` | `add_match` | 430-435 |
| `--remove-edge <elt> <type> <target>` | `remove_edge` (constrained to hasMechanic/trainsSkill/hasTag) | 439-448 |
| `--add-edge <elt> <type> <target>` | `add_edge` (constrained to hasMechanic/trainsSkill/hasTag) | 450-458 |

**Not exposed via CLI:** `add_requires`/`remove_requires`, `add_buildsOn`/`remove_buildsOn`, `add_variationOf`/`remove_variationOf`. Manual edit required.

---

## Q6 — Vocabulary Loading and Canonicalization

### Vocabulary Creation (Stage 3)
`src/normalize/normalize.ts:437-489` — `normalizeVocabularyStage()`:
1. Loads all normalized elements from `output/normalized/{source}.json`
2. Calls `canonicalizeVocabulary()` in `src/normalize/vocab-cluster.ts:290-387`:
   - Collects all unique mechanic/skill terms (`collectTerms()`, `vocab-cluster.ts:6-23`)
   - Builds translation seeds: DE→EN element links with exactly 1 mechanic/skill each (`buildTranslationSeeds()`, 47-81)
   - Loads human thesaurus from `src/normalize/vocabulary-thesaurus.json` (currently empty)
   - Deterministic clustering via Jaccard token similarity (≥0.5) + Levenshtein fallback (≥0.6 for short terms ≤15 chars)
   - Stop word `"constraint"` filtered from mechanic tokens to prevent false clusters (`vocab-cluster.ts:120-129`)
   - Canonical name selection: prefers seeded terms, then frequency, then multi-word, then English, then shorter (`pickCanonical()`, 83-118)
3. Writes `output/vocabulary.json`
4. Applies canonical terms back to source files via `applyCanonicalTerms()` (`src/normalize/vocabulary.ts:38-70`)

### Vocabulary Consumption in Graph Derivation
1. `deriveGraphFromFiles()` reads `output/vocabulary.json` at `derive.ts:817-821`, falls back to empty `{ mechanics: [], skills: [] }` if missing
2. `buildVocabMap(vocab)` at `derive.ts:72-93`: flattens clusters → two `Map<string, string>` (lowercase → canonical)
3. `resolveTerm(name, vocabMap)` at `derive.ts:95-100`: case-insensitive lookup, raw name fallback
4. Applied at:
   - `derive.ts:650` — mechanic node IDs with canonical label
   - `derive.ts:658` — skill node IDs with canonical label
   - `derive.ts:690` — requirement derivation with canonicalized mechanics

### What Vocabulary Does NOT Cover
- **Tags** are not vocabulary-canonicalized (`derive.ts:666-668`)
- **`parent` field** on `VocabularyCluster` is never read during graph derivation
- **`derivedElements`** don't have their own mechanics wired (only parent element's)

---

## Q7 — Pipeline Artifact Flow and `graph.json` Structure

### Files Read by `deriveGraphFromFiles()`
**File:** `src/graph/derive.ts:803-831`

| File | Read at | Content |
|------|---------|---------|
| `output/normalized/improwiki.json` | 813 | `.elements: NormalizedElement[]` |
| `output/normalized/learnimprov.json` | 813 | `.elements: NormalizedElement[]` |
| `output/normalized/ircwiki.json` | 813 | `.elements: NormalizedElement[]` |
| `output/vocabulary.json` | 820 | `{ mechanics: VocabularyCluster[], skills: VocabularyCluster[] }` |
| `graph-overrides.json` | 825 | `{ version: 1, overrides: Override[] }` |

Missing files are silently skipped; missing vocabulary falls back to empty map.

### Graph Serialization
`writeGraph()` at `derive.ts:833-849`:
- Calls `deriveGraphFromFiles()` → `deriveGraph()`
- Writes pretty-printed JSON (2-space indent) to `output/graph.json`
- Called from `deriveGraphStage()` in `src/normalize/normalize.ts:496-501` (`--graph` flag)

### `graph.json` Top-Level Structure
**Interface:** `KnowledgeGraph` at `src/graph/derive.ts:48-66`

```json
{
  "meta": {
    "derivedAt": "<ISO 8601>",
    "nodeCount": int,
    "edgeCount": int,
    "elementCount": int,
    "sourceElementCount": int,
    "canonicalElementCount": int,
    "mechanicCount": int,
    "skillCount": int,
    "tagCount": int,
    "requirementCount": int,
    "sourceCount": int,
    "overridesApplied?": int,
    "overridesStale?": int
  },
  "nodes": [<GraphNode | ElementNode>, ...],
  "edges": [<GraphEdge>, ...]
}
```

3 top-level keys: `meta`, `nodes`, `edges`.

### Downstream Consumers
| Consumer | File:Line |
|---|---|
| HTTP server startup | `src/serve.ts:66-71` |
| `GET /graph.json` endpoint | `src/serve.ts:310-313` |
| Review CLI | `src/review.ts:55-61` |
| Query engine | `src/query/graph-query.ts:24-78` |
| Integration tests | `src/query/__testdata__/integration.test.ts:9-12` |

---

## Cross-Cutting Observations

1. **`derivedFrom` edge type is declared but never produced** (`derive.ts:42`). Only `variationOf` is emitted for derived elements (`derive.ts:535`). This may be intentional (different semantics intended but never implemented) or vestigial from an earlier design.

2. **`dedupSteps()` is defined but never called** (`derive.ts:413-424`). It deduplicates howToPlay steps by action text, but `createCanonicalElement()` uses `pickLongestHowToPlay()` instead, and no caller invokes `dedupSteps()`.

3. **Only 4 of 10 override types have CLI entry points** in `review.ts`. The remaining 6 (`requires`, `buildsOn`, `variationOf` variants) are functional in the graph pipeline but require manual JSON editing.

4. **Vocabulary canonicalization is applied twice**: once by `applyCanonicalTerms()` rewriting normalized source files in Stage 3, and again by `resolveTerm()` during graph derivation. This is redundant but defensive — if the graph is derived without running Stage 3 first, canonicalization still works.

5. **`deduplicateClusterBySource()` filtering is asymmetric**: elements dropped from a cluster become singletons and never get a canonical node, but no `canonicalOf` edge is created for them. They remain as orphaned source elements in the graph connected only by `sourcedFrom`.

6. **The `parent` field on `VocabularyCluster`** (`src/normalize/llm-client.ts:25`) exists to support hierarchical grouping from the thesaurus but is not consumed during graph derivation. No parent-child mechanic/skill edges are generated.

7. **`buildsOn` difficulty ranking is hardcoded** to 3 levels (`derive.ts:710`) with fallback `?? 0` for any unrecognized value. This means any non-standard difficulty string (e.g., "all levels") is treated as `beginner`.

---

## Open Areas

1. No test coverage for `checkContentHash()` stale-detection logic — all test fixtures use hardcoded `contentHash: "hash123"` and never vary it.

2. No test coverage for the translation-link fallback behavior in `canonicalOf` edge creation (EN member linked to DE canonical when no EN canonical exists, and vice versa).

3. The `REQUIREMENT_MAP` in `requirement-mapping.ts:7-31` is a hardcoded static array. Adding a new requirement type requires a code change, not configuration.

4. `dedupSteps()` exists but cannot be reached — either dead code or an unimplemented feature.

5. The `derivedFrom` edge type in the union may be vestigial or intended for future use. No code produces it, and no tests reference it.

6. The review CLI's `--remove-edge` and `--add-edge` commands cast the `edgeType` arg to `"hasMechanic" | "trainsSkill" | "hasTag"` at `review.ts:444,454`, which is narrower than what `EdgeOverride` supports (`"requires" | "buildsOn" | "variationOf"` are excluded from the CLI but valid in the override schema).
