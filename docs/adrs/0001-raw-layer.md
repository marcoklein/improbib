# ADR-0001: Raw layer before processing

- **Date**: 2026-05-27
- **Status**: accepted

## Context

The scraper pipeline currently couples data acquisition with data transformation in a single function. This means iterating on cleaning rules, HTML-to-markdown conversion, or tag mappings requires re-scraping source websites entirely — slow, wasteful, and prone to rate-limiting.

As more improv sources are added (learnimprov.com, wiki.improvresourcecenter.com), each with different HTML structures and metadata schemas, the coupling compounds: every change to post-processing invalidates cached scraps.

## Decision

Scraping and post-processing are separated into two layers:

- **Raw layer**: scrapes source websites, extracts metadata and raw HTML content, resolves cross-page links, deduplicates by identifier, writes an immutable JSON snapshot.
- **Processing layer**: reads raw JSON, cleans HTML, converts to markdown, transforms and translates tags, merges sources, validates against the schema, writes final output.

The raw layer is the source of truth. The processing layer is a pure pipeline from raw JSON to validated output — no network access.

## Consequences

- Processing rules can be iterated on without re-scraping, since raw JSON serves as a local cache.
- Each source produces its own `output/raw/{source}.json`, keeping sources decoupled.
- The raw JSON is diffable, making it easy to audit what changed between scrapes.
- Adds an intermediate file on disk, but disk is cheap and the file is a deliberate checkpoint.
