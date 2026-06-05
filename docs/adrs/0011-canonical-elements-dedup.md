# ADR-0011: Canonical Elements & Cross-Source Deduplication

- **Date**: 2026-06-06
- **Status**: accepted
- **Source**: cross-cutting (graph derivation + normalization)

## Context

Cross-source element matching (Stage 2, ADR-0008) currently relies entirely on an LLM
batch-comparison prompt that sends element name + 200-char truncated description.
Across 1,354 elements, only ~46 LLM-confirmed cross-source pairs exist — "Freeze Tag"
(improwiki) and "Freeze" (learnimprov) are not connected despite being the same game.

The LLM misses matches because:
- Descriptions differ (one describes a specific game, the other a general structure)
- Only 200 chars of description are sent — structured mechanics/skills are not included
- The prompt runs BEFORE vocabulary canonicalization, so mechanics have different names
- No deterministic fallback exists when the LLM returns no match

Additionally, the knowledge graph currently maps all `relatedIdentifiers` to
`translationOf` edges — conflating "same game on different sources" with "same page
in different languages". The application layer has no canonical entity to query.

## Decision

### Canonical element model

The graph introduces a **two-tier element model**:

1. **Source elements** — directly from scraped/normalized data. Have URLs, source
   provenance, language-specific content. `canonical: false`.

2. **Canonical (reconciled) elements** — synthetic nodes created from cross-source
   deduplication clusters. No URL, no single source. `canonical: true`.
   Always have an English version; a German version exists when DE source elements
   are present in the cluster.

```
Freeze Tag [canonical · en · canonical: true]  ←── translationOf ──→  Freeze Tag [canonical · de · canonical: true]
├─ name: "Freeze Tag"                                               ├─ name: "Freeze Tag"
├─ description: merged EN content                                   ├─ description: from DE source
├─ howToPlay: merged EN steps                                       ├─ howToPlay: from DE source
├─ mechanics: [freeze signal, tag out, ...]   ← language-agnostic →  ├─ mechanics: [freeze signal, tag out, ...]
├─ skills: [spontaneity, physicality, ...]      (same set)          ├─ skills: [spontaneity, physicality, ...]
├─ tags: [Improv Games, warmup]                                     ├─ tags: [Improv Games, warmup]
└─ sources: [improwiki EN, learnimprov EN]                          └─ sources: [improwiki DE]
      ↑ canonicalOf              ↑ canonicalOf                           ↑ canonicalOf
Freeze Tag (imp EN)          Freeze (learn EN)                     Freeze Tag (imp DE)
      ↑ translationOf (1.0) ──────┘
Freeze Tag (imp DE)
```

### Edge types

| Edge | From → To | Source | Meaning |
|---|---|---|---|
| `canonicalOf` | Source element → Canonical element | Dedup matching | "I describe this game" |
| `translationOf` | Source DE → Source EN | Scraped translation links | "I am the German page for this English page" |
| `translationOf` | Canonical EN → Canonical DE | Graph derivation | "I am the German canonical for this English canonical" |

`relatedIdentifiers` from ADR-0008 Stage 2 become cluster seeds that drive
`canonicalOf` edges. `translationOf` is reserved for explicit page-level
translation links and canonical↔canonical language pairs.

### Canonical field merge strategy

| Field | EN canonical | DE canonical |
|---|---|---|
| `name` | Longest, most specific EN name | From DE source (or EN canonical if no DE name exists) |
| `description` | Longest EN description | Longest DE description |
| `howToPlay` | Union of EN step sets, deduped | From DE source (single source in practice) |
| `mechanics` | Union across all sources (vocabulary-canonicalized) | Same as EN canonical (language-agnostic) |
| `skills` | Union across all sources (vocabulary-canonicalized) | Same as EN canonical (language-agnostic) |
| `tags` | Union across all sources | Same as EN canonical (language-agnostic) |
| `difficulty` / `energy` | Mode across all sources | Same as EN canonical |
| `groupSize` | Widest range across all sources | Same as EN canonical |
| `sources` | `[{sourceName, url, identifier}]` provenance list | `[{sourceName, url, identifier}]` from DE sources |

### Dedup matching pipeline (Stage 4)

Runs **after vocabulary canonicalization** (Stage 3) so it benefits from
canonicalized mechanic/skill names:

```
Stage 3: Vocabulary canonicalization → canonicalized mechanics/skills on elements
    ↓
Stage 4a: Deterministic matching
  ├── 1. Curated thesaurus (element-thesaurus.json) — confidence 1.0
  ├── 2. Normalized name exact/substring match — confidence 0.85–0.95
  ├── 3. Shared canonical mechanic overlap (≥2 shared → 0.9, 1 shared → 0.7)
  └── 4. Weighted combined score (0.4×name + 0.4×mech + 0.2×skill → ≥0.65)
    ↓
Stage 4b: LLM matching (fallback for remaining unmatched pairs)
  └── Prompt includes canonicalized mechanics/skills, not just truncated description
    ↓
Stage 5: Graph derivation
  ├── Cluster relatedIdentifiers into canonical groups (connected components)
  ├── Create EN canonical per cluster (if EN source elements exist)
  ├── Create DE canonical per cluster (if DE source elements exist)
  ├── Wire canonicalOf edges (source → canonical, by language)
  └── Wire translationOf edges (canonical EN ↔ canonical DE)
```

### Name normalization for matching

```
"Freeze Tag-Exercise" → strip "-Exercise" → "Freeze Tag"
"Freeze Tag (warmup)" → strip parentheticals → "Freeze Tag"
"Freezing Tag"        → Levenshtein vs "Freeze Tag" → ratio 0.83 → match
```

Suffixes stripped: `-Exercise`, `-Game`, `-Variation`, `-Übung`, `-Spiel`,
`-Show`, `-Format`, and parentheticals `( ... )`.

### Cluster formation

`relatedIdentifiers` form symmetric pairs. Connected components (union-find)
define clusters. Within a cluster:
- EN source elements → EN canonical
- DE source elements → DE canonical
- DE source elements that translate to an EN source in the same cluster already
  participate via the EN source's canonicalOf edge. They also get `canonicalOf`
  → DE canonical.

### Singleton handling

- **EN singleton** (single EN source, no matches): No canonical — the source
  element serves as the de-facto canonical.
- **DE singleton** (single DE source, no EN): No canonical. If it has a
  `translationLinkEnIdentifier`, the EN source element is the de-facto canonical.
  Otherwise, the DE source element stands alone.
- **DE+EN pair** (translation-linked but no cross-source matches): EN source
  serves as the de-facto canonical. No synthetic canonical needed unless a
  second source later confirms a match.

## Consequences

### Enables
- Clean cross-source deduplication at the graph level
- Application layer sees canonical elements, not per-source duplicates
- Language filtering via `languageCode` on all nodes
- Incremental thesaurus growth without re-matching
- Edge-level QA — human can accept/reject individual `canonicalOf` edges

### Risks
- **Name-based matching false positives** — "Zweier-Synchro" and
  "Zweier-Szene" share a substring but are different games. Mitigation:
  mechanic overlap check provides a second signal.
- **Mechanic-only matching false positives** — two different games sharing
  mechanics (e.g., both use "freeze signal" + "tag out" but are distinct).
  Mitigation: name similarity required as primary signal; mechanic overlap
  boosts confidence but doesn't trigger matches alone.
- **Pipeline reordering** — LLM matching moves to after vocabulary
  canonicalization. If vocabulary changes, LLM matches may change slightly
  due to seeing different mechanic names. Mitigation: caching by contentHash
  + vocabularyHash ensures stability.

### Deferred
- Dedup for german-only games without translations — handled as singletons
- Multi-language canonical for languages other than DE/EN
