---
id: imp-bwsj
status: closed
deps: []
links: []
created: 2026-06-10T16:24:53Z
type: feature
priority: 0
assignee: Marco Klein
tags: [graph, derive]
---
# Graph enrichment — requirement, dependency, and variation edges

Add three new edge types to the knowledge graph during graph derivation:

**New node type**: Requirement — setup constraint (audience_input, physical_contact, music_singing, props_objects, audience_on_stage)

**New edge types**:
- `requires`: Element → Requirement — derived from existing tags + mechanics
- `buildsOn`: Element → Element — heuristic from mechanic subset + difficulty/duration ordering
- `variationOf`: Element → Element — wired from normalized derivedElements

**New file**: `src/graph/requirement-mapping.ts` — config mapping + deriveRequirements()
**Modified**: `src/graph/derive.ts` — add nodes/edges in Phase 3
**Modified**: `src/graph/overrides.ts` — 6 new override types (add/remove for each edge)

**Tests**: requirement.test.ts, dependency.test.ts

See docs/plans/0003-application-layer.md Phase 1 for full spec.

## Acceptance Criteria

1. `bun run src/normalize/normalize.ts --graph` produces graph.json with new requirement/buildsOn/variationOf nodes and edges
2. `bun run src/review.ts --element "Harold"` shows requires/buildsOn/variationOf edges
3. Elements with audience suggestion mechanic get requires → audience_input edge
4. Elements with Ask For tag get requires → audience_input edge
5. buildsOn heuristic: element with superset mechanics + higher difficulty → buildsOn prerequisite
6. Derived elements get variationOf edge to parent
7. All 6 override types work in graph-overrides.json
8. Existing 93 tests still pass, new tests added

