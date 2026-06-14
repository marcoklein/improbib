---
description: Break design into vertical slices with test checkpoints
argument-hint: "thoughts/qrspi/<id>/"
---
Read `$ARGUMENTS/design.md` and `research.md`.

Break work into vertical slices — each delivers end-to-end functionality across all layers, is independently testable, has a verification checkpoint.

Vertical: "Phase 1: Endpoint — migration, store, handler, UI button. Verify: 200."
Horizontal (wrong): "Phase 1: All migrations. Phase 2: All services."

Write `$ARGUMENTS/structure.md` (~2 pages):
- Approach (1-2 sentences)
- Per phase: what it delivers, files affected, key signatures/types, verify command + manual check
- Testing Checkpoints summary

Define phase order so earlier phases are independently valuable. Present for feedback.

If the design has a critical flaw, tell me rather than working around it.

When done: "Next: /qrspi/5_plan thoughts/qrspi/<id>/"
