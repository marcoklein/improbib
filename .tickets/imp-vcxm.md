---
id: imp-vcxm
status: closed
deps: [imp-bwsj]
links: []
created: 2026-06-10T16:25:11Z
type: feature
priority: 0
assignee: Marco Klein
tags: [query, api, ui]
---
# Query layer + API endpoints + browser UI

Build the in-memory query layer, REST API endpoints, and two HTML pages for workshop facilitators.

**Query library (5 files)**:
- `src/query/graph-query.ts` — GraphIndex, queryElements(), getElementDetail(), getSimilarElements(), expandTheme()
- `src/query/similarity.ts` — jaccardSimilarity() helper
- `src/query/theme.ts` — deterministic theme expansion with in-memory cache
- `src/query/workshop-planner.ts` — planWorkshop() pipeline (theme→scoring→filter→dedupe→sequence→fillGaps)
- `src/query/suitable-for.ts` — deriveSuitableFor() heuristic

**Server changes** (`src/serve.ts`):
- Load graph at startup into memory (GraphIndex)
- 5 new API endpoints: GET /api/elements, GET /api/elements/:id, GET /api/elements/:id/similar, POST /api/themes/expand, POST /api/workshop/plan

**UI (2 HTML files in public/)**:
- `public/workshop.html` — landing + planner: graph stats, theme search, form (duration/players/difficulty/constraints/theme), submit renders warm-up/main/closer with replace buttons
- `public/elements.html` — combined browse + inline detail: filter grid, click card expands description/mechanics/skills/requirements/similar/buildsOn/variations below

Zero new dependencies. Vanilla HTML+CSS+JS. No framework.

See docs/plans/0003-application-layer.md Phase 2 for full spec.

## Acceptance Criteria

1. Server starts and loads graph into memory (logs node/edge count)
2. GET /api/elements?difficulty=beginner&limit=5 returns paginated JSON
3. GET /api/elements/:id returns full detail with edges + similar
4. GET /api/elements/:id/similar?limit=10 returns ranked similar elements
5. POST /api/themes/expand {"theme": "storytelling"} returns matching nodes
6. POST /api/workshop/plan {"duration":120,"players":12,"theme":"storytelling"} returns warmUp/main/closer
7. constraints ["no-audience"] filters out elements with requires → audience_input
8. workshop.html loads, form submits, renders exercise cards grouped by warm-up/main/closer
9. elements.html filters work, click card expands inline detail with similar + buildsOn
10. 503 when graph not loaded, 404 for missing element, graceful degradation on empty results

