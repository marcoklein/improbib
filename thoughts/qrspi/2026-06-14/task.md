# Task

Document the knowledge graph ontology so it becomes reviewable and extensible.

The graph currently exists only as code — `derive.ts` produces nodes and edges without an explicit ontology specification. This makes it hard to audit edge correctness, reason about what the graph represents, and plan extensions like new node types, edge types, or graph traversals. The deliverable is a document describing every node type, edge type, their semantics, and the derivation rules that populate them.
