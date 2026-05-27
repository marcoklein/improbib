# ADR-0005: MD5 identifier from name and URL

- **Date**: 2026-05-27
- **Status**: accepted

## Context

Every element scraped from any source needs a stable, unique identifier. Identifiers are used for deduplication (same page scraped from two different listing pages), cross-referencing (translation links), and file naming (HTML/markdown output files).

The identifier must be deterministic (same page → same ID on every scrape), source-agnostic (no collisions between sources), and not require a central registry.

## Decision

The element identifier is computed as:

```
md5("element;{name};{url}")
```

The URL is the canonical unique key — no two pages share a URL. Including the name adds collision resistance against URL redirects or normalization edge cases.

No source prefix is included because URLs are globally unique across sources (e.g., `https://improwiki.com/...` and `https://www.learnimprov.com/...` cannot collide).

## Consequences

- Deduplication works correctly: scraping the same structure from two different listing pages on the same source naturally merges.
- Cross-source collisions are impossible since URLs are domain-scoped.
- MD5 is not cryptographically secure, but collision resistance is not required — only uniqueness within a bounded set of ~2000 elements.
- If a source changes its URL scheme, identifiers change and previously scraped data becomes orphaned. This is acceptable since a URL change is a semantic change worth treating as a new element.
