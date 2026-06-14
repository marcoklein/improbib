---
description: Create an isolated git worktree for implementation (optional)
argument-hint: "thoughts/qrspi/<id>/"
---
Create an isolated git worktree from `$ARGUMENTS/`. Use the `wt` CLI.

1. Derive branch name from the artifact directory (e.g., `qrspi-2026-06-14`)
2. Show me the branch name and plan path. Wait for confirmation.
3. After confirmation:
   `wt switch --create <branch> -y`
   `cp -r $ARGUMENTS .`   (you're now in the worktree dir — `pwd` confirms)
4. Tell me the worktree path — I should `cd` there before continuing

Rules: always confirm first. Use `wt` — not `git worktree`. Worktrees don't share untracked files — always copy artifacts. Do not start implementation.

When done: "Next: cd <worktree-path> then /qrspi/7_implement thoughts/qrspi/<id>/"
