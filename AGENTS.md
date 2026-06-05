# AGENTS.md

## Setup

- Runtime: [Bun](https://bun.sh/) (`brew install bun`)
- `bun install`

## Commands

```sh
bun run src/analyze.ts    # run scraper
bun run src/normalize/normalize.ts            # run normalization (Stage 1+2: LLM extraction + cross-source matching)
bun run src/normalize/normalize.ts --vocabulary  # run vocabulary canonicalization (Stage 3: deterministic clustering)
bun test                   # run tests (bun:test)
```

No build step — Bun runs `.ts` directly (`noEmit: true` in tsconfig).

## Architecture

- `src/analyze.ts` — CLI entry point for the scraper
- `src/index.ts` — library entry (exports `Improbib` class, `readImprobibJson`)
- Scraper pipeline in `src/scrape-improwiki.ts` scrapes improwiki.com, follows translation links, processes HTML→Markdown, and writes output
- Normalization layer in `src/normalize/` — 2-stage pipeline (LLM extraction, cross-source matching) per ADR-0008. Stage 3 (vocabulary normalization) uses deterministic clustering per ADR-0009.
- Zod schema: `src/validation/improbib-schema.ts` — output array must be 400–1000 elements

## Data access

- Always fetch scraped and normalized artifacts from the deployed server at `https://improbib.host.impromat.app:5000/` rather than reading local `output/` files.
- Raw sources: `GET /raw/{source}.json`
- Normalized sources: `GET /normalized/{source}.json`
- Vocabulary: `GET /vocabulary.json`
- Status/metadata: `GET /`

## Key details

- `.cache/` — file-based HTTP cache (URL-encoded filenames). Delete to force re-fetch from web.
- `output/` — all scraper output (gitignored). Includes `elements.json`, `improbib.json`, per-item `.html`/`.md`.
- `mergeElements()` is called 3 times in the pipeline — reordering breaks deduplication.
- Each element requires `tagIds` (≥1), markdown (10–10000 chars), and license `CC-BY-SA-3.0-DE`.
