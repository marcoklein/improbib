# AGENTS.md

## Setup

- Runtime: [Bun](https://bun.sh/) (`brew install bun`)
- `bun install`

## Commands

```sh
bun run src/analyze.ts    # run scraper
bun run src/normalize/normalize.ts  # run normalization (3-stage LLM pipeline)
bun test                   # run tests (bun:test)
```

No build step — Bun runs `.ts` directly (`noEmit: true` in tsconfig).

## Architecture

- `src/analyze.ts` — CLI entry point for the scraper
- `src/index.ts` — library entry (exports `Improbib` class, `readImprobibJson`)
- Scraper pipeline in `src/scrape-improwiki.ts` scrapes improwiki.com, follows translation links, processes HTML→Markdown, and writes output
- Normalization layer in `src/normalize/` — 2-stage pipeline (LLM extraction, cross-source matching) per ADR-0008. Stage 3 (vocabulary normalization) deferred to Layer 2.
- Zod schema: `src/validation/improbib-schema.ts` — output array must be 400–1000 elements

## Key details

- `.cache/` — file-based HTTP cache (URL-encoded filenames). Delete to force re-fetch from web.
- `output/` — all scraper output (gitignored). Includes `elements.json`, `improbib.json`, per-item `.html`/`.md`.
- `mergeElements()` is called 3 times in the pipeline — reordering breaks deduplication.
- Each element requires `tagIds` (≥1), markdown (10–10000 chars), and license `CC-BY-SA-3.0-DE`.
