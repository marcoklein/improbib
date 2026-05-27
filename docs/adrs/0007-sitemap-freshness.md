# ADR-0007: Sitemap-based freshness over If-Modified-Since

- **Date**: 2026-05-27
- **Status**: accepted

## Context

Re-scraping should avoid re-fetching unchanged pages to reduce load on source servers and speed up runs. Two standard HTTP caching mechanisms were evaluated:

1. **`If-Modified-Since`** — send the cached page's fetch date; server returns 304 Not Modified if unchanged
2. **Sitemap lastmod** — compare the sitemap's `<lastmod>` per URL against our `fetchedAt` timestamp

## Decision

Use sitemap-based freshness checking. Both sources publish XML sitemaps with `<lastmod>` dates per URL. Neither source returns `Last-Modified` response headers nor supports `If-Modified-Since` (both are dynamically generated CMS pages — WordPress and MediaWiki — not static files).

Before scraping, the sitemap is fetched once and parsed into a `Map<url, lastmod>`. Candidate URLs from listing pages are checked against this map:

- New URL (not in existing raw output) → always fetch
- Known URL where `sitemap.lastmod > fetchedAt` → page may have changed, refetch
- Known URL where `sitemap.lastmod <= fetchedAt` → skip
- Known URL not in sitemap → skip (no signal, assume unchanged)

The `cache.name` in `.cache/` remains the primary cache for already-fetched pages. The sitemap is the secondary check that avoids even the HTTP round-trip.

## Consequences

- Sitemap fetch is O(1) per scrape run (~50 kB for learnimprov, ~1 MB for improwiki). This replaces O(n) HTTP requests for unchanged pages.
- For learnimprov, the last content update was in 2024, so 100% of posts are skipped on re-scrape — the scraper completes in seconds.
- If a sitemap is unavailable or malformed, the scraper falls back to fetching all candidate URLs (safe default).
- Sitemap `<lastmod>` reflects the CMS metadata, which is a reasonable proxy for content change. It may not capture template-level changes, but those are irrelevant for raw content scraping.
- improwiki's sitemaps are per-language. Both `sitemap-en.xml` and `sitemap-de.xml` are fetched and merged since the scraper covers both languages.
