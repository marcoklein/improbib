---
id: imp-sa43
status: closed
deps: [imp-vcxm]
links: []
created: 2026-06-10T16:25:28Z
type: task
priority: 1
assignee: Marco Klein
tags: [integration, testing]
---
# Integration — verify everything works end-to-end

Verify that Phase 1 and Phase 2 work together correctly.

**Checks**:
1. `bun test` — all existing + new tests pass
2. `bun run src/normalize/normalize.ts --graph` — produces graph with all new edges
3. `bun run src/review.ts --clusters` — still works (new edges tracked in meta)
4. Open `public/workshop.html` in browser — full flow: form → submit → rendered plan
5. Open `public/elements.html` in browser — filter → click card → inline detail with similar + buildsOn
6. Test with real constraints: "120 min, 12 players, storytelling, no-audience" returns a real plan
7. Test edge cases: theme with no matches, element with 0 mechanics (similar returns empty), missing energyLevel (suitableFor falls back to exercise)

See docs/plans/0003-application-layer.md Phase 3 for full spec.

## Acceptance Criteria

1. bun test passes (all existing + new)
2. --graph produces valid graph.json
3. review.ts --clusters works unchanged
4. workshop.html functional in browser (form → plan)
5. elements.html functional in browser (filter → detail)
6. Real plan generated for real constraints
7. Edge cases handled gracefully

