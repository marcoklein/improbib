# ADR-0013: Published work model in the artifact

- **Date**: 2026-11-05
- **Status**: accepted
- **Source**: cross-cutting (improwiki, learnimprov, ircwiki)

## Context

Normalization already produces far more than the artifact exposes. The stage-1
LLM extraction yields `summary`, `description`, `howToPlay`, `practical`
(difficulty, energy level, duration, group size), `mechanics`, `skills`,
`tips`, `referencedElements` and `variations` for essentially every element.
The dedup stage links the same exercise across sources and pairs the German and
English versions. The graph derives canonical works.

`/improbib.json`, however, was assembled from the raw layer only: markdown,
tags, player counts and licenses. The normalized and aggregated data were a
dead end for consumers. That had three visible consequences:

1. Impromat re-generated one-line summaries with its own model even though
   improbib had better ones for 1343 of 1355 elements.
2. Difficulty and energy existed but could not be used as filters.
3. Duplicate source pages (`Freeze` from learnimprov and `Freeze Tag` from
   improwiki) and variant pages (`Endowments-Crime Scene`) competed as separate
   elements.

## Decision

The artifact publishes four layers, all derived from the same run:

| Layer | Identity | Regenerable |
| --- | --- | --- |
| `SourceElement` (raw) | `md5(url)` | no (source of truth) |
| `NormalizedContent` | source id + `contentHash` | yes (LLM) |
| `Work` / `TranslationGroup` | deterministic hash of members | yes (dedup + links) |
| `/improbib.json` | v2 artifact | yes (assemble) |

**Backwards-compatible shape.** `elements` keep their identity and content and
gain optional fields:

- `normalized` — published subset: summary, description, howToPlay, practical,
  mechanics, skills, tips, references, `contentHash`, `normalizedBy`,
  `extractedAt`. Omitted when the summary or description is empty.
- `canonicalId` — work id shared by all source pages of the same exercise in
  one language.
- `translationId` — shared by the DE and EN work.
- `variationOf` — parent work id, when the element is a standalone variant.
- `workKind` (`element` | `variation`), `isCanonicalMember`.
- `authors`, `lastModified` — attribution where the source provides it.

**`works[]`** is the same information from the other direction:
`{ id, languageCode, canonicalElementId, memberIds, name, translationId,
parentWorkId, parentConfidence, sources[], variations[] }`. Each source carries
its own URL and license.

**Language-homogeneous works.** A work contains only elements of one language.
Translation links never become cluster edges; they form a separate
`TranslationGroup`. This keeps `translationId` meaningful and prevents the
graph's previous "one cluster, two canonical nodes" workaround.

**Confidence threshold.** `MIN_CLUSTER_CONFIDENCE = 0.85`
(`src/normalize/cluster-config.ts`) applies to the graph clusters and to the
published works. Dedup relations start at 0.5; chaining all of them produced
transitively wrong clusters such as
`{Acts of god, Freeze-Endowment, Clap-In}`. `graph-overrides.json`
(`add_match`, `reject_match`, `add_variationOf`) remains the escape hatch.

**Standalone variants.** A source page becomes a variant of another work when
its name is `Parent-Variation` and the remainder matches a variation the parent
documents (for example `Endowments-Crime Scene` → `Endowments`,
`Freeze-Endowment` → `Freeze`). Matching uses every member name of the parent,
not only its canonical name. Links are one level deep and cycle-free.

**Attribution and privacy.** `authors` is filled only when a source explicitly
attributes someone (learnimprov: the site account `learnimprov`). improwiki's
edit footer names the last editor (a wiki user name, potentially a natural
person), so it is recorded internally as `lastEditedBy` but **never published**.
The legally relevant attribution remains source URL plus license, which the
consumer already renders.

**Assembly order.** Scrape → normalize → assemble. `serve.ts` re-assembles the
artifact after normalization, vocabulary, dedup and graph stages so the
published work model always reflects the latest normalized data.

## Consequences

- Consumers can import summaries, difficulty, energy, durations and variations
  without running their own LLM, and can collapse duplicate sources per
  language and pair DE/EN versions.
- The artifact grows from ~5.5 MB to ~10 MB (1296 elements, 1263 works).
- Work merging is bounded by dedup quality: only same-language relations at or
  above 0.85 merge, currently 29 pairs. The artifact is deliberately
  conservative rather than risking wrong merges.
- Five elements have no `normalized` block because extraction returned an empty
  summary/description. They keep their raw content.
- `lastUpdate` remains on improwiki elements for backwards compatibility;
  `lastModified` (ISO 8601) is the field to use.
- Editorial changes and machine translation are **not** part of this decision.
  When they land they get their own layer (`editorial` with
  `basedOnContentHash`) and never overwrite `markdown`.
