# ADR-0014: Documented variation difficulty (minimal layer)

- **Date**: 2026-11-05
- **Status**: accepted
- **Source**: cross-cutting (improwiki, learnimprov, ircwiki)

## Context

The v2 artifact publishes 1,260 inline variations across 511 of 1,263 works
(40.5 %). They are the raw material for the most common user question: *how do
I make this easier or harder?* Two properties made them unusable for that:

1. `differsBy` is free text. 1,576 distinct values, 1,474 of them occurring
   exactly once, mixed German and English (`Anzahl der Spieler`, `single
   performer`, `eyes closed`). As a filter or chip list it is noise; as prose it
   is useful.
2. Nothing says whether a variation increases or decreases difficulty.
   `Elimination Freeze` is obviously harder, `Structured Freeze` is a
   simplification, `Audience Freeze` is neither. Only 6 descriptions contain an
   explicit "harder"/"easier" wording.

A keyword classifier was measured first: it found an axis for 76 % of the
variations but a direction for only 18.7 %, with visible false positives
(`fixed` → easier, `vorgegeben` → easier on a purely lateral change). Rules
alone are not sufficient.

## Decision

Publish a **minimal, grounded** difficulty layer:

**Per variation** (`works[].variations[]`):

- `direction`: `easier` | `harder` | `lateral` | `unknown`
- `lever`: `players` | `information` | `rules` | `context` | `medium` |
  `audience` | `null`
- `evidence`: verbatim quote from the variation text that justifies the
  direction

The six levers were derived bottom-up from the data (top concepts in
`differsBy` and descriptions), not from a pre-existing taxonomy. They answer
*what do I turn*, `direction` answers *which way*.

**Per work** (`works[].adjustments`):

```json
{
  "easier": [{ "text": "…", "variationName": "…", "lever": "rules" }],
  "harder": [{ "text": "…", "variationName": "…", "lever": "information" }]
}
```

Only documented inline variations are listed, at most six per direction.
**Nothing is generated.** A work without such variations gets an empty list.
Silence is better than a hallucinated difficulty hint.

### Grounding rules

A direction is only accepted when both hold:

1. The model's `evidence` occurs in the variation text. Paraphrases are reduced
   to the longest verbatim word run; quotes shorter than two words are
   rejected.
2. The variation text contains a language-specific **signal** for that
   direction (`eliminat`, `blind`, `eyes closed`, `no handles`, `faster`,
   `zusätzlich`, `schwieriger`, … for harder; `simpler`, `fixed`, `fewer`,
   `support`, `vorgegeben`, `langsam`, … for easier).

Otherwise the variation is stored as `unknown`. This deliberately trades recall
for precision: a wrong "make it harder" recommendation is worse than none.

### Storage and provenance

`bun run challenge` writes `output/challenge/{source}.json`:

```json
{
  "meta": { "model": "glm-5.3-flash", "promptHash": "…", "generatedAt": "…" },
  "elements": { "<identifier>": { "inputHash": "…", "variations": [ … ] } }
}
```

- The cache is keyed by element id and invalidated by a change in the variation
  text, the model, the prompt or the classifier version.
- `output/normalized/*.json` is **not** touched. Adding fields to the normalized
  schema would change `getNormalizedBy()` and invalidate all 1,355 extraction
  cache entries.
- `assemble` loads the files when present and sets `meta.schemaVersion = 3`.
  Without them the artifact stays at v2, so the fallback path still works.

## Consequences

- 1,270 variations classified: 33 easier, 156 harder, 657 lateral, 424 unknown.
  131 of 1,263 works now carry at least one documented adjustment; Freeze Tag
  has four harder (Blind Freeze, Challenging Pose Freeze, Elimination Freeze,
  Eyes Closed Freeze) and one easier (Structured Freeze).
- 752 works have no variations at all and therefore no adjustments. Closing
  that gap requires generation grounded in `mechanics`/`skills`/`tips` — a
  separate layer with its own review, not part of this decision.
- The layer is additive for Impromat: the current importer ignores the new
  fields and keeps working.
- The classifier is conservative by construction. If recall turns out to be too
  low in practice, the lever/direction vocabulary stays; only the signal
  lexicon and the prompt need to change.
