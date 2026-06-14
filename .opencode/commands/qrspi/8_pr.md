---
description: Create a PR grounded in the design document
argument-hint: "thoughts/qrspi/<id>/"
---
Read `$ARGUMENTS/design.md`.

1. `git diff <base>...HEAD` and `git log <base>...HEAD --oneline` (base defaults to main)
2. Create PR with `gh pr create`:

Title: under 70 chars.
Body:
- Summary (WHY, from design.md)
- Design Decisions
- Changes by component
- How to Verify (automated + manual)
- References: design.md and plan.md

Push first if needed. Report the PR URL.
