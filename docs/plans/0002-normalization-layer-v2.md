# Plan 0002: Normalization Layer v2

Rebuild the normalization layer per [ADR-0008](../adrs/0008-normalization-layer.md). Do not preserve backward compatibility.

## Design Summary

- **Raw HTML → LLM** directly. No TurndownService, no markdown conversion.
- **Per-element API calls** in Stage 1. High concurrency, no batch array parsing.
- **Shared system prompt** with few-shot examples. Identical across all calls.
- **LLM detects multi-element pages** from HTML structure. No deterministic heuristics.
- **LLM resolves `<a>` links** to cross-references. No link extraction pre-processor.
- **No semantic post-validation**. Zod structural checks only. Benchmark measures quality.
- **Stage 2 batched**: Cross-source matching requires the LLM to compare many elements. Translation links seeded as pre-matched.
- **Stage 3 batched**: Vocabulary normalization clusters synonym mechanics and skills across all sources.

## What Changes

| Area | Before | After |
|------|--------|-------|
| HTML processing | Turndown → markdown | Raw HTML → LLM directly |
| Multi-element pages | Treated as one blob | LLM splits into atomic children |
| Internal `<a>` links | Stripped by markdown | LLM resolves from href targets |
| LLM calls (Stage 1) | Batched 20-30 | Per-element, highly concurrent |
| Few-shot | Inline per batch prompt | Shared system prompt, 1-2 examples |
| howToPlay | Free text string | Structured `{steps: [{action, role?, constraint?}]}` |
| Tips | Flat `string[]` | Structured `{text, category}[]` |
| referencedElements | Bare `string[]` names | Structured `{name, identifier?, confidence?}[]` |
| Mechanics & skills | Not extracted | Extracted per element |
| Practical metadata | Not extracted | difficulty, duration, energy, groupSize, suitableFor |
| Cross-source matching | Jaccard ≥ 0.8 deterministic | LLM batched comparison + translation link seeding |
| relatedIdentifiers | `string[]` flat | `{identifier, confidence}[]` |
| Post-validation | Zod + semantic checks | Zod structural only |
| Derived element threshold | >40 char description | LLM decides which variations are distinct, playable variants |
| Golden test set | 15 elements | 20+ including multi-element splits and show formats |

## Task Breakdown

### T1: Update the Zod schema (`src/normalize/normalized-schema.ts`)

Replace the existing schema with the full structure from ADR-0008.

Key changes from current:
- `howToPlay` becomes `null | {steps: {action: string, role?: string, constraint?: string}[]}`
- `tips` becomes `{text: string, category: TipCategory}[]`
- `referencedElements` becomes `{name: string, identifier?: string, confidence?: number}[]`
- Add `mechanics: {name: string, originalName?: string, category?: MechanicCategory}[]`
- Add `skills: {name: string, originalName?: string, category?: SkillCategory}[]`
- Add `practical: {difficulty?, typicalDurationMinutes?, energyLevel?, groupSize?, requiresPreparation?, suitableFor?}`
- `splitFrom` remains `string(32) | undefined`
- `contentHash` and `extractedAt` remain in `normalized`
- `derivedElements` unchanged
- `relatedIdentifiers` becomes `{identifier: string(32), confidence: number}[]`

Add `splitElementCount` to the source-level meta.

Zod enums:
```typescript
const TipCategory = z.enum(["pedagogical", "staging", "safety", "group-dynamic", "failure-mode", "general"]);
const MechanicCategory = z.enum(["constraint", "signal", "role", "structure", "interaction"]);
const SkillCategory = z.enum(["social", "physical", "cognitive", "narrative", "vocal"]);
const Difficulty = z.enum(["beginner", "intermediate", "advanced"]);
const EnergyLevel = z.enum(["low", "medium", "high"]);
const SuitableFor = z.enum(["warmup", "exercise", "performance", "encore", "workshop"]);
```

**Deliverable**: Updated `normalized-schema.ts` with full schemas and TypeScript types.

### T2: Rewrite LLM client (`src/normalize/llm-client.ts`)

The existing client already uses direct HTTP API calls. Adapt it for the new schema. Define the full client interface with all three capabilities needed by the pipeline:

```typescript
interface LlmClient {
  normalizeElement(input: ExtractionInput): Promise<NormalizedElement | NormalizedElement[]>;
  findCrossSourceMatches(sourceA: MatchCandidate[], sourceB: MatchCandidate[]): Promise<ConfirmedMatch[]>;
  normalizeVocabulary(terms: {mechanics: string[], skills: string[]}): Promise<VocabularyMap>;
}
```

**2a. Remove Turndown**

Delete the `turndown` import and usage. Pass raw `htmlContent` directly in the prompt.

**2b. Build system prompt**

Function `buildSystemPrompt(): string`

Contains:
- Extraction instructions (target schema fields, language rules)
- Atomicity rules (multi-element splitting, parent index behavior, show format handling, cross-reference resolution from `<a>` tags)
- 1-2 concise few-shot examples from the golden set showing correct output structure

The same system prompt string is used for every call.

**2c. Build per-element user prompt**

Function `buildUserPrompt(element: RawElement): string`

Template:
```
Name: {name}
Language: {languageCode}
Tags: {tags.join(", ")}
Content:
{htmlContent}
```

**2d. Update API call**

Use the existing `callApi` function (or its equivalent) but with:
- The shared `buildSystemPrompt()` as the `system` message
- `buildUserPrompt(element)` as the `user` message
- `response_format: { type: "json_object" }` for structured output
- `max_tokens` adjusted upward (the new schema is larger than the old one)
- `temperature: 0` for deterministic output

**2e. Parse response to new schema**

Function `parseOutput(text: string): NormalizedElement | NormalizedElement[]`

Handle the new structured fields (steps, mechanics, skills, practical). Parse JSON. Apply defaults for missing optional fields. Handle the multi-element case where the LLM returns an array.

**Deliverable**: Rewritten `llm-client.ts` — no Turndown, raw HTML in, structured JSON out.

### T3: Rewrite pipeline orchestrator (`src/normalize/normalize.ts`)

**3a. Per-element with concurrency**

Rewrite `normalizeSource()`:
```
normalizeSource(sourceName):
  1. Load raw elements
  2. Load previous normalized output (Map<identifier, NormalizedElement>)
  3. Filter to changed elements (contentHash mismatch or new)
  4. Create a concurrency-limited queue (default 20)
  5. For each changed element:
     a. Call client.normalizeElement(name, htmlContent, languageCode, tags)
     b. If response is array (multi-element split):
        - Add parent + all children to output
        - Update meta.splitElementCount
     c. If response is single element: add to output
  6. Merge cached elements with new extractions
  7. Zod validate every element
  8. Write output
```

**3b. Progress tracking**

Update `NormalizeProgress` to report:
- `total`: raw elements loaded
- `processed`: elements where an API call was made
- `cached`: elements reused from previous run
- `split`: count of child elements created from splits
- `errors`: count of failed API calls or invalid elements

**3c. Retry logic**

On API call failure (network error, 429, 5xx, malformed JSON):
- Retry up to 3 times with exponential backoff
- On persistent failure: log error, skip element, preserve previous normalized version if available

**3d. Full pipeline: normalizeAll()**

```
normalizeAll():
  1. For each source (improwiki, learnimprov, ircwiki):
     a. normalizeSource(source) — Stage 1 + Zod validation
     b. Log progress, token usage, errors
  2. Load all normalized elements from disk
  3. Seed translation-link pairs (translationLinkEnIdentifier ↔ translationLinkDeIdentifier) as pre-matched with confidence 1.0
  4. For each source pair (A↔B, A↔C, B↔C):
     a. Group remaining elements into batches (100-200 per source)
     b. For each batch: client.findCrossSourceMatches(batchA, batchB)
     c. Merge results, apply confidence threshold (default 0.7)
  5. Write updated relatedIdentifiers back to each source file
  6. Collect all unique mechanic and skill names across all elements
  7. If term sets are manageable: client.normalizeVocabulary(allTerms) in one call
     If too large: split by category (mechanics call + skills call), or alphabetically chunk
  8. Write output/vocabulary.json
  9. applyCanonicalTerms() — replace name with canonical, set originalName
  10. Rewrite source files with canonicalized terms
  11. Log cumulative token usage and wall time for the full run
```

**Deliverable**: Rewritten `normalize.ts` with per-element concurrency and full three-stage pipeline.

### T4: Rewrite cross-source matching (`src/normalize/cross-source-matching.ts`)

Replace the Jaccard-only approach with LLM-driven batched comparison.

**4a. Seed translation-link pairs**

Before LLM comparison, pre-match elements linked by scraped translation links:
- For each element with `translationLinkEnIdentifier` set, create a pair with the EN element identified by that identifier
- For each element with `translationLinkDeIdentifier` set, create a pair with the DE element
- All seeded pairs get `confidence: 1.0` — these are hard evidence, not LLM inference
- Exclude seeded pairs from the LLM comparison batches

**4b. Batch construction**

Function `buildMatchBatches(elements: {identifier, name, description, sourceName}[]): MatchBatch[]`

Groups elements from different sources into batches of 100-200 per source. Each batch contains two lists (source A, source B). All source pairs are covered (improwiki↔learnimprov, improwiki↔ircwiki, learnimprov↔ircwiki). Elements already matched via translation links are excluded.

**4c. Match prompt**

Function `buildMatchPrompt(listA: MatchCandidate[], listB: MatchCandidate[]): string`

Lists element names + descriptions from both sources. Asks LLM to return all matching pairs with confidence scores.

**4d. Build relatedIdentifiers**

Use LLM-confirmed matches (confidence ≥ 0.7 default threshold) combined with translation-link seed pairs (confidence 1.0) to populate `relatedIdentifiers`. Write back to each source file.

**Deliverable**: Updated `cross-source-matching.ts` with LLM-driven matching.

### T5: Build vocabulary normalization (`src/normalize/vocabulary.ts`)

New module implementing Stage 3 from ADR-0008.

**5a. Collect terms**

Function `collectTerms(elements: NormalizedElement[]): {mechanics: string[], skills: string[]}`

Aggregates all unique `mechanics[].name` and `skills[].name` values across all normalized elements from all sources.

**5b. Normalize with LLM**

Function `normalizeVocabulary(client: LlmClient, terms: {mechanics: string[], skills: string[]}): Promise<VocabularyMap>`

Sends the term sets to the LLM. If the combined set fits in a single call (typical: ~100-200 unique terms), use one call. If too large, split by category (mechanics call + skills call) or alphabetically chunk. The LLM returns clusters of synonyms with canonical names. Prompt includes examples of expected clustering from the golden set.

**5c. Output vocabulary file**

Function `writeVocabulary(vocab: VocabularyMap): Promise<void>`

Writes `output/vocabulary.json` in the format:
```json
{
  "mechanics": [{"canonical": "freeze signal", "variants": ["freeze", "stop signal", "einfrieren"]}],
  "skills": [{"canonical": "active listening", "variants": ["listening", "zuhören"]}]
}
```

**5d. Optional write-back**

Function `applyCanonicalTerms(elements: NormalizedElement[], vocab: VocabularyMap): NormalizedElement[]`

Replaces each element's `mechanics[].name` and `skills[].name` with the canonical form. Preserves the original term in `mechanics[].originalName` and `skills[].originalName`. Does not change `contentHash`.

**5e. Integration**

`normalizeAll()` calls vocabulary normalization after all sources are processed and cross-source matching is complete. Write-back is enabled by default.

**Deliverable**: `src/normalize/vocabulary.ts` with tests.

### T6: Expand golden test set (`src/normalize/__testdata__/golden-set.ts`)

Add entries to cover gaps. Minimum new entries:

| # | ID | Category | Source | Why |
|---|----|----------|--------|-----|
| 16 | `tag-games-index` | multi-element-parent | improwiki | Parent index: Fangenspiele/Tag Games |
| 17 | `alphabet-tag` | multi-element-child | improwiki | Child split from Tag Games (atomic game) |
| 18 | `chain-tag` | multi-element-child | improwiki | Child split from Tag Games (atomic game) |
| 19 | `fuehrungsuebungen-index` | multi-element-parent-de | improwiki | German parent: Führungsübungen |
| 20 | `roboter` | multi-element-child-de | improwiki | German child: Roboter (atomic exercise) |
| 21 | `deconstruction` | show-format | ircwiki | Complex show format — must NOT be split |
| 22 | `gefuehlspunkte-ref` | cross-reference | improwiki | Has explicit `<a>` cross-ref to Gefühlsquadrat |

Add vocabulary test data to the golden set:
- A `vocabulary` category entry with `input: {mechanics: ["freeze", "freeze signal", "stop signal", "tap out"], skills: ["listening", "active listening", "zuhören"]}` and `expectedOutput` with canonical clusters.

Update `expectedOutput` on existing entries to match new schema:
- Structured howToPlay steps (break existing free-text into step objects)
- Categorized tips (add category to each)
- Add empty `mechanics`, `skills`, `practical` arrays where fields aren't obvious

Show format entry (`deconstruction`): expectedOutput must have non-null howToPlay (it's a format, not a concept) and explicit steps describing the phases. This teaches the LLM not to split show formats.

**Deliverable**: 22+ golden entries conforming to new schema, plus vocabulary clustering test data.

### T7: Update benchmark runner (`src/normalize/__testdata__/run-benchmark.ts`)

- Pass raw HTML (not markdown) to the model
- Update scoring for new fields:
  - `scoreSteps(expected, actual)`: check step count, action presence
  - `scoreTips(expected, actual)`: text recall + category correctness
  - `scoreMechanics(expected, actual)`: recall/precision on mechanic names
  - `scoreSkills(expected, actual)`: recall/precision on skill names
  - `scorePractical(expected, actual)`: exact match on difficulty/energy, range match on duration/groupSize
  - `scoreSplit(expected, actual)`: for multi-element entries, verify children were created and parent has null howToPlay
  - `scoreNoSplit(expected, actual)`: for show format entries, verify element was NOT split
  - `scoreVocabulary(expected, actual)`: for vocabulary test data, verify synonym clustering matches canonical form
- Report per-field metrics + overall

**Deliverable**: Updated benchmark runner.

### T8: Tests

Write new tests:
- `normalized-schema.test.ts`: Schema validation (valid/invalid elements)
- `llm-client.test.ts`: Prompt construction, response parsing
- `cross-source-matching.test.ts`: Batch construction, match prompt format
- `vocabulary.test.ts`: Term collection, canonical term mapping, synonym clustering
- `normalize-pipeline.test.ts`: Integration test with a mock LLM client

**Deliverable**: `bun test` passes.

### T9: Update library entry and server

- `src/index.ts`: Update `Impropib.normalizeAll()` to use new pipeline
- `src/serve.ts`: Update progress tracking and API endpoints
- `AGENTS.md`: Update commands if changed

### T10: Clean up

- Delete Turndown dependency from `package.json`
- Remove any dead code paths (CLI spawn, old per-element normalize function, old Jaccard-only matching)
- Delete `output/normalized/` contents (will be regenerated)

## Execution Order

```
T1 (schema) ──► T6 (golden set) ──► T7 (benchmark)
     │
     ├──► T2 (LLM client)
     │
     ├──► T3 (pipeline) ──┐
     │                    │
     ├──► T4 (cross-source)┤
     │                    │
     └────────────────────┬──► T5 (vocabulary) ──► T9 (index/server) ──► T10 (cleanup)
                          │           │
                          └──► T8 (tests) ─────────┘
```

T1-T4 can be done in parallel. T6-T7 start once T1 is stable. T3 depends on T2. T5 depends on T3 (needs normalized elements) and T4 (needs written output files). T8 runs alongside everything. T9-T10 are final integration and cleanup.

## Verification

After all tasks:
1. `bun test` — all tests pass
2. `bun run src/analyze.ts` — runs without errors
3. Golden set benchmark: per-field metrics for all new fields
4. Full normalization: < 2 min wall time with 20 concurrent calls
5. Multi-element pages produce split children with `splitFrom` set
6. Show format pages remain as single atomic elements
7. Cross-source matching produces `relatedIdentifiers` with LLM-confirmed matches
8. Vocabulary normalization produces `output/vocabulary.json` with synonym clusters
9. Canonical terms are written back into normalized elements
10. Output validates against Zod schema with zero errors
