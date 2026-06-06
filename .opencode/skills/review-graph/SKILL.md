---
name: review-graph
description: Review the improbib knowledge graph for dedup quality, edge correctness, and hub anomalies. Use for human QA of the production graph (Plan 0001 Phase P3).
compatibility: opencode
metadata:
  project: improbib
  layer: graph
---

## What I do

- Guide human review of the improbib knowledge graph (dedup clusters, mechanics/skills/tags edges)
- Ensure reviews happen against the **production graph** (fetched from the deployed server, not local dev output)
- Walk through the tiered review workflow: weak clusters → edge/hub spot-checks → override application
- Track overrides in `graph-overrides.json` (version-controlled, survives re-scrapes)

## When to use me

Use this skill whenever:
- The user asks to "review the graph", "QA the graph", or "check dedup quality"
- The user wants to inspect weak-confidence clusters or suspicious matches
- The user wants to apply graph overrides (reject_match, add_match, remove_edge, add_edge)
- After normalizing or re-scraping data, to verify graph correctness

## Pre-requisites

- `graph-overrides.json` is version-controlled in the repo and applied during graph derivation on the server
- The review CLI is at `src/review.ts` (see `bun run src/review.ts --help`)
- Override types: `reject_match`, `add_match` (affect dedup clustering), `remove_edge`, `add_edge` (affect post-clustering edges)

## Workflow

### Step 0: Fetch the production graph

Always review the **production** graph, not local dev output:

```bash
curl -s https://improbib.host.impromat.app:5000/graph.json -o output/graph.json
```

Optionally inspect scale:
```bash
curl -s https://improbib.host.impromat.app:5000/graph.json | jq '.meta'
```

### Step 1: Review weak dedup clusters

```bash
bun run src/review.ts --clusters --limit 30
```

Clusters are sorted by lowest confidence first. Focus on the ⚠ clusters (min confidence <75%).

### Step 2: Inspect suspicious cluster members

For any cluster that looks wrong, compare members side-by-side:

```bash
bun run src/review.ts --element <id-a>
bun run src/review.ts --element <id-b>
```

Check: descriptions, mechanics, skills — do they actually describe the same exercise?

### Step 3: Apply corrections

If two elements were incorrectly matched:
```bash
bun run src/review.ts --reject <id-a> <id-b>
```

If two elements look like the same exercise but weren't matched:
```bash
bun run src/review.ts --add-match <id-a> <id-b>
```

If an edge is wrong (wrong mechanic/skill/tag on an element):
```bash
bun run src/review.ts --remove-edge <element-id> <edge-type> <target-id>
bun run src/review.ts --add-edge <element-id> <edge-type> <target-id>
```

### Step 4: Commit overrides

Overrides are written to `graph-overrides.json`. Commit and push:

```bash
git add graph-overrides.json
git commit -m "graph: add overrides from review session"
git push
```

The server picks up `graph-overrides.json` on the next deploy.

### Step 5: Verify corrections

After deploying, the server re-derives the graph with overrides applied. Verify:

```bash
curl -s https://improbib.host.impromat.app:5000/graph.json | jq '.meta.overridesApplied'
curl -s https://improbib.host.impromat.app:5000/graph.json | jq '.meta.overridesStale'
```

Stale overrides (content hash mismatch) mean the source data changed since the override was written — review those manually.

### Bonus: Spot-check hubs and random elements

```bash
bun run src/review.ts --hubs --limit 20
bun run src/review.ts --random 5
```

Hubs show the most-connected skills/mechanics/tags — useful for spotting categorization issues. Random canonical elements give a quick quality sample.

## Override lifecycle

- Overrides target **source element identifiers** (MD5 of name+URL), stable across re-scrapes
- On re-scrape, if an element's `normalized.contentHash` changes, the override targeting it becomes **stale** and is skipped with a warning
- Stale overrides should be removed or updated manually

## Current graph scale (reference)

As of initial deployment: ~2,000 elements, ~20,000 edges, ~670 clusters.
~12 clusters have min confidence <75% — these are the primary review targets.
~660 clusters have confidence ≥95% — low review priority.
