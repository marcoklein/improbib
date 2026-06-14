---
description: Tactical implementation plan — the agent's working document
argument-hint: "thoughts/qrspi/<id>/"
---
Read `$ARGUMENTS/structure.md`, `design.md`, and `research.md`.

Expand each phase from structure.md into full implementation detail. Must be self-contained — an agent reading only this file can implement.

Write `$ARGUMENTS/plan.md`:

Per phase:
- Files: exact paths, create/modify/delete
- Code snippets for non-trivial changes
- Automated verification: `- [ ] [command]` passes
- Manual verification: `- [ ] [what to check]`

Rules:
- Every file from structure.md must appear
- No TBDs or open questions — resolve or ask me
- Use the project's real test/lint commands
- Checkboxes (- [ ]) are mandatory — they track progress
- Only include changes from design.md and structure.md — no refactoring

Present summary with deviations from structure.

When done: "Next: /qrspi/6_worktree or /qrspi/7_implement thoughts/qrspi/<id>/"
