# ADR-0006: Translation link resolution in raw layer

- **Date**: 2026-05-27
- **Status**: accepted
- **Source**: improwiki.com

## Context

improwiki pages carry `<link rel="alternate" hreflang="en/de">` tags that link German and English versions of the same improv structure. These linked pages may or may not already be present in the scraped element set.

Resolving these links requires fetching the linked pages if they are missing — a network operation. The question is whether this resolution belongs in the raw scraping layer or the processing layer.

## Decision

Translation link resolution stays in the raw scraping layer. Missing linked pages are fetched, processed, and added to the element set during scraping.

The raw output includes resolved `translationLinkEnIdentifier` and `translationLinkDeIdentifier` fields that cross-reference element identifiers.

## Consequences

- The raw JSON is self-contained for cross-language data — the processing layer sees complete translation pairs without needing network access.
- Resolution is cached via the shared `.cache/` mechanism, so repeat scrapes don't re-fetch resolved pages.
- The processing layer remains a pure transformation pipeline with no network dependency.
- If a translation link breaks or changes, the raw JSON reflects the state at scrape time (immutable snapshot).
