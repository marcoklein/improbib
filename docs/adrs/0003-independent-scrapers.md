# ADR-0003: Independent scrapers per source

- **Date**: 2026-05-27
- **Status**: accepted

## Context

The project will scrape multiple improv sources, each with different page structures (WordPress, MediaWiki, static HTML), different navigation patterns (category listings, sitemaps, sidebar menus), and different metadata schemas (card fields, WordPress taxonomies, translation links).

A shared base class or scraper interface would need to accommodate all of these, adding abstraction overhead without real reuse.

## Decision

There is no shared scraper base class, interface, or pipeline. Each source is a self-contained module that:

- Discovers its own URLs from entry/listing pages
- Fetches pages via the shared `fetchAndCacheWebsite` utility
- Extracts its own metadata fields
- Resolves cross-page links (e.g., translation links, prev/next)
- Deduplicates by identifier via the shared `mergeElements` utility
- Writes its own `output/raw/{source}.json`

Shared utilities (`fetchAndCacheWebsite`, `mergeElements`, `mergeEntities`) are consumed as plain functions, not forced through inheritance.

## Consequences

- Adding a new source means writing a new, self-contained scraper module. No refactoring of existing scrapers or shared abstractions is required.
- Each scraper can diverge freely. A bug in one scraper never affects another.
- Some duplication of patterns may occur (e.g., cheerio parsing, file writing), but the shared utilities already cover the meaningful shared behavior.
- If a common pattern emerges across many scrapers, it can be extracted to a shared utility later without changing the scraper API.
