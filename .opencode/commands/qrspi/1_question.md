---
description: Decompose a task into neutral research questions
argument-hint: "<task description or ticket>"
---
Write two files in `thoughts/qrspi/YYYY-MM-DD/` and wait for approval.

**task.md** — 2-3 sentence description of what's being built and why.

**questions.md** — 3-7 neutral research questions that explore HOW the codebase works today. Do NOT mention what's being built. The researcher in Phase 2 reads only this file and must not know the goal. Prefer "trace the flow" over yes/no.

Good: "How does auth middleware handle requests, and where are policies defined?"
Bad: "What's the best way to add a new endpoint?"

Process:
1. Read any provided ticket files or task descriptions fully
2. Light codebase exploration (Glob/Grep — don't read files deeply)
3. Use today's date (YYYY-MM-DD) for the ID. If you run Phase 1 multiple times on the same day, append `-2`, `-3`, etc.
4. Create directory: `mkdir -p thoughts/qrspi/<YYYY-MM-DD>/`
5. Write task.md (hidden from Research) and questions.md (neutral, no goal mentioned)
6. Present questions to me and wait for approval

Rules:
- questions.md must NOT contain the task description or goals
- If too simple for 3 questions, tell me — QRSPI is for complex tasks

When done: "Next: /qrspi/2_research thoughts/qrspi/<YYYY-MM-DD>/"
