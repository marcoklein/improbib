# ADR-0017: A duration carries its provenance

- **Date**: 2026-11-21
- **Status**: accepted
- **Source**: product/features/work-fit-taxonomy.md, ip-bupf

## Context

The extraction model returns `practical.typicalDurationMinutes` for 328 of
1,209 elements. Nothing in the pipeline reads a duration field: the improvwiki
sidebar has `Kategorien`, `Kompetenzen`, `Anzahl Spieler` and `Erfahrung`, and
no scraper looks for a time. Almost every published number is therefore a model
guess, but the artifact and the app present it exactly like a measurement — and
the workshop planner writes "these seven fill 90 minutes".

The spec (`durationSource`) asks for the distinction. The design
(`work/ip-bupf/design.md`) rejected asking the model to label itself: the label
would be unverifiable and would require a paid re-extraction of every element.
Reading the duration at scrape time would duplicate the rule per source and
force a re-scrape, while publish time already has the page text.

## Decision

One deterministic evidence check at publish time, in
`src/publish/duration-evidence.ts`. It labels the existing number; it never
changes it and makes no additional model call.

- A work's number is **`stated`** when a member's page body contains a duration
  statement that names the number or a range containing it. Accepted forms: a
  whole-work subject (`sie|es|das Spiel|das Format|die Übung`, `this|it|the
  game|the format|the exercise`) with `dauert|dauern|takes|lasts|runs` and a
  number plus minute/hour unit; a label (`Dauer:`, `Spieldauer:`, `Spielzeit:`,
  `Duration:`, `Time:`, `Length:`); or a card field that is only a duration.
- Otherwise the number is **`inferred`**. Bounds (`mindestens`, `at most`),
  part-scoped statements (`jede Szene`, `per round`) and bare instructions
  ("Spielt 2 Minuten") never qualify. False negatives are accepted; a false
  positive is not.
- The work picks one number — the canonical member's when present, otherwise
  the first member in the stable order — and copies the number and its source
  onto every member, so two sources cannot disagree.
- Artifact: `works[].durationMinutes` and `works[].durationSource` are always
  present and null together; `normalized.practical.durationSource` is present
  exactly when `typicalDurationMinutes` is. Graph nodes carry the same flag
  (computed from the page HTML, because the graph is derived before assembly).
- `findWorkFitProblems` (unit tests and gate 7) rejects a number without a
  source, a source without a number, a work that disagrees with its canonical
  element, and a `stated` work whose pages never state the number.
- `planWorkshop` returns `durationConfidence`; with `strictTime` it fits only
  `stated` durations and returns a short plan plus a warning instead of padding
  with guesses.

## Consequences

- On the artifact of 2026-11-11 the conservative grammar labels 7 of 310
  duration-bearing works `stated` (`Der Mord` 30–45, `Briefwechsel`/`Letter
  Exchange` 7–15, `Vier Ecken`/`Four Corners` 15, `Anything Fabric` 5). The
  other 303 stay `inferred` and read as an estimate.
- The app renders `ca. 10 Min.` for inferred and `10 Min.` for stated once it
  consumes the field. An artifact without the field renders as today, so the
  producer ships first.
- Strict time fits are nearly empty by design; the flag is off by default.
  Widening the grammar later is cheap, but any widening must keep the
  false-positive rule.
- Purely additive: reverting removes the fields, existing numbers do not
  change, and no database migration is needed in the app.
