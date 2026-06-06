# AGENTS.md

## Setup

- Runtime: [Bun](https://bun.sh/) (`brew install bun`)
- `bun install`

## Commands

```sh
bun run src/analyze.ts    # run scraper
bun run src/normalize/normalize.ts            # run normalization (Stage 1: LLM extraction only)
bun run src/normalize/normalize.ts --vocabulary  # run vocabulary canonicalization (Stage 3: deterministic clustering)
bun run src/normalize/normalize.ts --dedup        # run cross-source dedup (Stage 4: deterministic + LLM matching)
bun run src/normalize/normalize.ts --graph        # derive knowledge graph from normalized + vocabulary + dedup
bun run src/review.ts --clusters               # review dedup clusters (sorted by weakest confidence)
bun run src/review.ts --hubs                   # show top skill/mechanic/tag hubs by degree
bun run src/review.ts --element <name-or-id>   # show full element details
bun run src/review.ts --random <N>             # show N random canonical elements
bun test                   # run tests (bun:test)
```

## Architecture

- `src/analyze.ts` — CLI entry point for the scraper
- `src/index.ts` — library entry (exports `Improbib` class, `readImprobibJson`)
- Scraper pipeline in `src/scrape-improwiki.ts` scrapes improwiki.com, follows translation links, processes HTML→Markdown, and writes output
- Normalization layer in `src/normalize/` — 3-stage pipeline (LLM extraction, vocabulary canonicalization, cross-source dedup) per ADR-0008, ADR-0009, ADR-0011.
- Cross-source dedup in `src/normalize/element-dedup.ts` — deterministic (name + mechanic overlap + curated thesaurus) then LLM matching, runs after vocabulary canonicalization.
- Graph derivation in `src/graph/` — deterministic graph from normalized + vocabulary + dedup: nodes (Element with canonical: true/false, Mechanic, Skill, Tag, Source) and edges (hasMechanic, trainsSkill, hasTag, sourcedFrom, translationOf, canonicalOf).
- `canonicalOf` edges include `confidence` (0–1) derived from dedup matching scores. Lower confidence flags weaker matches for human review.
- Graph overrides in `src/graph/overrides.ts` — human-curated corrections (reject_match, add_match, remove_edge, add_edge) applied during graph derivation. Stored in `graph-overrides.json`.
- Zod schema: `src/validation/improbib-schema.ts` — output array must be 400–1000 elements

## Data access

- Always fetch scraped and normalized artifacts from the deployed server at `https://improbib.host.impromat.app:5000/` rather than reading local `output/` files.
- Raw sources: `GET /raw/{source}.json`
- Normalized sources: `GET /normalized/{source}.json`
- Vocabulary: `GET /vocabulary.json`
- Knowledge graph: `GET /graph.json`
- Status/metadata: `GET /`

## Key details

- `.cache/` — file-based HTTP cache (URL-encoded filenames). Delete to force re-fetch from web.
- `output/` — all scraper output (gitignored). Includes `elements.json`, `improbib.json`, per-item `.html`/`.md`.
- `mergeElements()` is called 3 times in the pipeline — reordering breaks deduplication.
- Each element requires `tagIds` (≥1), markdown (10–10000 chars), and license `CC-BY-SA-3.0-DE`.
