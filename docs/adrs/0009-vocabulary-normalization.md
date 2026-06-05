# ADR-0009: Vocabulary Normalization via Deterministic Clustering

- **Date**: 2026-06-05
- **Status**: accepted
- **Source**: normalization (Stage 3 replacement)

## Context

After Stage 1 LLM extraction, mechanics and skills across ~1355 elements have
inconsistent naming. The same concept appears as "freeze", "freeze signal",
"stop signal", and "Einfrieren". Without canonicalization, the knowledge graph
produces duplicate Mechanic/Skill nodes and incorrect edges.

ADR-0008 originally planned LLM-based vocabulary clustering (Stage 3). This was
found impractical: the flash model caps at ~50 terms per call, and 2312+
mechanics + 689+ skills would require ~60 minutes of API time with unreliable
cross-chunk deduplication. Stage 3 was explicitly deferred.

## Decision

Vocabulary normalization uses **deterministic string similarity clustering**
with these inputs, applied in priority order:

1. **Curated thesaurus** (`output/vocabulary-thesaurus.json`) — committed,
   human-maintained ground truth. Terms matched here are removed from automated
   clustering. This file grows over time through review.

2. **Translation-link seeds** — German elements with `translationLinkEnIdentifier`
   that have exactly one mechanic/skill in the same category as their English
   counterpart produce a high-confidence mapping. Conservative (1:1 only) but
   zero false positives.

3. **Token Jaccard similarity** — primary automated signal. Mechanics use
   threshold ≥ 0.6; skills use ≥ 0.5. Tokenization on whitespace after
   normalizing punctuation.

4. **Levenshtein ratio** (≥ 0.75) — secondary signal for short terms (≤ 10
   chars). Catches inflection variants like "freeze"/"freezing" that token
   Jaccard would miss.

Category information (mechanic/skill category) is not used as a constraint in
the initial implementation. It may be added later as a soft tiebreaker if false
merges are observed.

### Algorithm

```
1. Collect unique terms with frequency counts
2. Build thesaurus map, remove covered terms from pool
3. Pairwise similarity on remaining terms → union-find clustering
4. For each cluster, pick canonical name:
   - Translation-seeded name (if any member was seeded)
   - Most frequent variant across all elements
   - English preferred over German
   - Shorter name preferred on tie
5. Merge translation-seed mappings into clusters
6. Return thesaurus clusters + automated clusters
```

### Format

```json
{
  "mechanics": [
    {"canonical": "freeze signal", "variants": ["freeze", "freezing", "Einfrieren"], "parent": null}
  ],
  "skills": [
    {"canonical": "active listening", "variants": ["listening", "Zuhören"], "parent": null}
  ]
}
```

### Write-back

Canonical names are written back to normalized elements. The original name is
preserved in `originalName` — the write-back is additive and reversible. Terms
already matching the canonical form are unchanged.

### Taxonomy placeholder

A `parent` field on each cluster reserves space for future taxonomy hierarchies
(ADR-TBD). Currently always `null`. When populated, it references a parent
taxonomy node (e.g., `"interrupt signal"` → groups freeze, tap out, clap in).
No automatic taxonomy inference is performed.

## Consequences

### Enables
- Knowledge graph `Mechanic` and `Skill` nodes with clean canonical names
- Cross-source elements sharing the same mechanic/skill nodes
- Reliable filtering by mechanic/skill in the application layer
- Incremental thesaurus growth without re-clustering
- Reversible canonicalization via `originalName`

### Risks
- **String similarity may miss semantic synonyms** (e.g., "freeze"/"stop signal"
  share no tokens). Mitigation: thesaurus entries for known cases.
- **Translation seeds are conservative** — only 1:1 mechanic/element pairs
  produce mappings. Broader cross-language coverage requires thesaurus.
- **Canonical name selection may pick awkward forms** — reversible via
  thesaurus override; `originalName` preserved for rollback.
- **No category constraint** — false merges across mechanic categories are
  theoretically possible but unlikely given high thresholds and domain-specific
  vocabulary.

### Deferred
- Taxonomy/hierarchy over canonical terms — reserved via `parent` field
- LLM refinement pass on orphaned singletons — optional future enhancement
- Category-based tiebreaking — if false merges are observed at scale
