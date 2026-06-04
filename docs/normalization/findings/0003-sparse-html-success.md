# NORM-0003: Sparse HTML (416 chars) produced rich extraction ★ positive

- **Date**: 2026-06-04
- **Status**: done
- **Source**: Zweier-Synchro (de), cross-cutting

## Observation

Zweier-Synchro has only 416 characters of raw HTML:

```html
<p>Zwei Darsteller spielen auf der <a href="/de/wiki/buehne">Bühne</a> eine
<a href="/de/wiki/szene">Szene</a> und werden von zwei anderen Spielern neben
der Bühne synchronisiert...</p>
<p><strong>Varianten:</strong><br>
- <a href="/de/wiki/blind-synchro">Blind Synchro</a><br>
- <a href="/de/wiki/wechsel-zweier-synchro">Wechsel-Zweier-Synchro</a></p>
```

Despite its brevity, the LLM extracted:
- 3 structured steps with role and constraint annotations
- 2 variations with `differsBy`
- 4 cross-references from `<a>` links
- 2 mechanics, 3 skills with categories
- Practical metadata (4-8 players, 10min, intermediate, suitable for performance/warmup)

## Root cause

The raw HTML preserved all structural information: `<a href>` link targets, `<strong>` emphasis, HTML semantics. The LLM used the `<a>` tags to identify cross-references (which Turndown would have stripped) and inferred gameplay structure from the description.

## Action

No action — this confirms the ADR-0008 decision to feed raw HTML directly to the LLM instead of converting to markdown. The sparse element demonstrates that raw HTML is sufficient for the LLM to extract rich structure.

## Verification

- Output reviewed manually for Zweier-Synchro
- All extracted fields are correct and complete
- 4/4 `<a>` links captured as `referencedElements`
- Marked done
