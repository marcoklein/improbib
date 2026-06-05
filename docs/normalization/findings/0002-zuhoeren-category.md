# NORM-0002: "Zuhören" miscategorized as `vocal` — skill category guidance too vague

- **Date**: 2026-06-04
- **Status**: done
- **Source**: Zweier-Synchro (de)

## Observation

The skill "Zuhören" (listening) was categorized as `vocal`:

```json
{ "name": "Zuhören", "category": "vocal" }
```

"Zuhören" involves hearing and processing, not producing sound. Likely categories: `cognitive` (pattern recognition, processing) or `social` (interpersonal awareness, reacting to partner).

## Root cause

The system prompt lists skill categories (`social|physical|cognitive|narrative|vocal`) but provides no examples or guidance about which skills map to which categories. The LLM associated "Zuhören" with `vocal` because it involves sound, not because it produces it.

## Action

Add category guidance with examples to the system prompt:

```
- Skill categories: social (acceptance, status play, trust), physical (body awareness, mirroring, spatial awareness), cognitive (spontaneity, pattern recognition, quick thinking), narrative (storytelling, character creation, theme exploration), vocal (singing, projection, vocal range).
```

This gives the LLM concrete examples to anchor its categorization decisions. Synonym deduplication and canonical naming will be handled in Layer 2 (Stage 3 vocabulary normalization has been deferred — see ADR-0008).

## Verification

- [x] Added category guidance with examples to system prompt
- [ ] Re-run extraction on Zweier-Synchro, check skill categories
- [ ] Benchmark skill category precision against golden set
- [ ] Mark done when non-vocal skills are no longer categorized as `vocal`
