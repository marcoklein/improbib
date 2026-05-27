# ADR-0002: Raw format is HTML

- **Date**: 2026-05-27
- **Status**: accepted

## Context

The raw layer needs to store the content from scraped pages. The choice is whether to store HTML (as extracted from the source) or convert to markdown immediately.

The current improwiki scraper converts HTML to markdown with Turndown and then applies regex-based cleaning to the flat markdown text. This is fragile — structural information from HTML is lost, and regexes like `/^#{2,3} Siehe auch([^#])*/gm` are source-language-specific.

## Decision

The raw layer stores the original content HTML as-is from each source page. Markdown conversion is deferred to the processing layer.

## Consequences

- The processing layer can clean unwanted content by targeting HTML elements (CSS selectors, tag types) before converting to markdown. This is more reliable than regexing flat text.
- The raw HTML preserves the source's original structure, making it easier to debug content extraction issues.
- Markdown conversion is lossy — deferring it preserves options.
- The raw JSON files are larger (HTML is more verbose than markdown), but the tradeoff is worth it for correctness.
- Any future format change (e.g., structured JSON extraction) can start from the raw HTML without re-scraping.
