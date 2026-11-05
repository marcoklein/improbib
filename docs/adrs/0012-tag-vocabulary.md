# ADR-0012: Canonical tag vocabulary with axes

- **Date**: 2026-11-05
- **Status**: accepted

## Context

Tags are the only cross-source, language-neutral classification the pipeline
produces, but three defects made them unusable as a filter or similarity signal:

1. Unknown source labels were emitted as `no_translation_id_<label>` tag ids.
   In the 2026-06 output that was 582 assignments over 31 labels, and 314
   elements had *only* such sentinels.
2. The vocabulary mixed unrelated axes: format (`game`, `exercise`), difficulty
   (`beginner`, `advanced`), energy (`calm`, `energetic`), grouping (`pairs`,
   `circle`) and content (`accepting`, `status`).
3. `translatedTags` was de-duplicated by display name while `tagIds` was not,
   so `character`/`figur` (both "Character" in English) broke the index
   correspondence between the two arrays.

## Decision

`tag-translations.ts` is the single canonical vocabulary. Each entry is
`{ de, en, axis }` with `axis ∈ {format, difficulty, energy, grouping, content, meta}`.

- `tagIds` is the identity and only contains vocabulary keys.
- `translatedTags` is derived 1:1 from `tagIds`; labels are unique per language.
- `resolveTagIds()` maps raw labels through `tag-transformations` plus aliases
  (plural forms, source-specific categories, English/German variants).
- Unknown labels are dropped from `tagIds` and reported in
  `meta.untranslatedTags` / `meta.untranslatedTagCounts`.
- `meta.tagVocabulary` exports the catalog including the axis, so consumers can
  group and filter without hard-coding it.
- `figur` was removed; `Figur` and `Charakter/Figur` resolve to `character`.

## Reparse from cache

`fetchAndCacheWebsite` keeps every fetched page in `.cache` forever, and the
sitemap-based freshness check skips pages whose `lastmod` is older than
`fetchedAt`. Parser fixes therefore never reach existing elements through a
normal scrape.

`reparseImprowiki()` (`src/scraping/improwiki/reparse.ts`, `bun run reparse`)
re-reads the cached HTML for every known URL and refreshes the parsed fields
without a network request. `htmlContent` is kept unchanged so the
normalization cache key (`md5(htmlContent)`) still hits and no LLM calls run.

The sidebar card fields (`Anzahl Spieler`, `Erfahrung`, `Dynamik`,
`Kompetenzen` and their English equivalents) are read from the whole `<aside>`;
the previous `.parent()` lookup only saw the heading and lost every value.

## Consequences

- Every element carries at least one concept unless its source has no tags.
- DE/EN translation pairs share their tag set (`mergeTranslationFields`), so
  twins are comparable.
- learnimprov WordPress categories and post tags are folded into `tags` during
  assembly, as ADR-0004 intended.
- Validation is fatal: an over-cap or malformed output no longer gets written.
