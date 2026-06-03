# Plan 0001: Knowledge Graph & Application

## Vision

Improvisation theater has no structured, cross-source database connecting games, exercises, shows, skills, and mechanics. Existing resources (improwiki, learnimprov, IRC Wiki) are siloed, their tag systems are flat and source-specific, and workshop/show planning relies entirely on personal knowledge.

**Goal**: Derive a knowledge graph from scraped improv sources, enable human quality control, and build a workshop/show planning application on top of it.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Layer 3: Application                                            │
│ Workshop planner · Show set builder · Element browser           │
│ Consumes graph.json — has no knowledge of sources or scraping   │
├──────────────────────────────────────────────────────────────────┤
│ Layer 2.5: Human QA                                 │
│ Review, correct, enrich edges                      │
│ Produces overrides that merge into the final graph │
├──────────────────────────────────────────────────────────────────┤
│ Layer 2: Knowledge Graph Derivation                             │
│ Consumes normalized elements                                    │
│ LLM extraction + heuristics → draft graph                       │
│ Merges human QA overrides → output/graph.json                   │
├──────────────────────────────────────────────────────────────────┤
│ Layer 1.5: Content Normalization             │
│ Structures raw markdown into sections        │
│ Extracts inline variations as sub-elements   │
│ Extracts cross-references between elements   │
│ → output/normalized/{source}.json            │
├──────────────────────────────────────────────────────────────────┤
│ Layer 1: Raw Sources (exists)                                   │
│ improwiki.com · learnimprov.com · wiki.improvresourcecenter.com │
│ Scrapes HTML + metadata → output/raw/{source}.json              │
│ Per ADR-0001 through ADR-0007                                   │
└──────────────────────────────────────────────────────────────────┘
```

Data flows one direction. Each layer produces a stable artifact, enabling independent iteration on downstream layers without re-running upstream ones.

## Layer 1: Raw Sources (exists)

Scrapes source websites, extracts metadata and raw HTML, resolves cross-page links (translation links), deduplicates by identifier. Each source produces `output/raw/{source}.json`.

This layer is already built. Existing ADRs document the decisions.

## Layer 1.5: Content Normalization

### Problem

Source content is inconsistently structured. A single page may contain a game description, inline variations, tips, cross-references to other games, and pedagogical notes — all as unstructured markdown. Feeding this directly into graph derivation produces unreliable extraction.

### What it does

For each element, an LLM pass structures the raw markdown into clean fields:

| Field | Content |
|---|---|
| `description` | 1–3 sentence summary of what the element is |
| `howToPlay` | Step-by-step instructions |
| `variations` | Named variations described inline, with their own short descriptions |
| `tips` | Pedagogical notes, common pitfalls, teacher advice |
| `referencedElements` | Names of other elements mentioned in the text |

The original markdown is preserved unchanged. The structured fields augment it.

### Inline variations → candidate sub-elements

When a source page describes a variation that has no dedicated page of its own, normalization promotes it to a **derived sub-element**. Example:

- Source page: "Freeze Tag" describes "Emotional Freeze Tag" as a one-paragraph variation
- Normalization output: `Emotional Freeze Tag` becomes a candidate element with `derivedFrom: "Freeze Tag"` and `sourcedFrom` pointing to the original Freeze Tag page
- Human QA can accept or reject this promotion

Derived elements are clearly marked to distinguish them from elements that have dedicated source pages. Downstream, the graph can choose to include or exclude them.

### Output

`output/normalized/{source}.json` — same elements as the raw layer, augmented with structured fields and candidate sub-elements.

## Layer 2: Knowledge Graph

### Node Types

| Node | What it represents | Example |
|---|---|---|
| `Element` | An improv structure (game, exercise, show form, concept) | "Freeze Tag", "Zip Zap Zop" |
| `Mechanic` | A reusable building block / rule fragment | "freeze signal", "alphabet constraint" |
| `Skill` | A competency trained by elements | "acceptance", "group mind", "character work" |
| `Tag` | A canonical tag (existing flat system) | "warmup", "circle", "beginner" |
| `Source` | Origin website | "improwiki.com", "learnimprov.com" |
| `Category` | A dimension in the tag taxonomy | "Structure Type", "Grouping", "Difficulty" |

### Edge Types

| Edge | From → To | Source | Meaning |
|---|---|---|---|
| `translationOf` | Element ↔ Element | Scraped | DE/EN translation pair |
| `sourcedFrom` | Element → Source | Scraped | Origin of this element |
| `hasTag` | Element → Tag | Scraped + transformed | Element carries this tag |
| `hasMechanic` | Element → Mechanic | LLM extraction | Uses this building block |
| `variantOf` | Element → Element | LLM + heuristics | Y is a variation of X |
| `trainsSkill` | Element → Skill | LLM extraction | Playing develops this skill |
| `prerequisiteFor` | Element → Element | LLM extraction | Master X before Y |
| `requiresSkill` | Element → Skill | LLM extraction | This skill is needed to play |
| `similarTo` | Element ↔ Element | Computed | Share mechanics/tags |
| `contrastsWith` | Element ↔ Element | Computed | Intentionally different |
| `belongsTo` | Tag → Category | Manual taxonomy | Tag belongs to this dimension |
| `derivedFrom` | Element → Element | Normalization | Sub-element extracted from parent page |

### Derivation Steps

1. **Heuristics** (deterministic): tag classification into taxonomy dimensions, naming-pattern variant detection, cross-source deduplication by name similarity, player count, translation links — all from existing scraped data.

2. **LLM extraction** (one batch per element): mechanics list, skills list, variation relationships, prerequisite relationships, typical duration, energy level. Consumes normalized structured fields, not raw markdown.

3. **Computed edges**: similarity (shared mechanics/tags), contrast (disjoint mechanics/tags), tag-to-category membership — derived mathematically from extracted data.

### Output

`output/graph.json` — nodes and edges array, serving as the single source of truth for the application layer.

## Layer 2.5: Human QA

Automated extraction will make mistakes. Misidentified mechanics, wrong variation links, missing prerequisites, incorrect energy levels.

### Workflow

1. LLM extraction produces `output/graph-draft.json`
2. Human reviews draft edges and produces `output/graph-overrides.json` — a file containing only corrections: accepted edges, rejected edges, manually added edges
3. Merge: draft + overrides → `output/graph.json`
4. On re-scrape: for unchanged elements, overrides are preserved. Changed or new elements get re-extracted and flagged for review.

The override file is diffable and can be tracked in git. The review interface starts as a flat file, evolvable to a web UI later.

### Review Granularity

Human QA operates at the **edge level** (accept/reject/add individual relationships), not at the element level. An element might have 15 edges, and the reviewer corrects 2 of them. The other 13 survive untouched.

## Layer 3: Application

Built on `output/graph.json`. Does not know about raw sources, scraping, or extraction.

### Use Cases

**Workshop Planner**: Given constraints (duration, player count, skill level, desired skills, theme), traverse the graph to generate a workshop sequence with:
- Energy arc (medium → rising → peak → cool)
- Skill scaffolding (each exercise builds on prerequisites from previous)
- Variety constraints (avoid repeating grouping, mechanic, or energy level back-to-back)
- Fallback alternatives (similarTo edges for "instead of X, try Y")

**Show Set Builder**: Encode show formats as query templates over the graph. Suggest game combinations that fit format constraints. Ensure set list variety.

**Element Browser**: Filter by mechanic, skill, tag, source, difficulty, player count. Navigate variation families. Compare elements across sources.

### Implementation

The application is a separate concern. It could be a CLI tool, a static site, or a web app — the graph is the contract. The interface type is deferred to a detailed application plan.

## Phasing

| Phase | What | Delivers | Depends On |
|---|---|---|---|
| P1 | Content normalization pipeline | `output/normalized/{source}.json` | Raw scrapers |
| P2 | Knowledge graph derivation | `output/graph-draft.json` | P1 |
| P3 | Human QA workflow | `output/graph-overrides.json` → `output/graph.json` | P2 |
| P4 | Application: element browser | Filterable/searchable UI over the graph | P3 |
| P5 | Application: workshop planner | Constraint-based sequence generation | P3 |
| P6 | Application: show set builder | Format-aware set list generation | P3 |

Each phase gets its own detailed plan in `docs/plans/`.

## Data Dependency Graph

```
output/raw/improwiki.json ─┐
output/raw/learnimprov.json ─┤
output/raw/ircwiki.json ────┘
        │
        ▼
output/normalized/improwiki.json ─┐
output/normalized/learnimprov.json ─┤
output/normalized/ircwiki.json ────┘
        │
        ▼
output/graph-draft.json  ──(+ overrides)──▶  output/graph.json
        │                                            │
        ▼                                            ▼
   Human QA                                   Application
```

## Open Questions

1. **LLM model**: Local (Ollama) vs API (Claude, GPT)? Content normalization + graph extraction is a one-time batch per element (~500–1000 elements). API cost is modest even with larger models.

2. **Derived sub-elements**: Should inline variations be promoted to first-class element nodes (with `derivedFrom` edges), or kept as structured data on the parent? _Current lean: promote, clearly marked, with human QA approval._

3. **Language handling**: The graph has DE and EN elements connected by `translationOf`. Should mechanics and skills be language-agnostic concepts, or language-specific? _Current lean: language-agnostic — a mechanic is a concept, not a string._

4. **Graph format**: JSON array of nodes + edges. Could consider JSON-LD or RDF for standards compatibility. Tradeoff: simplicity vs. interoperability.

5. **External sequencing data**: Should the graph also ingest existing workshop curricula or show setlists (from books, blogs, YouTube) to mine sequencing edges? _Deferred to a future phase._

6. **Re-scrape behavior**: When sources are re-scraped, how do we handle elements that changed? _New/changed elements get re-normalized and re-extracted. Unchanged elements keep their reviewed graph edges. The change detection uses the existing MD5 identifier._

## Key Design Principles

- **Raw is immutable**: Original source content is never modified. Normalization and graph derivation are additive.
- **Layers are independent**: Each layer produces a file artifact. Downstream layers can be iterated without re-running upstream.
- **Human QA is a separate artifact**: Review decisions live in their own file. They survive re-scrapes and re-extraction.
- **The graph is the contract**: The application consumes only `graph.json`. Nothing leaks through from sources or scraping.
- **Derived elements are marked**: Any element not backed by its own source page is clearly distinguished from scraped elements.
