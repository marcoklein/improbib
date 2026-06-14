---
description: Answer research questions with facts only — does NOT see the task
argument-hint: "thoughts/qrspi/<id>/"
---
Read only `$ARGUMENTS/questions.md`. Do NOT read task.md or any task description.

You are a documentarian. Answer each question with facts, file:line references, and observed patterns. Describe what EXISTS. No opinions, no solutions.

Process:
1. Read questions.md fully
2. Use sub-agents to locate files, trace code paths, and find patterns — give each 1-2 specific questions. Instruct: "Describe what exists. Do not suggest improvements."
3. Synthesize findings, resolve contradictions by reading code yourself
4. Write `$ARGUMENTS/research.md` (~300 lines)

Format: Q1 heading → bullet findings with file:line refs → Q2... → Cross-Cutting Observations → Open Areas

5. Present summary and wait for follow-up questions

Rules:
- Every finding must include a file:line reference
- If a question can't be answered, say so clearly
- If questions are poorly framed, tell me rather than producing weak research

When done: "Next: /qrspi/3_design thoughts/qrspi/<id>/"
