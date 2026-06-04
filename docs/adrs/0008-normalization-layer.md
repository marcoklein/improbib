# ADR-0008: Content Normalization Layer

- **Date**: 2026-06-03
- **Status**: accepted
- **Source**: cross-cutting

## Context

Raw scraped content is unstructured HTML. A single source page can hold:
- A game description with inline variations and tips
- **Multiple independent games** under one page title (e.g., "Fangenspiele" lists 13 distinct games under separate `<h2>` sections) — 61 pages in improwiki alone exhibit this pattern
- **Cross-references as `<a href>` links** to other wiki pages — 852 such links exist across 36% of improwiki pages
- Pedagogical notes, failure modes, staging advice intermixed with rules

Feeding this directly into knowledge graph derivation produces unreliable extraction. We need a structured intermediate representation that:
1. Splits multi-element pages into individual atomic elements
2. Resolves cross-references using the actual link targets preserved in raw HTML
3. Extracts content into well-typed, queryable fields
4. Extracts mechanics, skills, and practical metadata (difficulty, duration, energy) at normalization time rather than deferring them to a second LLM pass
5. Provides confidence-scored cross-source match hints

## Decision

### Atomicity invariant

Every element in the normalized output describes **exactly one improvisation structure** — a single game, exercise, concept, show format, or warm-up. No element bundles multiple independent structures.

This invariant drives every stage of the pipeline:
- **Multi-element pages are split**: When a source page describes multiple games, the LLM splits them into individual atomic elements
- **Cross-references point to atomic targets**: When a `<a>` link targets a multi-element page, the reference resolves to the specific child element, not the parent index
- **Derived elements are atomic**: Each derived sub-element describes a single distinct, playable variant
- **Parent index pages have `howToPlay: null`**: They summarize a category, not a specific game
- **Show formats are atomic**: A long-form structure or handle that describes a single compositional framework (e.g., "Harold", "Deconstruction") is one element, even though its howToPlay describes multiple scenes or phases. The format *is* the element.

A reader can take any element's `normalized.howToPlay` and run exactly one game or format. There is never ambiguity about which thing is being described.

### Why raw HTML instead of markdown

The raw scraped HTML in our corpus is clean article content — no navigation, no scripts, no CSS, no ads. The tag overhead is purely structural:

| Source | Avg HTML | Markup overhead | What the markup carries |
|--------|----------|-----------------|------------------------|
| improwiki | 1,329 chars | 13% | `<a href>` links, `<h2>`/`<h3>` hierarchy, `<ol>`/`<ul>` semantics, `<strong>`/`<em>` |
| learnimprov | 2,125 chars | 44% | `<a>` links, `<strong>` pseudo-headings (WordPress uses bold paragraphs instead of heading tags), `<ul>` |
| ircwiki | 2,847 chars | 87% | `<a href>` with full wiki URLs, `<span class="mw-headline">` headings, TOC structure, `<b>`/`<i>` |

Converting this to markdown destroys precisely the information the LLM needs:
- `<a href="/wiki/blind-synchro">Blind Synchro</a>` becomes `Blind Synchro` — the link target is lost, making cross-reference resolution impossible
- `<h2>`/`<h3>` becomes `##`/`###` — heading level is preserved, but MediaWiki heading spans and WordPress `<strong>` pseudo-headings are lost
- `<ol>`/`<ul>` semantics become indistinguishable markdown lists

Feeding raw HTML directly to the LLM preserves all structural information. The token-cost overhead is negligible: for a ~1,500 char element, HTML adds ~200-1,300 chars depending on source, against a model context window of 128k+ tokens.

### Pipeline architecture

Three LLM-driven stages plus structural validation. No deterministic content-processing stages — the LLM handles all content understanding. Stage 1 uses per-element API calls (not batches) to maximize parallelism. Stage 2 and Stage 3 use batched calls because they require the LLM to compare many elements or terms simultaneously.

```
┌──────────────────────────────────────────────────────────┐
│                    RAW SOURCES                            │
│         output/raw/{improwiki,learnimprov,ircwiki}.json  │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  STAGE 1: LLM EXTRACTION (per-element, parallel)         │
│  • Raw HTML fed directly to LLM (no markdown conversion) │
│  • One API call per element, high concurrency             │
│  • Few-shot via shared system prompt                      │
│  • LLM detects multi-element pages from HTML structure    │
│  • LLM resolves cross-references from <a> tags            │
│  • contentHash change detection skips unchanged elements  │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  STRUCTURAL VALIDATION (Zod)                             │
│  • Schema conformance check on every element              │
│  • Invalid elements discarded with logged errors          │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  STAGE 2: CROSS-SOURCE MATCHING (batched LLM)            │
│  • Elements from different sources sent to LLM in batches │
│  • LLM identifies matching pairs using names + descriptions│
│  • Produces `relatedIdentifiers` with confidence scores   │
│  • Batched — the LLM must compare many elements at once   │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  STAGE 3: VOCABULARY NORMALIZATION (batched LLM)         │
│  • All unique mechanics, skills collected from all sources│
│  • LLM clusters synonyms, assigns canonical terms         │
│  • Produces `output/vocabulary.json` mapping              │
│  • Optionally writes canonical terms back into normalized │
│    elements                                               │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
                output/normalized/{source}.json
                output/vocabulary.json
```

### Stage 1: LLM Extraction

#### Per-element processing

Each element triggers one API call. Calls run concurrently (configurable limit, default 20). This is the optimal approach because:

- **Change detection is per-element**: contentHash caching means only changed elements need processing. Per-element calls naturally skip cached elements without repacking batches.
- **Error isolation**: one malformed JSON response affects only that element, never an entire batch.
- **Simplicity**: single JSON object per response, no array parsing, no ordering bugs.
- **Throughput**: with direct HTTP API (~100ms latency) and high concurrency, 1355 elements complete in under a minute of wall time. Per-element throughput is comparable to batched throughput — the ~2s CLI spawn overhead that originally motivated batching no longer exists.

#### System prompt

Every API call uses a shared system prompt containing:
- Extraction instructions (target schema, language rules, atomicity requirements)
- 1-2 concise few-shot examples from the golden set, demonstrating the output structure, how to handle null howToPlay for concepts and parent index pages, and how to categorize tips and mechanics
- Explicit rules for multi-element page splitting and show format handling

The system prompt is identical across all Stage 1 calls. If the API server caches identical system prompts, the token cost is paid once.

#### Input

Each call receives the element's **raw HTML content** (exactly as scraped), its **name**, **language code**, and **tags** (scraped metadata — gives the LLM context about whether this is a game, exercise, concept, etc.).

#### Multi-element page handling

The LLM detects when a page describes multiple independent games/exercises. When it does, each distinct game becomes a separate atomic element. The response includes the parent element plus all child elements.

**Parent index elements** after a split:
- `description`: a summary of what the category contains (e.g., "Various tag-based warm-up games played at the start of rehearsal")
- `howToPlay`: **null** (it is an index, not a playable game)
- `referencedElements`: populated with all child elements split from it
- `splitFrom`: absent (it is the original page)

**Child elements** after a split:
- Name taken from the section heading
- Identifier derived from `md5(parentIdentifier + childName)` — the parent's identifier plus the child's heading text ensure uniqueness
- Full normalized fields extracted independently from that section's HTML
- `splitFrom`: set to the parent's identifier
- Inherit parent's `url`, `sourceName`, `languageCode`, and `tags`

The LLM determines splitting based on HTML heading hierarchy, content structure, and semantic understanding — no heuristics, no character-count thresholds, no source-specific detection logic.

#### Show format handling

A show format, long-form structure, or handle that describes a single compositional framework is **one atomic element**. The howToPlay may describe multiple scenes, phases, or transitions — that is expected and correct. The LLM must not split a show format into its constituent phases. The golden test set includes both a multi-element index page (which must be split) and a complex show format (which must not be split) to verify this distinction.

#### Cross-reference resolution

The LLM sees `<a href="...">` tags with their full targets and extracts the referenced page name from the link text and href attribute. This produces `referencedElements` entries with `name` populated.

Identifier resolution is done deterministically after extraction, not by the LLM:
1. The extracted `name` is matched against the element catalog (all known element names and identifiers across all sources)
2. If an exact or high-confidence fuzzy match is found, the `identifier` and `confidence` fields are populated
3. If the target is a multi-element parent page (which may have been split), the resolution looks up the appropriate child element rather than the parent
4. If no match is found, the entry keeps only `name` — the graph layer can attempt resolution later with its own catalog

Bare text mentions that are not `<a>` links should not generate `referencedElements` entries. The LLM is instructed to only extract references that are explicit hyperlinks in the source HTML.

#### Change detection

Each normalized element stores `contentHash = md5(htmlContent)`. On re-normalization, elements whose hash matches the previous run are preserved unchanged and skipped — no API call.

### Output schema

Each normalized element has this structure. All raw fields are preserved verbatim. The `normalized` object adds extracted structured fields.

```
identifier: string(32)           // MD5 hash, unchanged from raw layer
name: string                     // from raw layer
url: string(url)                 // from raw layer
sourceName: string               // from raw layer
languageCode: "de" | "en"        // from raw layer
tags: string[]                   // from raw layer
htmlContent: string              // preserved raw HTML — unchanged from scraping
splitFrom?: string(32)           // parent identifier if split from a multi-element page

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
  // null for: theoretical concepts, parent index pages, audience ask-for prompts
  // Non-null for: games, exercises, warm-ups, show formats, handles
  // Steps describe what to do in order. Most games decompose naturally into steps.
  // When a game is a single continuous action (e.g., "play a scene"), it may have
  // a single step with constraints describing the rules.
  // A show format (e.g., "Harold") may describe multiple phases — that is correct
  // because the format itself is the atomic element
  howToPlay: null | {
    steps: {
      action: string                     // what to do (imperative mood)
      role?: string                      // who does it (if a specific player/role)
      constraint?: string                // limitation or rule governing this step
    }[]
  }

  // ── Variations ──
  variations: {
    name: string
    description: string
    differsBy: string[]                 // what changes from the base form (e.g., "blindfold added", "competitive scoring")
  }[]

  // ── Tips ──
  tips: {
    text: string
    category: "pedagogical" | "staging" | "safety" | "group-dynamic" | "failure-mode" | "general"
  }[]

  // ── Cross-references ──
  referencedElements: {
    name: string                        // as it appears in the source text
    identifier?: string(32)             // resolved identifier from <a> link target or LLM matching
    confidence?: 0..1                   // LLM confidence in the identifier match (only present when identifier is set)
  }[]

  // ── Mechanics (reusable building blocks) ──
  mechanics: {
    name: string                        // current name (raw from extraction, then canonical after Stage 3)
    originalName?: string               // pre-canonicalization term, set by Stage 3 write-back
    category?: "constraint" | "signal" | "role" | "structure" | "interaction"
  }[]

  // ── Skills (competencies trained by this element) ──
  skills: {
    name: string                        // current name (raw from extraction, then canonical after Stage 3)
    originalName?: string               // pre-canonicalization term, set by Stage 3 write-back
    category?: "social" | "physical" | "cognitive" | "narrative" | "vocal"
  }[]

  // ── Practical metadata ──
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

// ── Derived sub-elements (atomic, from inline variations) ──
derivedElements: {
  name: string
  description: string
  parentIdentifier: string(32)
}[]

// ── Cross-source matches (populated in Stage 2) ──
  relatedIdentifiers: {identifier: string(32), confidence: 0..1}[]
```

### Source-level output format

Each source produces `output/normalized/{source}.json`:

```
{
  meta: {
    sourceName: string
    elementCount: number                // includes split children
    derivedElementCount: number         // inline variations promoted to sub-elements
    splitElementCount: number           // count of elements with splitFrom set
    normalizedAt: string                // ISO 8601
  },
  elements: NormalizedElement[]
}
```

### Structural validation

After LLM extraction, every element is validated against the Zod schema. Elements that fail validation are discarded with logged errors.

No semantic post-validation is performed at this layer. The LLM is responsible for content quality, guided by the system prompt's few-shot examples and explicit rules. Quality measurement belongs to the golden set benchmark; correction belongs to human QA (Layer 2.5).

### Stage 2: Cross-source matching

Elements from different sources are sent to the LLM in batches. This is a batched stage — the LLM must compare many elements simultaneously to determine semantic equivalence, which per-element calls cannot do.

Before LLM comparison, **translation links from the scraped data are seeded as pre-matched pairs** with confidence 1.0. The scraped `translationLinkEnIdentifier` and `translationLinkDeIdentifier` fields explicitly link German↔English translations of the same page. These pairs require no LLM inference.

The LLM receives the remaining elements as two lists (element names, descriptions, source names, identifiers — not full HTML) and returns all additional matching pairs with confidence scores. It uses semantic understanding of improvisation terminology, not string matching.

Cross-source matching points to **atomic targets**: if a match is found with a parent index page, the match resolves to the appropriate child element instead.

### Stage 3: Vocabulary Normalization

After all sources are normalized and cross-referenced, the extracted terms for mechanics, skills, and other concept types will contain synonyms and inconsistencies. "Freeze" in one element, "freeze signal" in another, "Einfrieren" in a German element — all refer to the same mechanic. "Handle", "inspiration", "Vorgabe", and "ask-for" all describe the same concept type.

Stage 3 collects all unique terms from every normalized element and sends them to the LLM for synonym clustering and canonical naming.

#### What is normalized

- **Mechanics**: All unique `mechanics[].name` values across all elements → canonical mechanic names (English preferred)
- **Skills**: All unique `skills[].name` values across all elements → canonical skill names (English preferred)

Concept types (e.g., "handle" → "ask-for", "Vorgabe" → "ask-for") are deferred to Layer 2's tag taxonomy work. Tags have their own source-specific flat systems that need restructuring, which is a taxonomy problem, not a terminology mapping problem.

#### Process

1. Collect all unique mechanic names and skill names from every normalized element across all sources
2. Send the combined sets to the LLM in a single batch call
3. The LLM returns clusters: groups of synonyms unified under one canonical name
4. Output `output/vocabulary.json` as a mapping artifact
5. Optionally: write canonical terms back into the normalized source files so Layer 2 receives clean data directly

#### Output format

```
{
  "mechanics": [
    {
      "canonical": "freeze signal",
      "variants": ["freeze", "freeze signal", "stop signal", "tap out", "einfrieren"]
    },
    ...
  ],
  "skills": [
    {
      "canonical": "active listening",
      "variants": ["listening", "active listening", "zuhören", "attentive listening"]
    },
    ...
  ]
}
```

#### Writing back

If enabled, each normalized element's `mechanics[].name` and `skills[].name` are replaced with their canonical forms. The original extracted term is preserved in a new field: `mechanics[].originalName` and `skills[].originalName`. The `contentHash` is not affected — canonicalization is a non-destructive mapping applied on top of extraction.

This makes Layer 2's job simpler: `hasMechanic: "freeze signal"` appears consistently across all elements, regardless of the term the LLM originally extracted from each page.

### Derived sub-elements

Inline variations extracted by the LLM are promoted to `derivedElements`. The LLM determines which variations represent distinct, playable, **atomic** variants deserving of their own sub-element — as opposed to minor detail variations. All extracted variations appear in `normalized.variations`. Those the LLM marks as distinct also appear in `derivedElements`.

### Model configuration

The model is configurable. The default is the fastest viable model available at normalization time. Model performance is tracked via the golden test set benchmark.

### LLM client

The LLM client is an abstraction with three capabilities:
- **Extract**: Given raw HTML + metadata, return a normalized element (or an array if multi-element split was detected)
- **Match**: Given two lists of element summaries, return matching pairs with confidence scores
- **Normalize vocabulary**: Given sets of mechanic and skill terms, return synonym clusters with canonical names

The transport mechanism is a direct HTTP API call. No CLI process spawning, no markdown conversion. Output is requested in structured JSON format.

### Golden test set

A committed golden test set serves as ground truth for:
1. **Model comparison**: Benchmark any LLM against hand-verified expected outputs
2. **Regression detection**: Changes to the system prompt are measured against the golden set
3. **Quality gate**: Full normalization runs log per-field accuracy against the benchmark
4. **Atomicity verification**: Multi-element page entries verify that splits produce correct atomic children. Show format entries verify that complex formats are not incorrectly split.

The golden set covers at minimum:

- Well-structured game with variations and tips (improwiki)
- Short exercise with minimal content
- **Complex show format** with multi-phase structure — must not be split (e.g., "Deconstruction" or "Harold")
- German content
- Concept/theory page (null howToPlay)
- Page with explicit `<a>` cross-references to known wiki pages
- **Multi-element page** (splits into 3+ atomic child elements — parent + children)
- Child element split from a multi-element page (atomic, with `splitFrom`)
- German multi-element page + child
- Audience ask-for prompt (null howToPlay, minimal content)
- Musical form
- Handle overlay
- Empty or near-empty HTML content
- ircwiki content (MediaWiki HTML conventions)
- learnimprov content (WordPress block editor conventions)
- **Vocabulary clustering**: A set of extracted mechanic and skill terms with expected synonym clusters (e.g., `["freeze", "freeze signal", "stop signal"]` → canonical `"freeze signal"`)

Minimum 22 entries (counting each multi-element child as a separate entry), with at least 2 in German and at least 2 from each source. Every entry's `expectedOutput` must itself satisfy the atomicity invariant. The golden set includes at least one entry where splitting **must** occur (multi-element page with parent + 2+ children) and at least one entry where splitting **must not** occur (show format).

## Consequences

### Enables
- Structured graph derivation without re-processing raw content
- Multi-element page decomposition — no lost games hidden inside category pages
- Resolvable cross-references directly from `<a>` link targets in raw HTML
- Workshop planner data (difficulty, duration, energy, group size) extracted once
- Global mechanic and skill vocabularies built from per-element extraction
- Confidence-scored cross-source merge hints
- Incremental re-normalization via content hash caching
- Model-agnostic quality measurement via golden set benchmark
- Every element is atomic — the graph layer never encounters an element that describes multiple games

### What this eliminates
- **TurndownService dependency** — no HTML-to-markdown conversion step
- **Deterministic pre-processing** — no heuristic multi-element detection, no link extraction code
- **Semantic post-validation** — the LLM owns content quality; no hallucination-rejection code
- **Per-element CLI spawn** — direct HTTP API calls with no process-startup overhead
- **Batch array parsing complexity** — Stage 1 processes elements individually

### Risks
- **LLM fails to split a multi-element page**: Some pages may remain non-atomic. Mitigation: the golden set benchmark measures split accuracy; failed splits are visible as non-atomic elements in the output.
- **LLM over-splits a show format**: A format with many phases may be incorrectly split into sub-elements. Mitigation: the system prompt explicitly instructs that show formats are atomic; the golden set includes a show format entry to verify this.
- **Mechanic and skill naming inconsistency in extraction**: The same mechanic may be called "freeze" in one element and "stop signal" in another, or "Einfrieren" in a German element and "freeze" in an English one. Mitigation: Stage 3 vocabulary normalization clusters synonyms and writes canonical terms back into all elements, so Layer 2 receives consistent terminology.
- **Cross-reference resolution errors**: The LLM may resolve a `<a>` link to the wrong child element or fail to resolve a valid link. Mitigation: unresolvable references remain as name-only entries; the graph layer can attempt resolution with its own element catalog.
- **API rate limiting**: With 1355 concurrent calls, the API may throttle. Mitigation: limit concurrency to a configurable level (default 20); back off and retry on 429 responses.
- **Vocabulary mis-clustering**: The LLM may incorrectly merge distinct mechanics (e.g., "freeze" as a performance mechanic vs "freeze" as a trust exercise) or fail to merge true synonyms. Mitigation: the vocabulary output is diffable and reviewable; human QA (Layer 2.5) can correct mis-clustered terms; canonical name substitution is reversible via the `originalName` field.
- **System prompt token cost**: If the API does not cache identical system prompts, few-shot examples are repeated per call (~1355 times). Mitigation: keep examples concise (1-2); measure token cost per full normalization run and adjust if excessive.

### Deferred to Layer 2 (Knowledge Graph)
- Concept type vocabulary normalization (e.g., "handle" → "ask-for", "Vorgabe" → "ask-for") — these are tag taxonomy concepts, not mechanics or skills
- Tag taxonomy derivation (grouping 111 flat tags into categories)
- Edge computation from normalized fields (variantOf, trainsSkill, hasMechanic, similarTo, prerequisiteFor)
- Final cross-source merge decisions (graph layer applies its own confidence threshold to relatedIdentifiers)
- Human QA override integration

### Rejected alternatives
- **HTML-to-markdown conversion (Turndown)**: Strips link targets, heading semantics, and list structure. Requires additional code to recover lost information (link annotation, heading detection). Rejected in favor of feeding raw HTML to the LLM — the 13-87% size overhead is worth the information preservation, and it eliminates an entire dependency and processing stage.
- **Deterministic multi-element page detection**: Heuristic approaches (char-count thresholds, heading counting, list detection) are fragile across sources with different HTML conventions. The LLM understands content semantics and makes better splitting decisions. Rejected.
- **Batched extraction in Stage 1**: Batching 20-30 elements per API call adds array parsing complexity, batch retry logic, and conflicts with per-element change detection. With direct HTTP API (~100ms latency) and high concurrency, per-element throughput matches batched throughput while being simpler and more robust. Rejected for Stage 1; retained for Stage 2 where semantic comparison requires the LLM to see many elements simultaneously.
- **Semantic post-validation (hallucination checks, null howToPlay audits)**: Adds code complexity for checks that the golden set benchmark already measures. Can reject correct-but-paraphrased references. Rejected — LLM quality is guided by the system prompt and measured by the benchmark.
- **Deferring mechanics/skills to Layer 2**: Would require a second LLM pass over the same content, doubling total LLM cost. The marginal cost of extracting mechanics and skills at normalization time is negligible. Rejected.
- **Pre-defining a controlled vocabulary for extraction**: The LLM could be told to use only pre-approved mechanic names during Stage 1, eliminating the need for post-hoc vocabulary normalization. Rejected because the vocabulary is emergent — new mechanic names appear as elements are processed. Pre-defining would require knowing all terms before extraction, which is impossible. Post-hoc clustering (Stage 3) handles the emergent vocabulary naturally.
- **Vocabulary normalization inside Stage 1 extraction**: The LLM cannot know the full set of terms while processing individual elements — it lacks cross-element context. Rejected in favor of a separate Stage 3 that sees the complete term inventory.
