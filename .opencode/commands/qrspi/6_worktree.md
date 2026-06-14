---
description: Create an isolated git worktree for implementation (optional)
argument-hint: "thoughts/qrspi/<id>/"
---
Create an isolated git worktree from `$ARGUMENTS/`.

1. Derive branch name from directory name
2. Show me: worktree path (`~/wt/<repo>/<branch>`), branch, plan path. Wait for confirmation.
3. After confirmation:
   `git worktree add ~/wt/<repo>/<branch> -b <branch>`
   `cp -r $ARGUMENTS ~/wt/<repo>/<branch>/$ARGUMENTS`
4. Tell me the path — I should `cd` there before continuing

Rules: always confirm first. Worktrees don't share untracked files — always copy artifacts. Do not start implementation.

When done: "Next: cd ~/wt/<repo>/<branch> then /qrspi/7_implement thoughts/qrspi/<id>/"
