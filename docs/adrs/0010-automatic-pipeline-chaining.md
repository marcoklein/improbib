# ADR-0010: Automatic Pipeline Chaining

- **Date**: 2026-06-05
- **Status**: accepted
- **Source**: (cross-cutting — server infrastructure)

## Context

The data pipeline has four sequential stages:

1. **Scraping** — fetch raw HTML from improwiki.com, learnimprov.com, ircwiki.com
2. **Normalization Stages 1+2** — LLM extraction per element + cross-source matching
3. **Vocabulary canonicalization Stage 3** — deterministic clustering of mechanic/skill names
4. **Knowledge graph derivation** — reads normalized elements + vocabulary, produces graph

The server already triggers scraping automatically via an in-process cron (daily at UTC 4AM) and on first startup. However, after scraping completes, the server only logs a suggestion to manually `curl` the normalization endpoint. Stages 2–4 must be triggered manually via separate HTTP endpoints.

This means the deployed API (`/normalized/*.json`, `/vocabulary.json`, `/graph.json`) serves stale data indefinitely until an operator intervenes. Since the daily scrape detects upstream source changes, the derived data should update automatically.

### Alternatives considered

1. **Separate cron per stage** — Requires external scheduler infrastructure (cron, systemd timer). Introduces coordination complexity: each stage must check that the previous stage completed successfully, with retry logic.

2. **GitHub Actions scheduled workflow** — The scrape must run on the server (file-based HTTP cache, `output/` directory on disk). Running normalization in CI would require shipping output back to the server, adding latency and complexity.

3. **Auto-chain within the server process** — Uses the existing in-process concurrency guards (`scrapeRunning`, `normalizeRunning`). No new infrastructure. Each stage reads previous output from disk, so ordering is naturally enforced. Chosen.

## Decision

After every successful scrape, the server automatically chains through the remaining pipeline stages in order:

```
scrape → normalizeAll (Stages 1+2) → normalizeVocabularyStage (Stage 3) → writeGraph
```

- The chain fires as a fire-and-forget promise from `runScrape()`, so the scrape HTTP endpoint responds immediately.
- Each stage has its own `try/catch`. If a stage fails, the next stage is still attempted — partial results are better than none, and each stage reads previous output from disk.
- The existing `normalizeRunning` flag is set during the chain, preventing concurrent manual triggers.
- Manual HTTP endpoints (`/api/normalize`, `/api/vocabulary`, `/api/graph`) remain available for development and manual intervention.

## Consequences

### Positive

- Derived data stays in sync with upstream sources automatically — no operator intervention needed after deploy.
- Zero-cost re-processing for unchanged data: Stage 1 uses content-hash caching per element (skips LLM calls), Stage 2 uses input-hash caching (skips entire batch if no elements changed), Stage 3 is deterministic and fast.
- Manual endpoints preserved for development and debugging flexibility.

### Negative

- A scrape that produces no meaningful changes still triggers the full chain daily. Mitigated by caching — the chain completes in under 30 seconds when nothing changed.
- If Stage 1+2 takes a long time (~15 min with full LLM extraction on fresh data), the vocabulary and graph endpoints serve stale data until the chain completes.
- Pipeline execution is tied to the server process lifecycle. If the server restarts mid-chain, work is lost. Mitigated by the daily cron which re-triggers within 24 hours.
- A single `normalizeRunning` flag gates all three post-scrape stages. A long-running Stage 1+2 blocks manual vocabulary or graph requests. This is acceptable because vocabulary and graph depend on Stage 1+2 output; running them with stale data would produce incorrect results anyway.
