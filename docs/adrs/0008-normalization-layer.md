# ADR-0008: Content Normalization Layer

- **Date**: 2026-06-03
- **Status**: accepted
- **Source**: cross-cutting

## Context

Raw scraped content is unstructured HTML. A single improwiki page may contain a game description, inline variations, tips, pedagogical notes, and cross-references — all as flat markup. Feeding this directly into knowledge graph derivation (Layer 2) produces unreliable extraction. We need a structured intermediate representation.

## Decision

### Two-step extraction

1. **Golden test set** — 15 hand-verified elements with expected outputs serve as the ground truth for model comparison. This is committed to the repo (`src/normalize/__testdata__/golden-set.ts`) and can benchmark any model.

2. **LLM extraction pipeline** (`src/normalize/normalize.ts`) — For each raw element, convert HTML to markdown (Turndown), send to an LLM with a structured extraction prompt, validate against a Zod schema, and write per-source output to `output/normalized/{source}.json`.

### Model selection

We benchmarked `opencode-go/deepseek-v4-flash` against `opencode-go/deepseek-v4-pro` using the golden test set. Results with OpenCode 1.15.5:

| Metric | Pro | Flash |
|--------|-----|-------|
| Descriptions | 100% | 100% |
| howToPlay | 100% | 100% |
| Variation recall | 93% | 100% |
| Tip recall | 71% | 51% |
| Reference recall | 93% | 93% |
| **Overall** | **93%** | **91%** |

Both models are viable. Flash is faster (~80s vs ~190s for 15 elements) and free on the OpenCode Go plan. We default to flash for normalization but keep pro as a reference for benchmarking. The benchmark script supports adding new models trivially (one line in the MODELS array).

### LLM client architecture

The LLM client (`src/normalize/llm-client.ts`) shells out to `opencode run` via `Bun.spawn`. This was chosen over:
- **Direct HTTP API**: The OpenCode Go API endpoint is not a standard OpenAI-compatible chat completions endpoint; it routes through opencode's internal gateway. Direct HTTP calls returned "Not Found" on all tested URL patterns.
- **OpenCode SDK**: Requires an additional npm dependency and runs a full opencode server process. Overhead not justified for batch extraction.

The CLI approach uses the existing `~/.local/share/opencode/auth.json`, needs no extra authentication setup, and is the same mechanism powering the opencode TUI.

### Output format

Each source produces `output/normalized/{source}.json` with the schema defined in `src/normalize/normalized-schema.ts`:

```typescript
{
  meta: { sourceName, elementCount, derivedElementCount, normalizedAt },
  elements: [{
    // ... raw fields preserved verbatim (identifier, name, url, tags, htmlContent, etc.)
    normalized: {
      description: string,          // 1-3 sentences
      howToPlay: string | null,     // null for concepts only
      variations: { name, description }[],
      tips: string[],
      referencedElements: string[],
      contentHash: string,          // md5 of htmlContent for change detection
      extractedAt: string,          // ISO timestamp
    },
    derivedElements: [{ name, description, parentIdentifier }], // from inline variations
  }]
}
```

### Change detection

Each normalized element stores `contentHash = md5(htmlContent)`. On re-normalization, elements whose hash matches the previous run are preserved unchanged. Only changed or new elements trigger an LLM call.

### Derived sub-elements

Inline variations with descriptions > 40 chars are promoted to `derivedElements`. These are candidate sub-elements that lack dedicated source pages. They are clearly marked to distinguish them from scraped elements. Human QA (Layer 2.5) can accept or reject them.

### Cross-source deduplication

**Deferred.** Deduplicating elements across sources (e.g., "Freeze Tag" appearing on both improwiki and learnimprov) requires fuzzy name matching and LLM confirmation. This is a graph-layer concern (Layer 2). The normalization layer keeps per-source output and adds `referencedElements` cross-references.

## Consequences

### Enables
- Reliable structured extraction for graph derivation (Layer 2)
- Model-agnostic benchmarking via the golden test set
- Incremental updates (content hash caching)
- Derived sub-element discovery from inline variations

### Risks
- CLI-based LLM client adds ~2s per element (startup overhead). With 1355 elements, a full normalization pass takes ~45 minutes. This is acceptable for a batch process.
- Flash model has lower tip recall (51%) — this is a prompt engineering issue, not a model capability gap. The benchmark provides a feedback loop for prompt iteration.
- No cross-source deduplication in this layer — graph layer must handle it.
