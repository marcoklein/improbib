---
description: Execute the plan phase by phase with verification
argument-hint: "thoughts/qrspi/<id>/"
---
Read `$ARGUMENTS/plan.md`. That is your only working document.

Process:
1. Read plan.md fully. Check for checkmarks (- [x]) — pick up from first unchecked item
2. Read all referenced files before changing them
3. Implement one phase at a time. If codebase has diverged, stop and present the mismatch.
4. Run automated verification. Fix failures. Check off - [x] in plan.md.
5. Commit: "Phase N: [name]" — one commit per phase
6. Pause for manual verification. Do NOT check off manual items until I confirm.
7. Repeat until complete

Context reset: re-run `/qrspi/7_implement` — checkboxes show where to resume.

Rules:
- One phase at a time. No skipping.
- No refactoring or "improving" adjacent code — note it for me after.
- If the plan is fundamentally wrong, stop and tell me.

When done: "Next: /qrspi/8_pr thoughts/qrspi/<id>/"
