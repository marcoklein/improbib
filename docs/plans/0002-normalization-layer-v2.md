# Plan 0002: Normalization Layer v2

Rebuild the normalization layer from scratch per [ADR-0008](../adrs/0008-normalization-layer.md). Do not preserve backward compatibility — the existing `output/normalized/` directory and `src/normalize/` implementation are the starting point for reference only.

## What Changes

| Area | Before | After |
|------|--------|-------|
| Multi-element pages | Treated as one element — 13 games in "Fangenspiele" become one blob | Split before LLM extraction — each game is its own element |
| Internal links | Stripped by Turndown — LLM never sees them | Extracted as `linkedPages[]` annotation before markdown conversion |
| LLM calls | One per element (1355 calls) | Batched: 20-30 elements per call (~50 calls) |
| Prompt | Zero-shot, minimal | Few-shot with 2-3 golden set examples per batch |
| howToPlay | Free text string | Structured `{steps: [{action, role?, constraint?}]}` |
| Tips | Flat `string[]` | Structured `{text, category}[]` |
| referencedElements | Bare `string[]` names | Structured `{name, identifier?, confidence?}[]` |
| Mechanics & skills | Not extracted (deferred to Layer 2) | Extracted at normalization time |
| Practical metadata | Not extracted | difficulty, duration, energy, groupSize, suitableFor extracted |
| Cross-source matching | Pure Jaccard ≥ 0.8 | Jaccard ≥ 0.5 pre-filter + LLM confirmation |
| Post-validation | Zod structure only | Zod + semantic checks (hallucination detection, null howToPlay audit) |
| Derived element threshold | Arbitrary >40 char description | LLM decides — all named variations extracted; the LLM determines which are distinct playable variants |
| Golden test set | 15 elements | 20+ elements covering multi-element pages, cross-refs, mechanics-heavy games |

## Task Breakdown

### T1: Define the new schema (`src/normalize/normalized-schema.ts`)

Replace the existing schema with the full structure from ADR-0008. Key differences:
- `howToPlay` changes from `string | null` to `{steps: [...], mechanics?: [...], skills?: [...]} | null`
- `tips` changes from `string[]` to `{text: string, category: TipCategory}[]`
- `referencedElements` changes from `string[]` to `{name: string, identifier?: string, confidence?: number}[]`
- Add `mechanics: {name: string, category?: MechanicCategory}[]`
- Add `skills: {name: string, category?: SkillCategory}[]`
- Add `practical: {difficulty?, typicalDurationMinutes?, energyLevel?, groupSize?, requiresPreparation?, suitableFor?}`
- Add `splitFrom?: string`
- Add meta fields `splitElementCount`

Zod schemas:
```typescript
const TipCategory = z.enum(["pedagogical", "staging", "safety", "group-dynamic", "failure-mode", "general"]);
const MechanicCategory = z.enum(["constraint", "signal", "role", "structure", "interaction"]);
const SkillCategory = z.enum(["social", "physical", "cognitive", "narrative", "vocal"]);
const Difficulty = z.enum(["beginner", "intermediate", "advanced"]);
const EnergyLevel = z.enum(["low", "medium", "high"]);
const SuitableFor = z.enum(["warmup", "exercise", "performance", "encore", "workshop"]);
```

**Deliverable**: Updated `src/normalize/normalized-schema.ts` with full Zod schemas and TypeScript types.

### T2: Build pre-processing module (`src/normalize/preprocess.ts`)

Two responsibilities:

**2a. Multi-element page detection**

Function `splitMultiElementPages(elements: RawElement[]): {elements: RawElement[], splits: {parentId: string, childIds: string[]}[]}`

Algorithm:
1. For each raw element, extract all `<h2>` sections (or source-specific heading conventions: learnimprov uses `<p class="wp-block-paragraph"><strong>` as pseudo-headings)
2. For each section, evaluate: body > 200 chars AND (contains `<ol>`/`<ul>` OR contains player references OR contains imperative patterns)
3. If ≥2 sections qualify → split
4. Each section becomes a new element: identifier = MD5(parentId + sectionHeadingSlug), name = heading text, `splitFrom = parentId`, inherits parent's url/sourceName/languageCode/tags
5. Parent element remains, treated as index/summary
6. Return the expanded element set with split tracking

**2b. Link preservation**

Function `extractLinks(html: string): {markdown: string, linkedPages: string[]}`

Algorithm:
1. Parse HTML, extract all `<a href="...">` elements where href matches a wiki-internal pattern
2. Collect the link text (inner text of `<a>`) into `linkedPages: string[]`
3. Append `[Linked pages: page1, page2, ...]` as a special annotation in the markdown passed to the LLM

**Deliverable**: `src/normalize/preprocess.ts` with both functions and tests.

### T3: Rewrite LLM client (`src/normalize/llm-client.ts`)

**3a. Batch interface**

Replace `normalizeElement(name, html, lang) -> GoldenOutput` with:
```typescript
interface LlmClient {
  extractBatch(elements: ExtractionInput[]): Promise<ExtractionResult[]>;
}
```

Where `ExtractionInput = {id, name, languageCode, markdown, linkedPages, tags}` and `ExtractionResult = {id, output: GoldenOutput | null, error?: string}`.

**3b. Batch prompt builder**

Function `buildBatchPrompt(elements: ExtractionInput[], goldenExamples: GoldenExample[]): string`

Constructs a prompt with:
- System instruction for the extraction task (target schema, rules for null howToPlay, language respect)
- 2-3 few-shot examples selected from the golden set (match language and content type to the batch)
- All elements in the batch, each with ID, name, language, linkedPages, and markdown content
- JSON array boundary marker: "Return a JSON array with one object per element, matching element order"

**3c. Response parser**

Function `parseBatchResponse(text: string, elementCount: number): ExtractionResult[]`

Handles:
- Markdown code fences
- Leading/trailing text noise
- Partial output (LLM stopped mid-array)
- Missing elements (fill with error result)
- Extra elements (truncate)

**3d. Model configuration**

Keep the existing CLI spawn mechanism (`opencode run`). Add support for configuring model, timeout, and batch size via constructor options.

**Deliverable**: `src/normalize/llm-client.ts` rewritten with batch interface.

### T4: Build post-validation module (`src/normalize/post-validate.ts`)

Function `validateExtraction(element: NormalizedElement): {valid: boolean, flags: ValidationFlag[]}`

Checks:

| # | Check | Condition | Flag on failure |
|---|-------|-----------|-----------------|
| 1 | Reference existence | Each `referencedElements[].name` substring-appears in `htmlContent` (case-insensitive, ≥80% fuzzy match) | `REFERENCE_NOT_IN_SOURCE` |
| 2 | Variation existence | Each `variations[].name` substring-appears in `htmlContent` | `VARIATION_NOT_IN_SOURCE` |
| 3 | Null howToPlay audit | `howToPlay === null` → must not have game tags (`game`, `exercise`, `warmup`) | `NULL_HOWTOPLAY_FOR_GAME` |
| 4 | Description length | `description.length >= 20` | `DESCRIPTION_TOO_SHORT` |
| 5 | Step count | If `howToPlay !== null` → `steps.length >= 1` | `NO_STEPS` |
| 6 | Mechanic vocabulary | Each `mechanics[].name` is recorded against a global vocabulary (accumulated across runs) | Non-blocking; builds vocabulary |

Flagged elements are still included in output with an added `_validationFlags: string[]` field.

**Deliverable**: `src/normalize/post-validate.ts` with tests.

### T5: Rewrite cross-source matching (`src/normalize/cross-source-matching.ts`)

**5a. Pre-filter**

Keep the existing `normalizeForMatch` and `tokenOverlap` functions but lower the threshold from 0.8 to 0.5. This casts a wider net — precision is recovered in the LLM confirmation step.

**5b. LLM confirmation**

Function `confirmMatchesWithLlm(pairs: MatchPair[], client: LlmClient): Promise<ConfirmedMatch[]>`

For each batch of candidate pairs, asks the LLM: "Are these the same improv game/exercise?" with both names and source information. Returns `{match: boolean, confidence: number}`.

**5c. Integration**

`buildRelatedIdentifiers` now uses confirmed matches (confidence ≥ 0.7) to populate `relatedIdentifiers`.

**Deliverable**: `src/normalize/cross-source-matching.ts` updated.

### T6: Rewrite pipeline orchestrator (`src/normalize/normalize.ts`)

Rewrite `normalizeAll()` and `normalizeSource()` to implement the four-stage pipeline:

```
normalizeSource(sourceName):
  1. Load raw elements
  2. Pre-process: split multi-element pages, preserve links
  3. Load previous normalized output (for change detection)
  4. Create batches of 20-30 changed/new elements
  5. For each batch:
     a. Build few-shot prompt
     b. Call LLM
     c. Parse response
     d. Post-validate each element
  6. Merge cached (unchanged) elements with new extractions
  7. Write output

normalizeAll():
  1. normalizeSource for each of 3 sources
  2. Run cross-source matching (pre-filter + LLM confirm)
  3. Write back relatedIdentifiers to each source file
```

**Deliverable**: `src/normalize/normalize.ts` rewritten.

### T7: Expand golden test set (`src/normalize/__testdata__/golden-set.ts`)

Add entries to cover gaps. Minimum additions:

| # | ID | Category | Source | Why |
|---|----|----------|--------|-----|
| 16 | `tag-games-overview` | multi-element-parent | improwiki | Parent index page for Tag Games |
| 17 | `alphabet-tag` | multi-element-child | improwiki | Child split from Tag Games |
| 18 | `chain-tag` | multi-element-child | improwiki | Child split from Tag Games |
| 19 | `fuehrungsuebungen` | multi-element-de | improwiki | German multi-element: Führungsübungen |
| 20 | `fuehren-am-finger` | multi-element-child-de | improwiki | German child: Führen am Finger |
| 21 | `gefuehlspunkte-ref` | cross-reference | improwiki | Explicit cross-reference to Gefühlsquadrat |
| 22 | `what-are-you-doing` | mechanics-heavy | ircwiki | Game with clear mechanic patterns |

Update `expectedOutput` on existing entries to match the new schema (structured howToPlay steps, categorized tips, mechanic arrays where obvious).

**Deliverable**: Updated `golden-set.ts` with 22+ entries conforming to the new schema.

### T8: Update benchmark runner (`src/normalize/__testdata__/run-benchmark.ts`)

- Adapt to new schema fields (structured howToPlay, categorized tips, etc.)
- Update scoring functions for new fields:
  - `scoreSteps(expected, actual)` — checks if expected mechanics are present in extracted steps
  - `scoreTips(expected, actual)` — checks both text presence AND category correctness
  - `scoreMechanics(expected, actual)` — recall/precision on mechanic names
  - `scoreSkills(expected, actual)` — recall/precision on skill names
  - `scorePractical(expected, actual)` — exact/range match on difficulty, energy, groupSize
- Report per-field metrics in addition to overall score

**Deliverable**: Updated `run-benchmark.ts`.

### T9: Update tests (`src/normalize/__testdata__/`)

Write new tests:
- `preprocess.test.ts`: Multi-element split correctness, link extraction
- `post-validate.test.ts`: Reference hallucination detection, variation hallucination detection, null howToPlay audit
- `cross-source-matching.test.ts`: Updated for new threshold
- `normalize-pipeline.test.ts`: Integration test of the full pipeline on a small fixture

Remove or skip tests that reference removed APIs.

**Deliverable**: Updated test suite.

### T10: Update library entry and server

- `src/index.ts`: Update `Impropib.normalizeAll()` to use new pipeline
- `src/serve.ts`: Update progress tracking and API endpoints for new pipeline

### T11: Remove old artifacts

- Delete `output/normalized/` contents (will be regenerated)
- Remove any dead code paths referencing old single-element extraction
- Update `AGENTS.md` if commands change

## Execution Order

```
T1 (schema) ──► T7 (golden set) ──► T8 (benchmark)
     │
     ├──► T2 (preprocess)
     │
     ├──► T3 (LLM client)
     │
     ├──► T4 (post-validate)
     │
     ├──► T5 (cross-source)
     │
     └──► T6 (pipeline) ──► T10 (index/server) ──► T11 (cleanup)
                                    │
                              T9 (tests) ──────────┘
```

T1-T5 can be done in parallel since they're independent modules. T6 depends on T1-T5. T7-T8 can start once T1 is stable. T9 can run alongside everything. T10-T11 are cleanup.

## Verification

After all tasks are complete:
1. `bun test` — all tests pass
2. `bun run src/analyze.ts` — runs without errors
3. Golden set benchmark produces metrics for description, howToPlay, variations, tips, references, mechanics, skills, and practical fields
4. A full normalization run completes in < 10 minutes (down from ~45 minutes)
5. Multi-element pages produce split sub-elements in `output/normalized/improwiki.json`
6. Cross-source matching produces `relatedIdentifiers` with LLM-confirmed matches
