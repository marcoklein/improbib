---
name: write-adr
description: Guide for writing Architecture Decision Records (ADRs) following this project's conventions. Use when proposing or documenting architectural decisions.
compatibility: opencode
metadata:
  project: improbib
---

## What I do

- Help write ADRs that follow the project's template and numbering conventions
- Ensure decisions are properly scoped (context, decision, consequences)

## When to use me

Use this skill when the user asks to write an ADR, proposes an architecture change, or asks to document an architectural decision.

## Project context

This is improbib — a scraper for improvisation theater resources (improwiki.com, learnimprov.com, wiki.improvresourcecenter.com). Existing ADRs live in `docs/adrs/` and are numbered sequentially (0001–0007 so far).

## ADR template

Each ADR lives at `docs/adrs/NNNN-<slug>.md` and follows this structure:

```
# ADR-NNNN: Title

- **Date**: YYYY-MM-DD
- **Status**: proposed | accepted | deprecated | superseded by [ADR-NNNN]
- **Source**: source name this applies to (blank if cross-cutting)

## Context

Why this decision was needed. The problem, constraints, and alternatives considered.

## Decision

What we decided. The approach taken.

## Consequences

What this enables and what it prevents. Tradeoffs, risks, follow-up work.
```

A template file also exists at `docs/adrs/_template.md`.

## Numbering

Check the existing ADRs in `docs/adrs/` to determine the next number. Use zero-padded four-digit numbers (e.g., `0008`, `0009`). The slug should be a kebab-case summary of the title.

## Writing guidelines

- Focus on the intention and the why.
- Do not include implementation details.
- **Context** explains the problem, not the solution. Include alternatives that were considered but rejected.
- **Decision** is prescriptive — state what we're doing, not what we could do. Keep it concise.
- **Consequences** covers both positive outcomes (what this enables) and negative tradeoffs (what this prevents or makes harder). Mention follow-up work if applicable.
- If the decision applies to a specific source (improwiki, learnimprov, ircwiki), note it in `Source`. For cross-cutting decisions, leave Source blank.
- Reference other ADRs by number (e.g., "replaces ADR-0003") when decisions change or supersede each other.
