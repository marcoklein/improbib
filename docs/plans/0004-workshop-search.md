# Plan 0004: Workshop Search — Search-First Architecture

## Goal

Replace the naive substring theme expansion in the workshop planner with a full-text search engine that handles any user input (single word, phrase, sentence, paragraph) and produces relevant, varied workshop plans.

## Current Problem

The workshop planner fails for natural-language theme input. A query like `"saying yes"` (120 min, 12 players, beginner, no-audience, no-music) returns a broken plan: 2 warm-ups, 0 main exercises, 0 closers, 20 of 120 minutes filled. Three root causes:

### 1. Theme expansion is naive substring matching on mechanic/skill/tag labels only

`src/query/theme.ts` splits the theme into words, filters stop words, then does `labelLower.includes(word)` against 1,168 mechanic/skill/tag labels. Problems:

- **Substring false positives**: `"yes"` matches `"eyes"` — pulls in `"eyes closed"` mechanic, which connects to unrelated elements
- **Cannot find elements by name or description**: an element named `"Yes And"` with summary `"core concept of accepting offers"` only matches if a connected mechanic contains `"yes"` or `"and"` — the element's own text is never searched
- **"saying" matches nothing**: no mechanic/skill/tag label contains the word `"saying"`, so the second most important word in the query is ignored entirely

Result: only 7 mechanic/skill/tag nodes matched → 8 elements via edges (7 beginner) → plan starved for candidates.

### 2. `deriveSuitableFor` is too restrictive for missing data

`src/query/suitable-for.ts` requires `typicalDurationMinutes !== undefined` for the `warmup` and `performance` classifications. But **38% of canonical EN elements lack this field** (133 of 343). These elements can never be classified as warmup or performance — they always fall to `"exercise"`.

For the "saying yes" query, only 1 of the 7 beginner candidates qualified as warmup with 6 as exercise. The warmup fallback mechanism consumed 2 exercises from the exercise pool, leaving fewer for the main section.

### 3. No feedback to the user

The UI is a plain text input with no preview. The user types a theme, hits submit, and gets a broken plan with no indication of why. They don't know:
- What concepts the system understood from their query
- What elements it found (or didn't)
- What they could type instead to get better results

## Current Graph Statistics

```
Canonical EN elements: 343
Mechanics: 1,168   Skills: 372   Tags: 137

Elements with duration:     213 (62%)
Elements with energy:       328 (96%)
Elements with tags:         318 (93%)
Elements with summary:      341 (99%)
Avg summary length:         120 chars

Total searchable characters (labels + summaries + tags): 53,670

Difficulty: beginner=182, intermediate=132, advanced=19, unset=10
Energy:     medium=195, high=48, low=85, unset=15
buildsOn edges: 1,717
Elements with 0 mechanics: 26 (8%) — Jaccard similarity works for 92%
```

Search complexity: O(343 × query_words × avg_text_len) ≈ instant in-memory.

## Architecture Change

```
Before:
  "saying yes" → expandTheme(Skill|Mechanic|Tag labels only, substring)
                  → 4 mechanic nodes → edges → 8 elements → classify → plan

After:
  "saying yes" → searchElements(all text surfaces, word boundary)
                  → 14 elements ranked by relevance → classify → plan
                    │
                    └── matched concepts + suggestions → live preview in UI
```

`src/query/theme.ts` is **deleted**. `src/query/search.ts` replaces it.

The search function scans three surfaces per element:

| Surface | Match type | Weight |
|---|---|---|
| Element label | `/\bword\b/i` | 10 |
| Element summary | `/\bword\b/i` | 5 |
| Connected mechanic label (via edges) | `/\bword\b/i` | 4 |
| Connected skill label (via edges) | `/\bword\b/i` | 4 |
| Connected tag label (via edges) | `/\bword\b/i` | 3 |

For `"saying yes"`, the word `"yes"` matches element labels directly (e.g., `"Yes And"`, `"Yes, let's"`) and mechanic labels (e.g., `"Yes, and"`, `"yes-and"`). The word `"saying"` matches element labels (`"Country saying"`) and summaries (`"...by saying yes-yes..."`). No false positives from `"eyes"`.

## What We Build

### 1. `src/query/search.ts` — New search engine

```typescript
import { getGraphIndex } from "./graph-query";

export interface SearchResult {
  elementId: string;
  label: string;
  summary: string;
  score: number;
  difficulty?: string;
  energyLevel?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  matchedConcepts: {
    mechanics: string[];
    skills: string[];
    tags: string[];
  };
  queryWords: string[];
  suggestions: string[];
}

export interface SearchOptions {
  canonicalOnly?: boolean;   // default true
  language?: string;         // default "en"
  limit?: number;            // default 50
}

export function searchElements(query: string, options?: SearchOptions): SearchResponse;
```

**Algorithm** (deterministic, no LLM, no embeddings):

1. **Parse query**: lowercase, split on `/\s+/`, filter stop words (`a, the, is, of, in, and, to, for, with, on`). Result: `queryWords`.

2. **Empty query**: if `queryWords` is empty, return empty results and the curated suggestion list as `suggestions`.

3. **Score each element**: for each canonical EN element, compute cumulative score across all search surfaces. Track which mechanic/skill/tag node labels matched any query word.

4. **Rank**: sort elements by score descending. Return top N (default 50).

5. **Aggregate matched concepts**: collect all mechanic/skill/tag labels that any query word matched.

6. **Fallback retry**: if results < 5, remove the query word that appears in the fewest mechanic/skill/tag labels and retry. If still < 5 after retry, return partial results.

7. **Compute suggestions**: from a curated list of popular search concepts, pick the top 5 that are not already in the matched concepts set.

**Curated suggestion list** (popular, well-connected concepts in the graph — guaranteed to find elements):

```
storytelling, status, characters, rhyming, singing,
active listening, physicality, emotions, scene work, spontaneity
```

**Implementation notes**:

- Use `getGraphIndex()` to access the in-memory graph
- Pre-build a `Map<string, {mechanicLabels: string[], skillLabels: string[], tagLabels: string[]}>` for fast element-to-label lookup during scoring (avoid repeated edge traversal for each query word)
- Use `/\bword\b/i` regex for all word-boundary matching (handles punctuation boundaries: `"yes-and"` gets split by the regex engine as word boundaries on both sides of the hyphen)
- The stop word list is the same as the current `theme.ts` — consistency is intentional

**Scoring details**:

For each element `e` and each query word `w`:
```
if (/\b{w}\b/i.test(e.label))                          → e.score += 10
if (/\b{w}\b/i.test(e.summary))                         → e.score += 5
if (e.mechanicLabels.some(m => /\b{w}\b/i.test(m)))     → e.score += 4
if (e.skillLabels.some(s => /\b{w}\b/i.test(s)))        → e.score += 4
if (e.tagLabels.some(t => /\b{w}\b/i.test(t)))          → e.score += 3
```

The label that matched is tracked for the `matchedConcepts` output. If a word matches multiple mechanics on the same element, each contributes to the score independently.

---

### 2. `src/query/suitable-for.ts` — Fix missing-data classification

**Problem**: 38% of elements (133 of 343) lack `typicalDurationMinutes`. These always fall to `"exercise"`.

**Fix**: Default duration to 10 when missing. Default energy to `"medium"` when missing.

```typescript
export function deriveSuitableFor(
  difficulty?: string,
  durationMinutes?: number,
  energyLevel?: string,
): SuitableFor {
  const dur = durationMinutes ?? 10;     // most common improv exercise length
  const energy = energyLevel ?? "medium"; // safe default for improv

  if (energy === "high" && dur <= 5) {
    return "encore";
  }

  if (
    difficulty === "beginner" &&
    dur <= 10 &&
    (energy === "medium" || energy === "high")
  ) {
    return "warmup";
  }

  if (
    difficulty &&
    (difficulty === "intermediate" || difficulty === "advanced") &&
    dur >= 15
  ) {
    return "performance";
  }

  return "exercise";
}
```

The heuristic table itself is unchanged — only the inputs receive defaults.

**Impact**: elements with missing duration now flow into `warmup` and `performance` when their other attributes match. A beginner element with `energyLevel: "medium"` and no duration → was `"exercise"`, now `"warmup"`. This increases the warmup pool and prevents the exercise pool from being drained for warmup fallbacks.

---

### 3. `src/query/workshop-planner.ts` — Use search, not expandTheme

**Before** (lines 40-97): calls `expandTheme()` → gets mechanic/skill/tag nodes → finds incoming edges → builds `thematicElementIds`. Then lines 135-151 score elements by connected concept count.

**After**:

```typescript
if (constraints.theme) {
  const searchResult = searchElements(constraints.theme, {
    canonicalOnly: true,
    language: "en",
  });

  if (searchResult.results.length === 0) {
    warnings.push(`No matching concepts found for theme "${constraints.theme}"`);
    // fallback: try fewer words
    // (already handled by searchElements' internal retry, but check edge case)
  }

  thematicElementIds = new Set(searchResult.results.map(r => r.elementId));
}
```

**Changes within the planner**:

1. **Import changes**: remove `import { expandTheme } from "./theme"`, add `import { searchElements } from "./search"`
2. **Lines 40-97**: replace `expandTheme` + edge traversal + retry logic with the single `searchElements` call above
3. **Lines 135-151 (thematic scoring)**: **remove entirely** — search results are already relevance-ranked. Elements are consumed in search result order via the existing `candidates` array that was sorted by `themeScoreMap`. Replace that block with a no-op (candidates already in search order).
4. **Line 84 reference**: `idx.edgesByTo` is no longer needed for theme expansion. Keep the `getGraphIndex()` call for other uses (constraint filtering, similarity, buildsOn).

**Note on element ordering**: `queryElements()` in `graph-query.ts:189` returns elements in whatever order `idx.canonicals` provides (the order they appear in `graph.json` nodes array). After merging with `thematicElementIds` (line 109-114), the candidates are a filtered subset of `allCanonicals` results. The search sort is lost. Fix by preserving the search result order instead of filtering `allCanonicals`:

```typescript
// After search, build the candidate list in search result order:
if (thematicElementIds && thematicElementIds.size > 0) {
  const orderedCandidates: ElementResult[] = [];
  for (const searchResult of searchResult.results) {
    const matching = allCanonicals.find(el => el.id === searchResult.elementId);
    if (matching) orderedCandidates.push(matching);
  }
  candidates = orderedCandidates;
}
```

This ensures the candidates array is in search relevance order, removing the need for a separate scoring pass.

---

### 4. `src/serve.ts` — New endpoint

Add to the existing `if/else` route chain in the `fetch` handler, before the final `return new Response("Not Found", { status: 404 })`:

```typescript
if (url.pathname === "/api/search" && req.method === "POST") {
  const body = await req.json();
  const { query } = body || {};
  if (!query || typeof query !== "string") {
    return jsonResponse({ error: "Missing or invalid 'query' field" }, req, 400);
  }
  const result = searchElements(query);
  return jsonResponse(result, req);
}
```

Add 400 status support to `jsonResponse` (optional status code parameter), or inline the status in the Response constructor.

Update the workshop plan handler to use `searchElements` instead of `expandTheme`. The request/response shape for `POST /api/workshop/plan` is unchanged.

Update the import at the top of `serve.ts`:
```typescript
// Remove:
// import { expandTheme } from "./query/theme";
// Add:
import { searchElements } from "./query/search";
```

Note: `expandTheme` is only called in `workshop-planner.ts`, not in `serve.ts` directly. So `serve.ts` changes are limited to the new search endpoint. The workshop planner import change happens in `workshop-planner.ts`.

If `jsonResponse` doesn't support a status code parameter, add it:

```typescript
function jsonResponse(data: unknown, req: Request, status: number = 200): Response {
  const body = JSON.stringify(data, null, 2);
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  };

  if (req.headers.get("accept-encoding")?.includes("gzip")) {
    const compressed = gzipSync(new Uint8Array(Buffer.from(body)));
    headers["content-encoding"] = "gzip";
    return new Response(compressed, { headers, status });
  }

  return new Response(body, { headers, status });
}
```

Update existing calls to the 3-arg `jsonResponse` pattern throughout `serve.ts` if any exist. Check existing status return patterns before modifying.

---

### 5. `public/workshop.html` — New search UX

Replace the plain theme `<input>` with a search box that provides live feedback.

**Layout** (within the existing form, replacing the theme field):

```html
<div class="search-section">
  <label for="theme-search">What should the workshop focus on?</label>
  <div class="search-wrapper">
    <input type="text" id="theme-search" placeholder="e.g., saying yes, storytelling, emotions..."
           autocomplete="off">
    <span id="search-count" class="search-badge" hidden></span>
  </div>
  <div id="search-results" class="search-results" hidden></div>
  <div id="search-concepts" class="search-concepts" hidden></div>
  <div id="search-suggestions" class="search-suggestions"></div>
</div>
```

**CSS additions** (inline in existing `<style>` block):

```css
.search-wrapper { position: relative; display: flex; align-items: center; }
.search-wrapper input { flex: 1; }
.search-badge { background: #1a1a2e; color: white; border-radius: 12px; padding: 2px 10px;
                font-size: 0.75rem; margin-left: 8px; white-space: nowrap; }
.search-results { margin-top: 8px; }
.search-result-item { background: white; border-radius: 6px; padding: 10px 14px; margin-bottom: 6px;
                      cursor: pointer; border: 1px solid #e0e0e0; transition: border-color 0.2s; }
.search-result-item:hover { border-color: #1a1a2e; }
.search-result-item .result-label { font-weight: 600; font-size: 0.9rem; }
.search-result-item .result-summary { font-size: 0.8rem; color: #555; margin-top: 2px; }
.search-concepts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.concept-chip { background: #e8eaf6; color: #1a1a2e; border-radius: 12px; padding: 2px 10px;
                font-size: 0.75rem; }
.search-suggestions { margin-top: 10px; font-size: 0.8rem; color: #666; }
.suggestion-link { color: #1a1a2e; text-decoration: underline; cursor: pointer; margin: 0 4px; }
.suggestion-link:hover { color: #2d2d4a; }
```

**JavaScript** (inline in existing `<script>` block, replacing the theme-related logic):

Key behaviors:

1. **Debounced search**: on `input` event, wait 300ms then `POST /api/search` with `{ query: input.value }`
2. **Render results**: show top 5 `searchResult` items as clickable rows with label + summary. Clicking one highlights it (visual feedback) but does not change the input
3. **Concept chips**: render `matchedConcepts.mechanics`, `.skills`, `.tags` as small chips below the search results. A label like `"Focus areas: "` precedes them
4. **Suggestions**: render `suggestions` as clickable links. Clicking a suggestion sets it as the search input value and triggers a new search
5. **Result count badge**: show `"{total} exercises found"` as a badge next to the input
6. **Empty state**: on page load, before any search, show suggestions only (no results, no concepts)
7. **Submit integration**: the existing form's `submit` handler reads `#theme-search.value` and sends it as the `theme` field in the `POST /api/workshop/plan` body — the API contract for plan generation is unchanged

**Fallback**: if `fetch` to `/api/search` fails (network error, 503), silently degrade — show no results but don't break the form submission. The planner will handle the raw query string internally.

---

### 6. `src/query/theme.ts` — **Deleted**

The file is entirely replaced by `search.ts`. Remove it and remove the corresponding test file (`src/query/__testdata__/theme.test.ts` if it exists).

Check for any other imports of `theme.ts` across the codebase (`src/serve.ts` imports `expandTheme`, which is already handled by the workshop-planner change — the serve.ts itself may not directly import it but verify).

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Empty query (no theme entered) | `searchElements("")` returns empty results, curated suggestions. Planner uses all canonicals. |
| Theme words match nothing | `searchElements` retries with fewer words. If still empty, returns empty results + suggestions. Planner falls back to all canonicals with warning. |
| Theme matches only non-canonical elements | `searchElements` with `canonicalOnly: true` filters them out. If no canonicals match, returns empty results. Planner falls back to all canonicals. |
| Query has special chars / punctuation | Word split handles them naturally (split on `/\s+/`). Regex `\b` boundary handles punctuation-adjacent words like `"yes-and"`. |
| Query is very long (paragraph) | Only meaningful words pass stop-word filter. Scoring is additive — more words = higher potential score, but noise words are filtered. |
| Element has 0 mechanics + 0 skills | Text scoring still works (label + summary). getSimilarElements returns empty for this element (existing behavior). |
| API `/api/search` returns 503 (graph not loaded) | Frontend catches fetch error, shows nothing. Form submission still works — planner handles missing graph. |

## Deliverables

| File | Action |
|---|---|
| `src/query/search.ts` | **New** — `searchElements()` |
| `src/query/__testdata__/search.test.ts` | **New** — tests for scoring, fallback retry, empty query, suggestions |
| `src/query/theme.ts` | **Deleted** |
| `src/query/workshop-planner.ts` | **Modified** — use `searchElements` instead of `expandTheme`, remove internal scoring pass, preserve search result order |
| `src/query/suitable-for.ts` | **Modified** — default duration to 10, energy to "medium" |
| `src/serve.ts` | **Modified** — add `POST /api/search`, add optional status parameter to `jsonResponse` |
| `public/workshop.html` | **Modified** — search box UX with live preview, concept chips, suggestions |
| `src/query/__testdata__/api.test.ts` | **Modified** — add search endpoint tests, update plan endpoint tests for new results |

## Verification

```bash
# Unit tests
bun test

# Search endpoint
curl -sk -X POST https://improbib.host.impromat.app:5000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"saying yes"}'

# Should return:
# - results: 10+ elements, sorted by score desc
# - matchedConcepts.mechanics includes "Yes, and", "acceptance", "yes-and"
# - suggestions includes "storytelling", "active listening"
# - queryWords: ["saying", "yes"]

# Workshop plan with theme
curl -sk -X POST https://improbib.host.impromat.app:5000/api/workshop/plan \
  -H "Content-Type: application/json" \
  -d '{"duration":120,"players":12,"difficulty":"beginner","theme":"saying yes","constraints":["no-audience","no-music"]}'

# Should return:
# - warmUp: >= 2 exercises
# - main: >= 5 exercises
# - closer: >= 1 exercise
# - totalDuration: >= 90
# - No warnings about "fewer main exercises" or "no closer exercises"

# Workshop plan without theme (regression check)
curl -sk -X POST https://improbib.host.impromat.app:5000/api/workshop/plan \
  -H "Content-Type: application/json" \
  -d '{"duration":120,"players":12,"difficulty":"beginner","constraints":["no-audience"]}'

# Should return a reasonable plan from the full pool

# Long query
curl -sk -X POST https://improbib.host.impromat.app:5000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"I want exercises about accepting offers and building stories together for my beginner workshop"}'

# Should return acceptance/storytelling exercises

# Single word
curl -sk -X POST https://improbib.host.impromat.app:5000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"status"}'

# Should return status-related exercises

# Empty query
curl -sk -X POST https://improbib.host.impromat.app:5000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":""}'

# Should return empty results, full suggestions list
```

## Documentation Impact

When this plan is implemented, the following documents become stale and need updating:

### `docs/plans/0003-application-layer.md`

14 references to components being changed or deleted:

| Line(s) | What's stale | Fix |
|---|---|---|
| 67 | Architecture diagram shows `/api/themes/expand` | Replace with `/api/search` |
| 330 | `expandTheme()` interface | Add note: replaced by `searchElements()` in 0004 |
| 342–361 | `suitable-for.ts` heuristic table | Add note: duration/energy defaults added in 0004 |
| 365–376 | `theme.ts` spec (substring matching, caching) | Add note: deleted in 0004; see `search.ts` |
| 378–418 | `workshop-planner.ts` pipeline steps 1–2 reference `expandTheme()` | Add note: steps 1–2 replaced by `searchElements()` in 0004 |
| 438 | `workshop.html` description references theme search bar | Add note: replaced by search box with live preview in 0004 |
| 456 | API table lists `POST /api/themes/expand` | Replace with `POST /api/search` |
| 557–561 | File inventory lists `theme.ts` and `expandTheme()` | Add note: `theme.ts` deleted, `search.ts` added in 0004 |
| 590 | Deliverables table lists `theme.ts` | Add note: revised by 0004 |

**Recommended**: Add a banner at the top of 0003:
```
> **Note**: The workshop search / theme expansion components in this plan have been revised
> by [Plan 0004](./0004-workshop-search.md). `theme.ts` is deleted. `POST /api/themes/expand`
> is replaced by `POST /api/search`. `suitable-for.ts` applies duration/energy defaults.
> See 0004 for current design.
```

### `docs/plans/0001-knowledge-graph-and-application.md`

One reference on line 207:
```
P1–P3 implemented. P4–P6 detailed in Plan 0003.
```

**Recommended**: Append:
```
Workshop search revised by Plan 0004.
```

### `AGENTS.md`

No references to changed components. No update needed.

### `.tickets/imp-vcxm.md`

Closed historical ticket. Lists `theme.ts` and `expandTheme()` as created files. Not worth annotating — it's accurate for its time.<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="read">
<｜｜DSML｜｜parameter name="filePath" string="true">/Users/mkle/code/improbib/docs/plans/0004-workshop-search.md
