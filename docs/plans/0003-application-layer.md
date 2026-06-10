# Plan 0003: Application Layer — From User Intentions to Graph Queries

## Goal

Build the application layer (P4–P6 from 0001) by planning backwards from what a workshop facilitator actually needs. The graph is the contract — the application consumes `graph.json` and translates human intent into graph queries.

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

### Scene 3: Show Set Building

> *"Build me a 5-game short-form set for a 30-minute slot. Include one audience participation game."*

| Need | Current | Action |
|------|---------|--------|
| Duration fitting | ✅ | — |
| Format template (Harold phases, short-form slots) | ❌ | Format definitions as configurable data |
| Filter by audience participation | ❌ | `requires → audience_on_stage` |
| Variety constraint (avoid repeating mechanics) | ❌ | Dedup check in sequence planner |

### Scene 4: Thematic Browsing

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
                                                          ┌──────────────┼──────────────┐
                                                          ▼              ▼              ▼
                                                     /api/elements   /api/workshop   /api/shows
                                                          │              │              │
                                                          ▼              ▼              ▼
                                                     public/*.html  (vanilla JS fetches API, renders)
                                                          │
                                                          ▼
                                                     src/workshop.ts (CLI — same functions, local file)
```

Data flows one direction. Layers are independent. The application consumes only the graph.

## What We Build

### 1. Graph Enrichment (no LLM changes, deterministic derivation)

**A. Requirement edges** (`requires`)

New node type `Requirement` with 5 canonical concepts. Derived deterministically from existing tags + mechanics during graph derivation. Mapping defined in a config file.

| Requirement | Triggered by mechanic | Triggered by tag |
|-------------|----------------------|------------------|
| `audience_input` | `audience suggestion`, `audience voting` | `Ask For`, `Zuschauer auf der Bühne` |
| `physical_contact` | `physical contact`, `touch to speak` | `Physical Contact`, `Körperkontakt und Berührung` |
| `music_singing` | `singing constraint`, `musical accompaniment` | `Musik und Gesang`, `Musikspiele` |
| `props_objects` | `object prompt`, `Human Props` | `Objects`, `Spiele mit Gegenständen` |
| `audience_on_stage` | — | `Audience on stage`, `Zuschauer auf der Bühne` |

Supports manual overrides via `graph-overrides.json`. In the graph, a requirement edge means "this element requires X" — to filter it out, query by "exclude elements with `requires → X`."

**B. Dependency edges** (`buildsOn`)

Heuristic inference: if element A's targetQuantity ⊂ element B's targetQuantity AND A ≤ difficulty AND ≤ duration AND same source, then B `buildsOn` A. Exclude cross-source dedup pairs (same name, different source). Supports manual overrides.

Enables: "if they've done Harold-French, do Harold-Sheila next."

**C. Variation edges** (`variationOf`)

From normalized `derivedElements` — if element X was extracted as an inline variation of parent Y, add `variationOf` edge from X → Y. Already in the data, just not wired as graph edges.

Enables: "show me all variations of Freeze Tag."

### 2. Query Layer (server-side, consumes in-memory graph)

**New file: `src/query/graph-query.ts`** — loads `graph.json` once, builds in-memory indexes (by id, by type, by edge type, by label). All query functions run against in-memory data. No file I/O at query time.

**A. Filtered element list**

```
GET /api/elements?difficulty=beginner&minPlayers=8&maxPlayers=12
                  &tag=emotion&mechanic=freeze_signal&skill=storytelling
                  &excludeRequirement=audience_input,physical_contact
                  &page=1&limit=20
        → { results: [{id, label, summary, difficulty, duration, mechanics, skills}], total, page }
```

Paginated. All filters optional. Exclude filters invert (remove elements with the given requirement edge).

**B. Element detail**

```
GET /api/elements/:id
        → { element, edges: { hasMechanic, trainsSkill, hasTag, requires, canonicalOf,
              sourcedFrom, translationOf, buildsOn_from, buildsOn_to,
              variationOf_from, variationOf_to }, similar: [...] }
```

Returns full element + all inbound/outbound edges + top 20 similar elements.

**C. Similar elements**

```
GET /api/elements/:id/similar?limit=10
```

On-the-fly Jaccard overlap of mechanic + skill sets against all other canonical elements. No pre-computation — ~2ms for 2000 elements. Returns ranked by overlap score.

**D. Theme expansion**

```
POST /api/themes/expand
{ "theme": "creative world building" }
        → { "nodes": [{ "type": "Skill", "id": "...", "label": "world building" },
                       { "type": "Mechanic", "id": "...", "label": "environment creation" },
                       ...] }
```

Deterministic substring matching of theme words against all mechanic/skill/tag labels. Returns matching nodes ranked by overlap count. Cached per theme string in memory. No LLM dependency for MVP.

**E. Workshop plan**

```
POST /api/workshop/plan
{
  "duration": 120,
  "players": 12,
  "difficulty": "beginner",
  "constraints": ["no-audience", "no-physical-contact"],
  "theme": "storytelling"
}
        → { "warmUp": [...], "main": [...], "closer": [...], "fallbacks": {...} }
```

Pipeline:
1. **Theme expansion** — deterministic substring match → target node IDs (cached per string)
2. **Multi-hop traversal** — for each target node, find connected elements. Score by number of target nodes the element connects to.
3. **Constraint filter** — remove elements with `requires → audience_input`, `requires → physical_contact`, etc.
4. **Deduplicate** — prefer canonical elements, filter out source variants already represented in results
5. **Sequence** — sort into warm-up (beginner, short duration, `suitableFor=warmup`), main (respect `buildsOn` prerequisite chains), closer (high energy, `suitableFor=performance`)
6. **Fill gaps** — if total plan duration < target, add fallbacks from similar elements
7. **Graceful degradation** — if no elements match all constraints, return partial results with explanations. If theme expansion finds no matches, broaden search to related mechanics.

**F. Show set**

```
POST /api/shows/build
{
  "format": "short-form",
  "slotCount": 5,
  "totalDuration": 30,
  "constraints": ["include-audience-participation"]
}
        → { "slots": [{ "slot": 1, "element": {...}, "alternatives": [...] }, ...] }
```

Format templates stored as a config file (`src/formats/formats.json`). Each format defines slots with constraints (duration range, mechanic requirements, variety rules). The builder fits elements into slots using the same query layer.

### 3. suitableFor Heuristic

The `suitableFor` field (`warmup | exercise | performance | encore`) exists in the 0002 schema but is not yet extracted. Derive it heuristically from existing data:

| suitableFor | Heuristic |
|-------------|-----------|
| `warmup` | difficulty = beginner AND duration ≤ 10 min AND energyLevel = medium/high |
| `exercise` | difficulty = beginner/intermediate AND duration 5–20 min (default) |
| `performance` | difficulty = intermediate/advanced AND duration ≥ 15 min |
| `encore` | energyLevel = high AND duration ≤ 5 min |

These are added as properties during graph query, not stored in the graph. LLM extraction can replace heuristics later.

### 4. User Interfaces

**Web UI** — zero new dependencies. Vanilla HTML + JS in `public/`. The existing server already serves files from this directory.

| Page | Route | Content |
|------|-------|---------|
| Home | `/` | Graph stats, quick links, theme search bar |
| Workshop planner | `/workshop` | Form (duration, players, difficulty, constraints, theme) → POST to `/api/workshop/plan` → rendered plan with exercise cards |
| Element browser | `/elements` | Filter form (difficulty, duration, tags, mechanics) → GET `/api/elements?...` → paginated card grid |
| Element detail | `/elements/:id` | Full element view: description, steps, mechanics, skills, similar exercises, build chain |
| Show builder | `/shows` | Format picker → POST `/api/shows/build` → rendered set list with fallback alternatives |

Each page is a standalone HTML file. JS handles form submission via `fetch()`, renders results into the DOM. No client-side routing, no build step.

**CLI** — thin wrapper over the same query functions, using local `output/graph.json`:

```
bun run src/workshop.ts --duration 120 --players 12 --theme storytelling --no-audience
bun run src/workshop.ts --similar-to "Zip Zap Zop" --harder
bun run src/workshop.ts --show short-form --slots 5 --duration 30
```

The CLI loads `graph.json` locally and calls the same `graph-query.ts` functions (no HTTP). Useful for CI, scripting, and offline use.

## Node & Edge Types (additions)

New node type:

| Node | What it represents | Example |
|------|-------------------|---------|
| `Requirement` | A setup constraint on an exercise | "audience_input", "music_singing" |

New edge types:

| Edge | From → To | Source | Meaning |
|------|-----------|--------|---------|
| `requires` | Element → Requirement | Derived from tags + mechanics | "Playing this exercise requires X" |
| `buildsOn` | Element → Element | Heuristic + manual | "This exercise builds on skills from that one" |
| `variationOf` | Element → Element | Derived from `derivedElements` | "This is an inline variation of that" |

## Multi-Language Strategy

EN is the source of truth. All UI pages show EN canonical elements by default. DE canonicals are accessible via translation links. An element detail page showing an EN canonical also lists `translationOf → DE canonical` if available.

## Error Handling

Graceful degradation throughout:

- **No elements match constraints** → return partial results with explanation of which constraint was relaxed
- **Theme expansion finds nothing** → broaden to related mechanics via mechanic overlap, fall back to substring match
- **LLM unavailable** → deterministic substring matching only (no LLM dependency for MVP)
- **Graph not derived** → `/api/elements`, `/api/workshop/plan` return clear error: "Graph not available — run graph derivation first"
- **Invalid parameters** → 400 with field-level error messages

## Phasing

### Phase 0: Requirement Edges

- New file: `src/graph/requirement-mapping.ts` — config mapping tags+mechanics → requirement concepts
- Modified: `src/graph/derive.ts` — add `Requirement` nodes + `requires` edges during Phase 3
- Modified: `src/graph/overrides.ts` — support `requires` overrides
- No LLM changes. No schema changes. Deterministic derivation.

### Phase 1: Dependency + Variation Edges

- Modified: `src/graph/derive.ts` — heuristic `buildsOn` from mechanic subsets, `variationOf` from `derivedElements`
- Modified: `src/graph/overrides.ts` — support `buildsOn` and `variationOf` overrides
- No LLM changes. No schema changes.

### Phase 2: Query Layer + API + UI

- New file: `src/query/graph-query.ts` — in-memory graph index + query functions
- New file: `src/query/similarity.ts` — on-the-fly Jaccard overlap
- New file: `src/query/theme.ts` — deterministic theme expansion
- New file: `src/query/workshop-planner.ts` — workshop plan pipeline
- New file: `src/query/suitable-for.ts` — heuristic suitableFor derivation
- New file: `src/workshop.ts` — CLI entry point
- Modified: `src/serve.ts` — new API endpoints, load graph at startup
- New files: `public/index.html`, `public/workshop.html`, `public/elements.html`, `public/elements-detail.html`, `public/shows.html`

### Phase 3: Format Templates

- New file: `src/formats/formats.json` — show format definitions
- New file: `src/formats/builder.ts` — format-aware element fitting
- Modified: `src/serve.ts` — `/api/shows/build` endpoint

### Phase 4: Integration + Update 0001

- Modified: `docs/plans/0001-knowledge-graph-and-application.md` — mark P1–P3 as ✅, add forward reference to 0003
- Final: `bun test` all pass

## Deliverables per Phase

| Phase | New files | Modified files | Tests |
|-------|-----------|---------------|-------|
| 0 | `src/graph/requirement-mapping.ts` | `derive.ts`, `overrides.ts` | `requirement.test.ts` |
| 1 | — | `derive.ts`, `overrides.ts` | `dependency.test.ts` |
| 2 | `src/query/graph-query.ts`, `src/query/similarity.ts`, `src/query/theme.ts`, `src/query/workshop-planner.ts`, `src/query/suitable-for.ts`, `src/workshop.ts`, `public/*.html` (5 files) | `serve.ts` | `query.test.ts`, `api.test.ts` |
| 3 | `src/formats/formats.json`, `src/formats/builder.ts` | `serve.ts` | `formats.test.ts` |
| 4 | — | `docs/plans/0001-*.md` | — |

## Execution Order

```
Phase 0 (requirements) ──► Phase 1 (dependencies)
                                    │
                                    ▼
                              Phase 2 (query layer + API + UI)
                                    │
                                    ▼
                              Phase 3 (format templates)
                                    │
                                    ▼
                              Phase 4 (integration + 0001 update)
```

Phases 0 and 1 can partially overlap (different derive.ts sections). Phases 2 and 3 are strictly sequential (3 builds on 2's query layer).

## Open Questions (resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | Theme expansion — LLM or deterministic? | **Deterministic substring matching** for MVP. Embeddings considered for future. |
| 2 | Graph reload after re-derivation? | **Require restart.** Simplest. Deploy restarts the server. |
| 3 | Multi-language UI strategy? | **EN as source of truth.** DE canonicals accessible via translation links. |
| 4 | Similarity pre-computation or on-the-fly? | **On-the-fly Jaccard.** ~2ms for 2000 elements. No pre-computation file. |
| 5 | Sequencing algorithm depth? | **Simple sort + buildsOn chains** for MVP. |
| 6 | suitableFor — LLM extraction or heuristic? | **Heuristic derivation** now. LLM extraction in future. |
| 7 | movementType for physical constraints? | **Skip for MVP.** Not part of initial scope. |
| 8 | Update Plan 0001? | **Yes.** Mark P1–P3 as complete. |
| 9 | Workshop plan caching? | **Per-theme-string cache** for theme expansion. No plan-level caching. |
| 10 | Error handling strategy? | **Graceful degradation.** Partial results with explanations. |
| 11 | Client-side portability? | **Server-side only for now.** Design query functions as pure functions. |
