# ADR-0008: Content Normalization Layer

- **Date**: 2026-06-03
- **Status**: accepted
- **Source**: cross-cutting

## Context

Raw scraped content is unstructured HTML. A single source page can hold:
- A game description with inline variations and tips
- **Multiple independent games** under one page title (e.g., "Fangenspiele" lists 13 distinct games under separate `<h2>` sections) — 61 pages in improwiki alone exhibit this pattern
- Cross-references as `<a>` links to other wiki pages — 852 such links exist across 36% of improwiki pages, all stripped by HTML-to-markdown conversion
- Pedagogical notes, failure modes, staging advice intermixed with rules

Feeding this directly into knowledge graph derivation produces unreliable extraction. We need a structured intermediate representation that:
1. Splits multi-element pages before extraction
2. Preserves cross-reference context lost by markup conversion
3. Extracts content into well-typed, queryable fields
4. Extracts mechanics, skills, and practical metadata (difficulty, duration, energy) at normalization time rather than deferring them to a second LLM pass
5. Provides confidence-scored cross-source match hints

## Decision

### Pipeline architecture

The normalization layer has four stages. Each stage is deterministic except the LLM extraction stage. Every stage produces output that feeds the next, enabling partial re-runs.

```
┌──────────────────────────────────────────────────────────┐
│                    RAW SOURCES                            │
│         output/raw/{improwiki,learnimprov,ircwiki}.json  │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  STAGE 1: PRE-PROCESSING                                 │
│  • Preserve link targets from HTML as explicit annotations│
│  • Detect pages describing multiple independent elements │
│  • Split such pages into individual sub-elements          │
│  • Each sub-element inherits parent metadata + splitFrom  │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  STAGE 2: LLM EXTRACTION (batched)                       │
│  • 20-30 elements per LLM call (not one per element)     │
│  • Few-shot prompt including golden set examples          │
│  • Extracts structured fields for each element            │
│  • Content hash change detection skips unchanged elements |
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  STAGE 3: POST-VALIDATION                                │
│  • Referenced elements must appear in source text         │
│  • Variation names must appear in source text             │
│  • howToPlay null only for concept/theory pages           │
│  • Mechanics overlap with global mechanic vocabulary      │
│  • Schema validation (Zod)                                │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  STAGE 4: CROSS-SOURCE MATCHING                          │
│  • Token-overlap pre-filter (Jaccard ≥ 0.5)              │
│  • LLM confirmation on candidate pairs                    │
│  • Produces `relatedIdentifiers` with confidence scores   │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
                output/normalized/{source}.json
```

### Stage 1: Pre-processing

#### Multi-element page detection

A page is considered multi-element if it contains two or more sections that meet these criteria:
- Section begins with a heading (`<h2>` or equivalent based on source HTML conventions)
- Section body exceeds 200 characters
- Section body contains at least one of: structured list (`<ol>`, `<ul>`), player references ("Spieler", "players", "participants"), or imperative action patterns

When a page is multi-element:
- Each qualifying section becomes a separate element with its own identifier (MD5 of `parentIdentifier + sectionHeading`)
- Each inherits the parent's `url`, `sourceName`, `languageCode`, and `tags`
- Each stores `splitFrom: parentIdentifier` to preserve the relationship
- The parent page itself remains as an element (acts as an index/summary)

#### Link preservation

HTML anchor elements linking to other pages within the same source are extracted before markup conversion. The LLM prompt receives both:
- The markdown content (for readability)
- An explicit `linkedPages: string[]` field listing the link text of every internal link found in the section

This prevents the systematic `referencedElements` misses observed when Turndown strips `<a>` tags.

### Stage 2: LLM Extraction

#### Batching

Elements are sent to the LLM in batches of 20-30. Each batch is a single prompt containing a JSON array boundary. The LLM returns a JSON array of extracted objects, one per element. This reduces per-element overhead from ~2s (individual CLI spawns) to ~0.15s (amortized across the batch).

#### Few-shot prompting

Every batch prompt includes 2-3 examples drawn from the golden test set. Examples are selected to match the content types in the batch (e.g., include a German example when processing German elements, include a concept example when a batch contains theory pages). Examples demonstrate the expected output structure and quality.

#### Change detection

Each normalized element stores `contentHash = md5(htmlContent)`. On re-normalization, elements whose hash matches the previous run are preserved unchanged and excluded from LLM batches.

### Output schema

Each normalized element has this structure. All raw fields are preserved verbatim. The `normalized` object adds extracted structured fields.

```
identifier: string(32)           // MD5 hash, unchanged from raw layer
name: string                     // from raw layer
url: string(url)                 // from raw layer
sourceName: string               // from raw layer
languageCode: "de" | "en"        // from raw layer
tags: string[]                   // from raw layer
htmlContent: string              // preserved raw HTML
splitFrom?: string(32)           // parent identifier if this was split from a multi-element page

// Raw metadata from scraping (all optional, preserved verbatim)
translationLinkEn?: url
translationLinkDe?: url
translationLinkEnIdentifier?: string(32)
translationLinkDeIdentifier?: string(32)
playerCountMin?: number
playerCountMax?: number
categories?: string[]
postTags?: string[]
lastModified?: string

normalized: {
  // ── Core description ──
  description: string(min 20)            // 1-3 sentence summary in the element's language

  // ── Structured instructions ──
  howToPlay: null | {
    steps: {
      action: string                     // what to do (imperative)
      role?: string                      // who does it (if specific player/role)
      constraint?: string                // limitation or rule governing this step
    }[]
  }
  // null ONLY for theoretical concepts with no actionable steps
  // (e.g., "Game" as an improv concept, audience ask-for prompts)

  // ── Variations ──
  variations: {
    name: string
    description: string
    differsBy: string[]                 // what changes from the base form (mechanic, grouping, constraint, etc.)
  }[]

  // ── Tips ──
  tips: {
    text: string
    category: "pedagogical" | "staging" | "safety" | "group-dynamic" | "failure-mode" | "general"
  }[]

  // ── Cross-references ──
  referencedElements: {
    name: string                        // as it appears in the source text
    identifier?: string(32)             // resolved identifier if a confident match exists
    confidence?: 0..1                   // LLM confidence in the match (only if identifier present)
  }[]

  // ── Mechanics (reusable building blocks) ──
  mechanics: {
    name: string                        // canonical name, English preferred
    category?: "constraint" | "signal" | "role" | "structure" | "interaction"
  }[]

  // ── Skills (competencies trained by this element) ──
  skills: {
    name: string                        // canonical name
    category?: "social" | "physical" | "cognitive" | "narrative" | "vocal"
  }[]

  // ── Practical metadata for workshop planner ──
  practical: {
    difficulty?: "beginner" | "intermediate" | "advanced"
    typicalDurationMinutes?: number
    energyLevel?: "low" | "medium" | "high"
    groupSize?: { min?: number; max?: number }
    requiresPreparation?: boolean
    suitableFor?: ("warmup" | "exercise" | "performance" | "encore" | "workshop")[]
  }

  // ── Audit ──
  contentHash: string                   // MD5 of htmlContent for change detection
  extractedAt: string                   // ISO 8601 timestamp
}

// ── Derived sub-elements (from inline variations) ──
derivedElements: {
  name: string
  description: string
  parentIdentifier: string(32)
}[]

// ── Cross-source matches (populated in Stage 4) ──
relatedIdentifiers: string(32)[]
```

### Source-level output format

Each source produces `output/normalized/{source}.json`:

```
{
  meta: {
    sourceName: string
    elementCount: number
    derivedElementCount: number
    splitElementCount: number            // elements created from multi-element page splits
    normalizedAt: string                 // ISO 8601
  },
  elements: NormalizedElement[]
}
```

### Stage 3: Post-validation

After LLM extraction, deterministic checks run on every element:

| Check | What it validates | Action on failure |
|-------|-------------------|-------------------|
| Reference existence | Each `referencedElements[].name` substring-appears in the source markdown | Remove hallucinated reference, log warning |
| Variation existence | Each `variations[].name` substring-appears in the source markdown | Remove hallucinated variation, log warning |
| Null howToPlay | `howToPlay` is null ONLY for concept/theory pages (detected by tag presence or content signals) | Flag for human review |
| Description length | `description` ≥ 20 characters | Flag for human review |
| Step count | If `howToPlay` is present, it has ≥ 1 step | Flag for human review |
| Mechanic vocabulary | Extracted mechanic names that overlap existing mechanic names across the corpus strengthen the global vocabulary | Record new mechanics for review |
| Schema conformance | Full element matches Zod schema | Discard invalid elements, log error |

Flagged elements are still written to output (with a `_validationFlags: string[]` field added) to avoid data loss, but are excluded from confidence scoring.

### Stage 4: Cross-source matching

**Pre-filter**: All elements across all sources are compared using normalized name token overlap (Jaccard similarity). Pairs with score ≥ 0.5 (lower threshold than before — casts a wider net to catch reorderings and near-matches) proceed to confirmation. Same-source pairs are excluded. Same-language-only matching is preferred (de↔de, en↔en) but cross-language pairs are not explicitly excluded since improwiki has both DE and EN elements.

**LLM confirmation**: Candidate pairs are sent to the LLM in batches with the prompt: "Are these the same improv game/exercise?" The LLM returns `{match: boolean, confidence: number}`.

**Result**: `relatedIdentifiers` is populated with matched pairs. The graph layer uses these as merge hints with a confidence threshold.

### Derived sub-elements

Inline variations extracted by the LLM are promoted to `derivedElements`. The threshold for promotion is the **presence of a distinct, named variation** (removing the arbitrary >40-character heuristic). The LLM decides what constitutes a variation vs. a minor detail. All extracted variations appear in `normalized.variations`; those that represent distinct, playable variants also appear in `derivedElements`.

### Model selection

The model is configurable. The default is the fastest viable model available at normalization time. Model performance is tracked via the golden test set benchmark. The benchmark script supports adding new models trivially.

### LLM client interface

The LLM client is an abstraction behind an interface. The normalization pipeline calls `client.extractBatch(elements)` and receives structured output. The specific transport mechanism (CLI spawn, HTTP API, SDK) is an implementation detail.

### Golden test set

A committed golden test set serves as ground truth for:
1. **Model comparison**: Benchmark any LLM against hand-verified expected outputs
2. **Regression detection**: Changes to prompts, preprocessing, or post-validation are measured against the golden set
3. **Quality gate**: Full normalization runs log per-field accuracy against the benchmark

The golden set covers at minimum:
- Well-structured game with variations and tips (from improwiki)
- Short exercise with minimal content
- Long-form show format with complex structure
- German content
- Concept/theory page (null howToPlay)
- Page with explicit cross-references (referencedElements with known targets)
- Multi-element page (splits into 3+ sub-elements)
- Audience ask-for prompt (null howToPlay, minimal content)
- Musical form
- Handle overlay
- Category/index page that describes related but independent games
- Empty or near-empty HTML content
- ircwiki content (different HTML conventions)
- learnimprov content (wp-block-paragraph structure)

Minimum 20 entries, with at least 2 in German and at least 2 from each source.

## Consequences

### Enables
- Structured graph derivation without re-processing raw content
- Multi-element page decomposition — no lost games hidden inside category pages
- Resolvable cross-references (identifiers, not bare names)
- Workshop planner data (difficulty, duration, energy, group size) available at graph layer without additional LLM passes
- Global mechanic and skill vocabularies built incrementally from per-element extraction
- Confidence-scored cross-source merge hints
- Incremental re-normalization (content hash caching)
- Model-agnostic quality measurement via golden set benchmark

### Risks
- Batched LLM extraction can fail for an entire batch if the LLM returns malformed JSON for any element. Mitigation: retry failed batches individually.
- Multi-element page detection heuristic may produce false positives (splitting a single game's sections into artificial sub-elements) or false negatives (failing to split a genuinely multi-element page). Mitigation: log all splits for review; the `splitFrom` field makes it easy to audit and correct.
- Mechanic and skill extraction may produce inconsistent naming (same mechanic called "freeze" in one element and "stop signal" in another). Mitigation: post-validation tracks a global vocabulary and normalizes names.
- Few-shot examples in the prompt consume context window budget. Mitigation: select examples dynamically based on content type; keep examples concise.
- Post-validation rejection of hallucinated references may discard valid references that are paraphrased rather than verbatim. Mitigation: use substring matching with a similarity threshold, not exact match; log all removals for review.
- Cross-source LLM matching adds a cost linear to the number of candidate pairs. Mitigation: the Jaccard pre-filter keeps the candidate set small (only pairs with ≥50% token overlap proceed to LLM confirmation).

### Deferred to Layer 2 (Knowledge Graph)
- Mechanic and skill vocabulary normalization (deduplicating synonyms across elements)
- Tag taxonomy derivation (grouping 111 flat tags into categories)
- Edge computation from extracted fields (variantOf, trainsSkill, hasMechanic, similarTo, prerequisiteFor)
- Final cross-source merge decisions (graph layer applies its own confidence threshold to relatedIdentifiers)
- Human QA override integration

### Rejected alternatives
- **Single-element-per-LLM-call**: Demonstrated to be ~15× slower than batching. Rejected in favor of batched extraction.
- **Deferring mechanics/skills to Layer 2**: Would require a second LLM pass over the same content, doubling total LLM cost. The marginal cost of extracting mechanics and skills at normalization time is negligible compared to re-processing. Rejected.
- **Pure deterministic cross-source matching (Jaccard only)**: Misses reorderings, near-matches, and translations. LLM confirmation adds precision at reasonable cost given the pre-filter. Rejected.
- **Normalizing via direct HTTP API calls**: The OpenCode Go API endpoint is not a standard chat completions endpoint. Direct HTTP calls returned "Not Found" on all tested URL patterns. The CLI-based approach using `opencode run` works reliably and reuses existing authentication. Retained from the previous revision of this ADR.
