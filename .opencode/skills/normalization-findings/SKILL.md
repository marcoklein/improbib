---
name: normalization-findings
description: Track extraction quality findings during normalization review. Use when reviewing normalized output, identifying tone/categorization/quality issues, or running the normalization feedback loop.
compatibility: opencode
metadata:
  project: improbib
  layer: normalization
---

## What I do

- Help create and maintain a numbered log of extraction quality findings in `docs/normalization/findings/`
- Ensure every finding has: observation, root cause, action, verification checklist
- Link findings to golden set entries via `_notes` field
- Mark findings as `done` once the fix is deployed and verified

## When to use me

Use this skill whenever:
- You're reviewing normalized output and spot a quality issue
- You're implementing a prompt/schema fix based on a finding
- You're verifying that a fix resolved the issue
- The user asks to "document this" or "create a finding"

## Workflow

### 1. Spot an issue

During normalization review (usually after a `?max=N` subset run), examine the output for:
- Incorrect tone/register (German Du vs Sie)
- Miscategorized mechanics or skills
- Missing fields (no referencedElements when HTML has `<a>` links)
- Hallucinated content (variations not in source)
- Surprisingly good results worth documenting (positive findings)

### 2. Create a finding

Create `docs/normalization/findings/NNNN-slug.md` using the template at `_template.md`:
- Increment from the highest existing NORM number
- Slug is a brief kebab-case summary
- Set status to `open`
- Fill in observation, root cause, action, verification checklist

### 3. Link to golden set (if applicable)

If the finding relates to a specific golden set element, add a `_notes` field to that element in `src/normalize/__testdata__/golden-set.ts`:

```typescript
_notes: "NORM-0002: Zuhören miscategorized as vocal"
```

### 4. Implement the fix

Apply the action described in the finding. This typically means:
- Editing `src/normalize/llm-client.ts` (system prompt)
- Editing `src/normalize/normalized-schema.ts` (schema)
- Editing `src/normalize/__testdata__/golden-set.ts` (expected output)

Commit the fix with a message referencing the finding number.

### 5. Verify

After deploying the fix:
1. Run `?max=N` subset normalization
2. Check the affected element(s) for the fix
3. Update the finding's verification checklist (check off items)
4. Mark status as `done` once all items are verified
5. Commit the updated finding

## Finding conventions

- **Numbers**: zero-padded four digits (`0001`, `0002`)
- **Status**: `open` until verification complete, then `done`
- **Source**: the specific element name that triggered the finding, or "cross-cutting"
- **Positive findings**: mark `done` immediately with "no action" or "confirmed ADR decision"
- **Template**: use `docs/normalization/findings/_template.md`

## Current state

| # | Title | Status |
|---|-------|--------|
| 0001 | Constraint text uses "Sie" | open |
| 0002 | "Zuhören" miscategorized as `vocal` | open |
| 0003 | Sparse HTML produced rich extraction ★ | done |

Run `ls docs/normalization/findings/*.md | grep -v _template` for the latest list.
