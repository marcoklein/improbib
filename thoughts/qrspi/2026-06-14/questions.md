# Research Questions

1. How does `deriveGraph()` in `src/graph/derive.ts` populate the graph — what are all node types and edge types it produces, and what data flows into each phase?

2. How are canonical element clusters formed from normalized elements — specifically, how do `relatedIdentifiers` and translation links drive Union-Find clustering, and what rules pick the canonical element's label, description, and properties?

3. What determines `buildsOn` and `requires` edges — how does `requirement-mapping.ts` derive requirements from mechanics and tags, and what subset/difficulty/duration heuristics produce dependency edges between source elements?

4. How do graph overrides in `overrides.ts` modify the final graph — what override types exist, how are they stored, and how are content hashes used to detect stale overrides?

5. How does the review CLI in `review.ts` read and query the production graph — what indices does it build, what view modes exist, and what override commands can a reviewer issue?

6. How does the vocabulary (`vocabulary.json`) get loaded and used to canonicalize mechanics and skills into consistent node labels during graph derivation?

7. How do derivation artifacts flow through the pipeline — what files does `deriveGraphFromFiles()` read from `output/`, and how is the resulting `graph.json` structured at the top level?
