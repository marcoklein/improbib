# ADR-0015: One source page, one game

- **Date**: 2026-11-05
- **Status**: accepted
- **Source**: cross-cutting (improwiki, learnimprov, ircwiki)

## Context

The pipeline treated one scraped URL as one element. That is wrong for overview
pages. `Fangenspiele` contains 14 independent tag games, `Tag Games` 13,
`Leading Exercises` 7, `Blind Lead` 6. None of those games existed as its own
element, so consumers could only show the whole collection as one long text.

The extraction prompt already had a splitting rule, but in the current
normalized output **zero** elements carry `splitFrom`. Even if they did, the
artifact assembler filters normalized elements by the ids present in the raw
layer, so split children would be dropped again.

A first pass over 261 pages with at least two top-level sections showed the
second problem: not every page with several headings is a collection.
`Madrigal` (Version 1/2), `Duet` (Duet 1–5), `König` (König 1/2) are one game
with variants. A model asked only "does this page have several games?" splits
them too.

## Decision

**Audit, then materialise, then normalise.**

1. **Candidates.** Every element with at least two top-level (`h2`, falling back
   to `h3`) sections and at least 300 characters of section text.
2. **Audit.** One LLM call per candidate (`output/splits/audit.json`, cached by
   input hash, model and prompt). The model returns
   `{ kind: "single" | "collection", children: number[], reason }`.
3. **Deterministic guards.** Model decisions are filtered:
   - headings that are navigation/categories (`Contents`, `See also`,
     `Warmups and games`, `Song forms`, `Abstract`, `Presentational`, `Scenic`,
     `List of …`) never become children;
   - headings that are numbered versions of the page title (`Duet 1` under
     `Duet`, `König 2` under `König`, `Version 1`, `Variante B`) never become
     children;
   - fewer than two children left → the page stays single.
4. **Materialise.** `output/splits/{source}.json` holds the children:
   deterministic id (`md5("split:parentId:heading")`), `url` = parent URL +
   `#slug`, section markdown, and inherited source, language, license, tags,
   authors and `lastModified`. Sections under 150 characters are skipped.
5. **Normalise.** Children run through the normal extraction prompt
   (`output/normalized-splits/{source}.json`), so they get their own summary,
   how-to-play, practical data and variations.
6. **Publish.** `assemble` adds the children as first-class elements and
   **removes the collection parent** from `elements`. The parent is kept in a
   top-level `collections` array (`id`, `name`, `url`, `childIds`) so the
   relationship is not lost. The raw layer is untouched.

## Consequences

- Current result: 16 collections, 71 children. The artifact grows from 1,296 to
  1,351 elements; `Fangenspiele` becomes 14 elements, `Tag Games` 13,
  `Leading Exercises` 7, `Blind Lead` 6.
- A page is now either one game or a collection marker. Consumers that only
  understand `elements` see the games, not the collection page.
- Split children are new identifiers and have no dedup relations, so they do
  not merge with other sources yet. Translation links between the German and
  English child pages are also not established; the parent pairs are known, but
  mapping them requires a heading/order match. That is follow-up work.
- The audit is a judgement call at the edges. `Genre Talk Show` (two formats)
  and `One Word Story` (two setups) are currently split; if that proves wrong in
  practice, `output/splits/audit.json` can be corrected per page without
  touching the pipeline.
- The pipeline is resumable and cheap: 261 audit calls and 71 extraction calls
  with `glm-5.3-flash` cost well under one dollar.
