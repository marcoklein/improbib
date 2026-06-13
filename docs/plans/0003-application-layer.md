# Plan 0003: Application Layer — From User Intentions to Graph Queries

> **Note**: The workshop search / theme expansion components in this plan have been revised
> by [Plan 0004](./0004-workshop-search.md). `theme.ts` is deleted. `POST /api/themes/expand`
> is replaced by `POST /api/search`. `suitable-for.ts` applies duration/energy defaults.
> See 0004 for current design.

## Goal

Build the application layer (P4–P6 from 0001) by planning backwards from what a workshop facilitator actually needs. The graph is the contract — the application consumes `graph.json` and translates human intent into graph queries.

## Project Context (for the implementing agent)

- **Runtime**: Bun. `bun test` for tests, `bun run` for scripts.
- **Dependencies**: None beyond what's already in `package.json`. No UI framework, no router library. Zero new deps.
- **Server entry**: `src/serve.ts` — uses `Bun.serve()` with a manual `if/else` route chain. Each route is a separate `if` block checking `url.pathname`. Helper functions: `jsonResponse(data, req)` for JSON, `serveFile(path, req, contentType?)` for file serving. HTML files are served from `public/` via the catch-all at the top of the fetch handler.
- **Graph derivation**: `src/graph/derive.ts` — `deriveGraph(elements, vocabulary, overrides)` takes normalized elements and produces `KnowledgeGraph` (nodes + edges). Edges are added in three phases: Phase 1 (source elements), Phase 2 (clusters + canonicals), Phase 3 (domain edges — mechanics, skills, tags wired via `addEdge()`). New edges in this plan go into Phase 3.
- **Overrides system**: `src/graph/overrides.ts` — `Override = DedupOverride | EdgeOverride`. Each override has a `type` string discriminant. Extending to new types follows the same pattern.
- **Normalized schema**: `src/normalize/normalized-schema.ts` defines `NormalizedElement`. The field `derivedElements` (array of sub-elements from inline variations) already exists on the normalized output.
- **Existing graph.json structure**: `src/graph/derive.ts` exports `KnowledgeGraph { meta, nodes: (GraphNode | ElementNode)[], edges: GraphEdge[] }`. Nodes have `{ id, type, label }`. Elements add `{ canonical, description, summary, languageCode, sourceName, url, tags, sources, difficulty, typicalDurationMinutes, playerCountMin, playerCountMax }`. Edges have `{ type, from, to, confidence? }`. See `src/graph/derive.ts:35-52` for the exported interfaces.
- **Conventions**: Edges are added via a helper function pattern. New node/edge types are added by extending the existing `if/else` chains. Graph derivation uses `createHash("md5")` for stable IDs. Tests live alongside source files or in `__testdata__/` directories. The project uses no comments in code (see AGENTS.md convention).

## Approach: Plan Backwards from User Intentions

Instead of "what can the graph do → build UI," ask: "what does a facilitator ask → what graph capabilities enable that → what do we build?"

### Scene 1: Constrained Workshop Planning

> *"I'm running a 2-hour workshop for 12 beginners. Focus on storytelling. No audience. Small room, sitting down. Give me a sequence."*

| Need | Current | Action |
|------|---------|--------|
| Filter by duration, difficulty, players | ✅ | — |
| Filter by skill focus | ✅ `trainsSkill → storytelling` | — |
| **Exclude exercises needing audience** | ❌ | `requires → audience_input` edge |
| **Sequence warm-up → main → closer** | ❌ | `suitableFor` + `buildsOn` edges + energy arc |
| **Thematic expansion** ("storytelling" is more than one skill node) | ❌ | Theme → graph node translation |

### Scene 2: Exercise Discovery

> *"We just did Zip Zap Zop. What's similar but harder? Show me variations."*

| Need | Current | Action |
|------|---------|--------|
| Find similar exercises | ❌ | On-the-fly mechanic+skill Jaccard overlap |
| Find harder version | ❌ | `buildsOn` edges or difficulty-ordered similarity |
| Show variations | ❌ | `variationOf` edges from `derivedElements` |

### Scene 3: Thematic Browsing

> *"Show me everything about status games."*

| Need | Current | Action |
|------|---------|--------|
| Tag/mechanic/skill browsing | Partial | Add paginated, filterable list endpoints |
| Element detail with full edges | Partial | `/api/elements/:id` + `:id/similar` |
| Compare two elements | ❌ | Side-by-side edge comparison endpoint |

## Architecture

```
graph-overrides.json ──┐
                        ├──► deriveGraph() ──► output/graph.json ──► server loads at startup
vocabulary.json ────────┘                                                 │
                                                                         ▼
                                                          src/query/graph-query.ts
                                                          (in-memory index + query functions)
                                                                         │
                                                          ┌──────────────┴──────────────┐
                                                          ▼                             ▼
                                                     /api/elements                 /api/workshop
                                                     /api/elements/:id             /api/themes/expand
                                                     /api/elements/:id/similar     /api/workshop/plan
                                                          │                             │
                                                          ▼                             ▼
                                                     public/elements.html        public/workshop.html
                                                     (vanilla JS fetches API, renders inline)
```

Data flows one direction. Layers are independent. The application consumes only the graph.

**Server startup flow**: `serve.ts` loads `output/graph.json` via `Bun.file(...).json()`, calls `createGraphIndex(graph)` from `graph-query.ts`, stores the index in module scope. All API handlers read from the in-memory index — no file I/O per request.

## What We Build

### 1. Graph Enrichment (no LLM changes, deterministic derivation)

These changes happen during `deriveGraph()` in `src/graph/derive.ts`. All new edges are added in Phase 3 (alongside existing hasMechanic/trainsSkill/hasTag wiring).

**A. Requirement edges** (`requires`)

New node type `Requirement`. New edge type `requires` from Element → Requirement. Derived deterministically from existing tags + mechanics on each element.

**New file: `src/graph/requirement-mapping.ts`**

```typescript
// Config: which tags and mechanics imply which requirement
export const REQUIREMENT_MAP: {
  requirement: string;       // canonical requirement ID label
  mechanics: string[];       // normalized mechanic labels that trigger it
  tags: string[];            // raw tag labels that trigger it
}[] = [
  {
    requirement: "audience_input",
    mechanics: ["audience suggestion", "audience voting"],
    tags: ["Ask For", "Zuschauer auf der Bühne"],
  },
  {
    requirement: "physical_contact",
    mechanics: ["physical contact", "touch to speak"],
    tags: ["Physical Contact", "Körperkontakt und Berührung"],
  },
  {
    requirement: "music_singing",
    mechanics: ["singing constraint", "musical accompaniment"],
    tags: ["Musik und Gesang", "Musikspiele"],
  },
  {
    requirement: "props_objects",
    mechanics: ["object prompt", "Human Props"],
    tags: ["Objects", "Spiele mit Gegenständen"],
  },
  {
    requirement: "audience_on_stage",
    mechanics: [],
    tags: ["Audience on stage", "Zuschauer auf der Bühne"],
  },
];

/**
 * Returns the set of requirement labels that apply to a given element,
 * based on its mechanics and tags intersecting with REQUIREMENT_MAP.
 */
export function deriveRequirements(
  mechanics: string[],  // normalized mechanic labels (already canonicalized via vocabulary)
  tags: string[],       // raw tag labels from source
): string[]
```

**Implementation in `derive.ts`** — Phase 3, after hasMechanic/trainsSkill/hasTag are wired. For each element (source AND canonical), call `deriveRequirements(elementMechanics, elementTags)`, add a `Requirement` node per requirement label (if not already added), add a `requires` edge from element → requirement node. Node IDs for requirements use the same `createHash("md5").update("requirement:" + label)` pattern as mechanics and skills.

| Requirement | Triggered by mechanic | Triggered by tag |
|-------------|----------------------|------------------|
| `audience_input` | `audience suggestion`, `audience voting` | `Ask For`, `Zuschauer auf der Bühne` |
| `physical_contact` | `physical contact`, `touch to speak` | `Physical Contact`, `Körperkontakt und Berührung` |
| `music_singing` | `singing constraint`, `musical accompaniment` | `Musik und Gesang`, `Musikspiele` |
| `props_objects` | `object prompt`, `Human Props` | `Objects`, `Spiele mit Gegenständen` |
| `audience_on_stage` | — | `Audience on stage`, `Zuschauer auf der Bühne` |

**Overrides in `graph-overrides.json`**: Support `requires` overrides with the following format:

```json
{
  "type": "add_requires",
  "elementId": "<32-char-md5>",
  "requirementLabel": "audience_input",
  "note": "This exercise needs audience input but wasn't auto-detected"
}
{
  "type": "remove_requires",
  "elementId": "<32-char-md5>",
  "requirementLabel": "physical_contact",
  "note": "This exercise was incorrectly flagged for physical contact"
}
```

The `requires` overrides use the same element-identifier-based pattern as existing `EdgeOverride`s but target Requirement nodes by label string (not node ID) since Requirement node IDs are derived from labels.

**B. Dependency edges** (`buildsOn`)

New edge type `buildsOn` from Element → Element (both canonical and source). Edge direction: B `buildsOn` A means "B requires skills/mechanics from A" — A is the prerequisite, B is the dependent.

**Heuristic inference** — implemented in Phase 3 of `derive.ts`, after canonical elements are created:

1. Build a map of element ID → set of mechanic IDs (the node IDs of mechanics connected via `hasMechanic` edges)
2. For every pair of elements (A, B) from the same source (NOT cross-source — those are dedup targets, not dependencies):
   - If A's mechanic set ⊂ B's mechanic set (proper subset, A is strictly simpler)
   - AND A's difficulty ≤ B's difficulty (using numeric ranking: beginner=0, intermediate=1, advanced=2)
   - AND A's duration ≤ B's duration (if both have duration set)
   - AND A and B have different labels (not the same name from different rows)
3. Then B `buildsOn` A

**Overrides in `graph-overrides.json`**:

```json
{
  "type": "add_buildsOn",
  "fromElementId": "<element-B-id>",
  "toElementId": "<prerequisite-A-id>",
  "note": "Harold-Sheila requires Harold-French"
}
{
  "type": "remove_buildsOn",
  "fromElementId": "<element-B-id>",
  "toElementId": "<prerequisite-A-id>",
  "note": "False dependency — these are siblings not prerequisites"
}
```

**C. Variation edges** (`variationOf`)

New edge type `variationOf` from Element → Element. Edge direction: X `variationOf` Y means X is an inline variation of exercise Y.

**Implementation in `derive.ts`** — during Phase 1 (source element creation), when processing a normalized element that has `derivedElements`:

1. The parent element gets source element node(s) created normally.
2. Each entry in `derivedElements` already has a `splitFrom` field pointing to the parent identifier. Find the parent's graph node ID via the idMap.
3. Add `variationOf` edge from the child element's node ID → parent element's node ID.

The field `derivedElements` on `NormalizedElement` is defined in `src/normalize/normalized-schema.ts`. Each derived element has: `{ identifier, name, description, mechanics, skills, tags, splitFrom (parent identifier) }`.

**Overrides in `graph-overrides.json`**:

```json
{
  "type": "add_variationOf",
  "fromElementId": "<variation-child-id>",
  "toElementId": "<parent-id>",
  "note": "This is a variation of Freeze Tag"
}
{
  "type": "remove_variationOf",
  "fromElementId": "<variation-child-id>",
  "toElementId": "<parent-id>",
  "note": "Not actually a variation — distinct exercise"
}
```

### 2. Query Layer (server-side, consumes in-memory graph)

All query files live under `src/query/`. They import the `KnowledgeGraph` type from `src/graph/derive.ts`. They have no knowledge of sources, scraping, or normalization — they consume only the graph.

**Core file: `src/query/graph-query.ts`**

Loads `output/graph.json` once into typed in-memory structures. Exports query functions used by the API server.

```typescript
import type { KnowledgeGraph, GraphEdge } from "../graph/derive";

// ── Graph Index (in-memory) ──

export interface GraphIndex {
  meta: KnowledgeGraph["meta"];
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeById: Map<string, GraphNode>;
  edgesByFrom: Map<string, GraphEdge[]>;   // node ID → outgoing edges
  edgesByTo: Map<string, GraphEdge[]>;     // node ID → incoming edges
  edgesByType: Map<string, GraphEdge[]>;   // edge type → all edges of that type
  elements: ElementNode[];                  // all Element nodes (source + canonical)
  canonicals: ElementNode[];               // Element nodes where canonical: true
}

export function createGraphIndex(graph: KnowledgeGraph): GraphIndex;
export function getGraphIndex(): GraphIndex;       // throws if not loaded
export function reloadGraph(path: string): GraphIndex;

// ── Element Queries ──

export interface ElementResult {
  id: string;
  label: string;
  summary: string;
  canonical: boolean;
  languageCode: string;
  difficulty?: string;
  typicalDurationMinutes?: number;
  playerCountMin?: number;
  playerCountMax?: number;
  energyLevel?: string;
  tags: string[];
  mechanicLabels: string[];
  skillLabels: string[];
  requirementLabels: string[];
}

export interface ElementFilters {
  difficulty?: string;
  minPlayers?: number;
  maxPlayers?: number;
  minDuration?: number;
  maxDuration?: number;
  tag?: string;                    // element must have this tag
  mechanic?: string;               // element must have this mechanic (label match)
  skill?: string;                  // element must train this skill (label match)
  excludeRequirements?: string[];  // exclude elements with ANY of these requirement edges
  requireRequirements?: string[];  // include ONLY elements with ALL of these requirement edges
  canonicalOnly?: boolean;         // default: true
  language?: string;               // default: "en"
}

export interface PaginatedResult {
  results: ElementResult[];
  total: number;
  page: number;
  limit: number;
}

export function queryElements(filters: ElementFilters & { page?: number; limit?: number }): PaginatedResult;

// ── Element Detail ──

export interface ElementDetail {
  element: ElementNode;
  edges: {
    sourcedFrom: GraphEdge[];
    canonicalOf: GraphEdge[];
    translationOf: GraphEdge[];
    hasMechanic: GraphEdge[];
    trainsSkill: GraphEdge[];
    hasTag: GraphEdge[];
    requires: GraphEdge[];
    buildsOn_from: GraphEdge[];    // outgoing buildsOn (this builds on others)
    buildsOn_to: GraphEdge[];      // incoming buildsOn (others build on this)
    variationOf_from: GraphEdge[]; // outgoing variationOf (this is a variation of...)
    variationOf_to: GraphEdge[];   // incoming variationOf (...is a variation of this)
  };
  similar: ElementResult[];
}

export function getElementDetail(id: string): ElementDetail | null;

// ── Similarity ──

export function getSimilarElements(id: string, limit?: number): ElementResult[];

// ── Theme Expansion ──

export interface ThemeNode {
  type: "Mechanic" | "Skill" | "Tag";
  id: string;
  label: string;
}

export function expandTheme(theme: string): ThemeNode[];
```

**Implementation notes for `graph-query.ts`**:

- `queryElements()`: Start with `canonicals` (or all elements if `canonicalOnly: false`). Apply each filter as a separate pass. For tag/mechanic/skill filters, resolve label → node ID via an in-memory label index (lowercase), then check if the element has the corresponding edge. For requirement filters, resolve label → requirement node ID, check `requires` edges.
- `getElementDetail()`: Look up node by ID, collect all outbound edges from `edgesByFrom`, inbound from `edgesByTo`. Call `getSimilarElements()` for the similar list.
- `getSimilarElements()`: Compute Jaccard coefficient between this element's mechanic+skill edge target set and every other canonical element's. Filter out the element itself. Sort descending by overlap. Return top N. If the element has 0 mechanics and 0 skills, return empty array (can't compute similarity).
- `createGraphIndex()`: Also builds lowercase label → node ID index maps for mechanics, skills, tags, and requirements for fast label-based lookups.

**`src/query/similarity.ts`** — extracted from `graph-query.ts` if it grows complex. Otherwise, inline.

**`src/query/suitable-for.ts`**:

```typescript
export type SuitableFor = "warmup" | "exercise" | "performance" | "encore";

export function deriveSuitableFor(
  difficulty?: string,
  durationMinutes?: number,
  energyLevel?: string,
): SuitableFor
```

Heuristic rules (applied in order, first match wins):

| Heuristic | Condition |
|-----------|-----------|
| `encore` | energyLevel = "high" AND duration ≤ 5 min |
| `warmup` | difficulty = "beginner" AND duration ≤ 10 min AND energyLevel IN ("medium", "high") |
| `performance` | difficulty IN ("intermediate", "advanced") AND duration ≥ 15 min |
| `exercise` | fallback default (all other cases) |

If `energyLevel` is missing/undefined, skip the `encore` check. If `difficulty` is missing, skip warmup and performance checks. `exercise` is always the fallback.

**`src/query/theme.ts`**:

```typescript
import type { ThemeNode } from "./graph-query";
export function expandTheme(theme: string): ThemeNode[];
```

- Lowers theme string, splits into words, filters stop words (a, the, is, of, in, and, to, for, with, on)
- For each remaining word, searches all mechanic/skill/tag labels (case-insensitive substring match)
- Each matched label adds one entry to results, with score = how many theme words matched
- Results ranked by score descending
- In-memory cache: `Map<string, ThemeNode[]>` — cache key is the theme string. Cache cleared on graph reload.

**`src/query/workshop-planner.ts`**:

```typescript
export interface WorkshopConstraints {
  duration: number;             // total minutes
  players: number;
  difficulty?: string;
  constraints?: string[];       // "no-audience", "no-physical-contact", "no-music", "no-props"
  theme?: string;
}

export interface WorkshopPlan {
  warmUp: ElementResult[];
  main: ElementResult[];
  closer: ElementResult[];
  totalDuration: number;
  fallbacks: Record<string, ElementResult[]>;  // by slot position, for "replace with..."
  warnings: string[];                           // degradation explanations
}

export function planWorkshop(constraints: WorkshopConstraints): WorkshopPlan;
```

Pipeline (each step is a function, chainable):

1. **`expandTheme(theme)`** — if theme provided: deterministic substring match → target `ThemeNode[]`. Skip if no theme.
2. **`findThematicElements(targetNodes)`** — for each target node, collect connected elements from edges. Score elements by unique target node count connected to. Return sorted by score descending.
3. **`applyConstraints(elements, constraints)`** — map constraint strings to exclusion rules:
   - `"no-audience"` → excludeRequirement: `["audience_input", "audience_on_stage"]`
   - `"no-physical-contact"` → excludeRequirement: `["physical_contact"]`
   - `"no-music"` → excludeRequirement: `["music_singing"]`
   - `"no-props"` → excludeRequirement: `["props_objects"]`
4. **`dedupeElements(elements)`** — group by canonical cluster (elements with same `canonicalOf → canonicalId`). Keep only the canonical element per cluster. If an element has no canonicalOf edge (it IS a canonical), keep it directly.
5. **`filterByPlayers(elements, count)`** — keep elements where `playerCountMin ≤ count ≤ playerCountMax`, or where both are undefined/unset.
6. **`classifySuitableFor(elements)`** — apply `deriveSuitableFor()` heuristic to each element.
7. **`sequence(elements)`** — three passes:
   - **Warm-up**: pick elements with `suitableFor = warmup`, sort by duration ascending. Fill until ~15% of total duration.
   - **Main**: remaining elements, sorted by difficulty ascending then duration ascending. Respect `buildsOn` chains: if B `buildsOn` A, A must appear before B in the sequence. Fill until ~70% of total duration.
   - **Closer**: elements with `suitableFor = performance` or `encore`, sorted by energyLevel (high first). Fill until total duration.
8. **`fillGaps(plan, targetDuration)`** — if total duration < target, find `getSimilarElements()` for elements already in the plan that fit the remaining time. Add to `fallbacks` map.
9. **`addWarnings(plan, originalConstraints)`** — if not all constraints could be met, or fewer elements than expected, add warning strings.

**`src/query/similarity.ts`** (if needed as separate file):

```typescript
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}
```

### 3. User Interfaces

**Web UI** — zero new dependencies. Vanilla HTML + CSS + JS in `public/`. Two pages total.

The existing server serves files from `public/` at line 154-163 of `src/serve.ts`. Any `.html` file placed there is served automatically. API calls from HTML pages use `fetch()` to the API endpoints defined below. All API responses are JSON.

| Page | Route | Content |
|------|-------|---------|
| Workshop planner | `/workshop.html` | Landing page + workshop planner. Top: graph stats, theme search bar (POSTs to `/api/themes/expand`). Below: form (duration, players, difficulty, constraints as checkboxes, theme text field). Submit → POST `/api/workshop/plan` → renders exercise cards grouped as warm-up / main / closer, with "Replace" button per slot showing fallbacks. |
| Element browser | `/elements.html` | Combined browse + detail. Top: filter form (difficulty, min/max duration, min/max players, tag/mechanic/skill text inputs, requirement exclusions). Submit → GET `/api/elements?...` → paginated card grid. Click any card → inline detail expands below: full description, mechanics, skills, tags, requirements, similar exercises, build chain (prerequisites + harder versions), variations. |

Each page is a standalone HTML file with inline `<script>` and `<style>`. No client-side routing, no build step. Element detail is shown inline within the same page (click card → fetch `/api/elements/:id` → expand detail panel below grid). Pages read query params from `URLSearchParams`. Use `fetch()` with `Content-Type: application/json` for POST requests. Render results by creating DOM elements with `document.createElement()`.

**No CLI, no separate landing page, no show builder** — stripped to the two core facilitator actions: plan a workshop, explore exercises.

### 4. API Endpoints (added to `src/serve.ts`)

All added to the existing `if/else` chain in the `fetch` handler. Each is a separate `if (url.pathname === "...")` block above the final `return new Response("Not Found", { status: 404 })`.

All endpoints return `jsonResponse(data, req)`. POST endpoints parse the body with `await req.json()`.

| Method | Path | Handler |
|--------|------|---------|
| `GET` | `/api/elements` | `queryElements(params)` — parse query string to `ElementFilters` + `page`/`limit`. Return `PaginatedResult`. |
| `GET` | `/api/elements/:id` | Extract id from path segment. Call `getElementDetail(id)`. Return 404 if null. |
| `GET` | `/api/elements/:id/similar` | Parse `?limit=N`. Call `getSimilarElements(id, limit)`. |
| `POST` | `/api/themes/expand` | Parse `{ theme }` from body. Call `expandTheme(theme)`. Return `{ nodes }`. |
| `POST` | `/api/workshop/plan` | Parse `WorkshopConstraints` from body. Call `planWorkshop()`. Return `WorkshopPlan`. |

**Route parameter extraction**: The server doesn't use a router. For paths like `/api/elements/:id`, split `url.pathname` on `/` and extract the last segment.

**Server startup changes** — near the top of `serve.ts`, after the imports:

```typescript
import { createGraphIndex, getGraphIndex } from "./query/graph-query";

// Load graph into memory at startup
const graphPath = path.join(process.cwd(), "output", "graph.json");
try {
  const graphFile = Bun.file(graphPath);
  if (await graphFile.exists()) {
    const graph = await graphFile.json();
    createGraphIndex(graph);
    console.log(`Graph loaded: ${graph.meta.nodeCount} nodes, ${graph.meta.edgeCount} edges`);
  } else {
    console.log("No graph.json found — query API will return 503 until graph is derived");
  }
} catch (err) {
  console.error("Failed to load graph:", err);
}
```

API endpoints check `getGraphIndex()` and return `jsonResponse({ error: "Graph not available" }, req)` with status 503 if no graph is loaded.

## Node & Edge Types (additions)

New node type added to graph nodes (same shape as existing `Mechanic`, `Skill`, `Tag`, `Source`):

| Node | `type` value | `label` example | ID derivation |
|------|-------------|-----------------|---------------|
| `Requirement` | `"Requirement"` | `"audience_input"` | `createHash("md5").update("requirement:" + label.toLowerCase())` |

New edge types added to `GraphEdge.type` union:

| Edge | `type` value | From → To | Meaning |
|------|-------------|-----------|---------|
| `requires` | `"requires"` | Element → Requirement | "Playing this exercise requires X" |
| `buildsOn` | `"buildsOn"` | Element → Element | "This exercise builds on skills from that one" |
| `variationOf` | `"variationOf"` | Element → Element | "This is an inline variation of that" |

## Multi-Language Strategy

EN is the source of truth. All UI pages show EN canonical elements by default. DE canonicals are accessible via `translationOf` edges from their EN counterparts. An element detail page showing an EN canonical also lists its `translationOf` outbound edge to the DE canonical. The `queryElements()` function defaults to `language: "en"` and filters to elements with `languageCode === "en"`. Pass `language: undefined` to get both languages.

## Error Handling

Graceful degradation at every layer:

| Situation | Behavior |
|-----------|----------|
| Graph not derived yet | API returns 503 `{ error: "Graph not available — run graph derivation first" }` |
| No elements match all constraints | Return partial results. `warnings` array explains which constraint was relaxed |
| Theme expansion finds no matches | Broaden: remove the shortest theme word, retry. If still empty, return `{ nodes: [], warning: "No matching concepts found for theme 'X'" }` |
| Element ID not found | Return 404 `{ error: "Element not found: <id>" }` |
| Invalid request body (POST) | Return 400 `{ error: "Invalid request", details: "<specific field>" }` |
| EnergyLevel missing on element | `suitableFor` heuristic skips energy-dependent checks, falls back to `exercise` |
| Element has 0 mechanics + 0 skills | `getSimilarElements()` returns empty array |
| LLM unavailable | Not applicable — MVP uses deterministic substring matching only |

## Phasing

### Phase 1: Graph Enrichment (requirements + dependencies + variations)

**New file: `src/graph/requirement-mapping.ts`**
- Export `REQUIREMENT_MAP` constant (see format above)
- Export `deriveRequirements(mechanics: string[], tags: string[]): string[]`

**Modified: `src/graph/derive.ts`**
- In Phase 3 (after mechanics/skills/tags are wired), iterate over all elements:
  - Call `deriveRequirements()` for each element's mechanics and tags
  - Add `Requirement` nodes (idempotent — check if node exists before adding)
  - Add `requires` edges from element → requirement node
- Add `buildsOn` inference in same phase:
  - Build map of element ID → set of mechanic node IDs
  - For each pair (A, B) from same source: if A's mechanics ⊂ B's mechanics, A ≤ difficulty, A ≤ duration, different labels → B `buildsOn` A
- In Phase 1 (source element creation), add `variationOf` edges:
  - When creating source element nodes, check if the normalized element has `derivedElements`
  - For each derived element, find its graph node via the idMap, add `variationOf` edge from derived element → parent element
- Export new node type `"Requirement"` in `GraphNode` type union
- Export new edge types `"requires"`, `"buildsOn"`, `"variationOf"` in `GraphEdge.type` union

**Modified: `src/graph/overrides.ts`**
- Add these override types to `Override` union:
  - `{ type: "add_requires" | "remove_requires", elementId, requirementLabel, note? }`
  - `{ type: "add_buildsOn", fromElementId, toElementId, note? }`
  - `{ type: "remove_buildsOn", fromElementId, toElementId, note? }`
  - `{ type: "add_variationOf", fromElementId, toElementId, note? }`
  - `{ type: "remove_variationOf", fromElementId, toElementId, note? }`
- Apply in `applyEdgeOverrides()`: add_* injects edges, remove_* filters them. Requires overrides target Requirement nodes by label string.

**Tests:**
- `src/graph/__testdata__/requirement.test.ts` — mechanic/tag → requirement mapping, overrides
- `src/graph/__testdata__/dependency.test.ts` — buildsOn heuristic, variationOf wiring, overrides

### Phase 2: Query Layer + API + UI

**New files under `src/query/`:**
- `graph-query.ts` — `GraphIndex`, `createGraphIndex()`, `queryElements()`, `getElementDetail()`, `getSimilarElements()`, `expandTheme()`
- `similarity.ts` — `jaccardSimilarity()` helper
- `theme.ts` — `expandTheme()` with caching
- `workshop-planner.ts` — `planWorkshop()` pipeline
- `suitable-for.ts` — `deriveSuitableFor()` heuristic

**Modified: `src/serve.ts`**
- Add startup graph loading (see "Server startup changes" above)
- Add 5 new API endpoints (see "API Endpoints" table above)
- Each endpoint: guard with `getGraphIndex()` check, parse params/body, call query function, return JSON

**New files in `public/`:**
- `workshop.html` — landing page + workshop planner form + results
- `elements.html` — combined browse + inline detail (filter grid → click card → expand detail)

**Tests:**
- `src/query/__testdata__/query.test.ts` — unit tests for query functions using a minimal test graph
- `src/query/__testdata__/api.test.ts` — integration tests: mock graph, start server, call endpoints, verify responses

### Phase 3: Integration + Verify

- Verify `bun test` passes for all new and existing tests
- Verify `bun run src/normalize/normalize.ts --graph` produces graph with new edges
- Verify `bun run src/review.ts --clusters` still works (new edges counted in meta)
- Open `/workshop.html` in browser → form submits and renders a plan
- Open `/elements.html` in browser → filters work, click card expands detail
- Plan 0001 is already updated with phase status and forward references

## Deliverables per Phase

| Phase | New files | Modified files | Tests |
|-------|-----------|---------------|-------|
| 1 | `src/graph/requirement-mapping.ts` | `derive.ts`, `overrides.ts` | `requirement.test.ts`, `dependency.test.ts` |
| 2 | `src/query/graph-query.ts`, `src/query/similarity.ts`, `src/query/theme.ts`, `src/query/workshop-planner.ts`, `src/query/suitable-for.ts`, `public/workshop.html`, `public/elements.html` | `serve.ts` | `query.test.ts`, `api.test.ts` |
| 3 | — | — (verify only) | `bun test` (existing + new) |

## Execution Order

```
Phase 1 (graph enrichment) ──► Phase 2 (query layer + API + UI) ──► Phase 3 (integration + verify)
```

Phase 1 is pure TypeScript + graph derivation — no server, no UI. Phase 2 builds on Phase 1's edges. Phase 3 is verification only.

## Open Questions (all resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | Theme expansion — LLM or deterministic? | **Deterministic substring matching** for MVP. Embeddings considered for future. |
| 2 | Graph reload after re-derivation? | **Require restart.** Simplest. Deploy restarts the server. |
| 3 | Multi-language UI strategy? | **EN as source of truth.** DE canonicals accessible via translation links. |
| 4 | Similarity pre-computation or on-the-fly? | **On-the-fly Jaccard.** ~2ms for 2000 elements. No pre-computation file. |
| 5 | Sequencing algorithm depth? | **Simple sort + buildsOn chains** for MVP. |
| 6 | suitableFor — LLM extraction or heuristic? | **Heuristic derivation** now. LLM extraction in future. |
| 7 | movementType for physical constraints? | **Skip for MVP.** Not part of initial scope. |
| 8 | Update Plan 0001? | **Already done.** P1–P3 marked ✅, forward refs to 0003. |
| 9 | Workshop plan caching? | **Per-theme-string cache** for theme expansion. No plan-level caching. |
| 10 | Error handling strategy? | **Graceful degradation.** Partial results with explanations. |
| 11 | Client-side portability? | **Server-side only for now.** Design query functions as pure functions. |
