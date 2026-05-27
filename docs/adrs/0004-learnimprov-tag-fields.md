# ADR-0004: Learnimprov — separate category and tag fields

- **Date**: 2026-05-27
- **Status**: accepted
- **Source**: learnimprov.com

## Context

learnimprov.com is a WordPress site. Each improv structure (post) has two WordPress taxonomies:

- **Categories**: broad classification of the structure type (e.g. "Warm-Up", "Exercise", "Handle", "Long Form", "Show", "Ask For"). Each post has 1–3 categories.
- **Tags**: narrow descriptors of skills and traits (e.g. "circle", "listening", "character", "commitment", "ice breaker"). Each post has 0–15 tags.

These carry different semantics — categories describe *what kind* of structure, tags describe *what it exercises*. The improwiki scraper has only a single flat `tags` field, which conflates structure type with skill category.

## Decision

learnimprov raw elements store WordPress categories and post tags as separate fields (`categories` and `postTags`) in addition to the flat `tags` field (which holds only the listing-page source tags like "Warm-Up"). The processing layer decides how to combine, weight, or separate them when generating normalized `tagIds`.

## Consequences

- The semantic distinction between structure type and skill/trait is preserved for downstream use (filtering, taxonomy analysis, UI grouping).
- The processing layer has the raw material to make informed decisions about tag normalization rather than guessing from a flat list.
- The flat `tags` field on improwiki elements continues to work as-is — no schema change required.
- The raw JSON is slightly larger due to field duplication, but the two fields capture information the flat list would lose.
