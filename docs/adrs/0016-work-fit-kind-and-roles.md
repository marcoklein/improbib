# ADR-0016: Kind and roles separate what a work is from where it fits

- **Date**: 2026-11-21
- **Status**: accepted
- **Source**: product/features/work-fit-taxonomy.md, ip-hbzj

## Context

The artifact derived `normalized.categories` only from source tags. A tag means
"this page sits in the games category", not "this is playable". Two public
pages showed the failure:

- **"Raum einrichten"** is an index page whose body is nothing but links to its
  exercise and performance variants, yet it was published as an `exercise` with
  a difficulty, an energy level and `Einsatz: Probe`.
- **"Tabu"** is a glossary entry tagged `game` and `glossary`; it was published
  as a game for rehearsal *and* show although it contains no instructions.

The same derivation also gave every glossary entry in the merged corpus the
show role. Nine of 1,209 works carried the glossary tag; six carried `show`.

## Decision

Publish two axes on every element's `normalized` block:

1. **`kind`** — `format | game | exercise | collection | concept |
   audienceQuestion`, derived deterministically.
   - A page whose body is only a list of links, and whose link labels all start
     with the page name, is a `collection`.
   - A glossary/concept page is a `concept` unless another source states an
     explicit playable identity (`exercise`, a show-format tag, or `askFor`).
     A bare `game` tag does not count, because improvwiki files glossary pages
     under "Spiele".
   - Otherwise the spec precedence applies: `format > game > exercise >
     audienceQuestion`.
   - Only `format`, `game` and `exercise` are playable.
2. **`roles[]`** — `warmup` and `show`, each with `strong` (explicit tag) or
   `inferred` (curated warm-up list, extraction `usage`). Non-playable kinds
   carry no roles.

Consequences for the published content:

- `normalized.practical` is empty for concepts and collections: no difficulty,
  player count, energy, duration or `Einsatz`.
- `normalized.categories` keeps the playable badges for the app, but a concept
  publishes only `concept` and a collection publishes none.
- Works are derived once and copied onto every member, so two sources of one
  work cannot disagree about kind or roles.
- Deduplication no longer merges a glossary/concept page with a playable page of
  the same name. They are different works even at confidence 1.

`findWorkFitProblems` (shared by the unit tests and gate 7) fails the artifact
when a kind is missing, a non-playable kind carries a role or `show`, a
collection is published as a game/exercise, or a glossary-tagged work carries
`show`.

## Consequences

- `kind` and `roles` are additive fields; unknown values are ignored by the
  current app. The category and `usage` changes take effect on the next import,
  before the app learns the new fields.
- The app still renders experiment data from `categories`/`practical.usage`
  until it migrates to `kind`/`roles`; the producer is ahead of the consumer by
  design (contract compatibility policy).
- The merge guard splits the two known glossary/playable collisions (`Chairs`,
  `Gibberish`) into separate works. The glossary entry stays a concept; the
  playable page keeps its roles.
- `durationSource` and `entryCost` from the taxonomy spec are not part of this
  decision; they remain follow-up tickets.
