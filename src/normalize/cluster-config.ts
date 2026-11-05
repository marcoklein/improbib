/**
 * Minimum confidence for treating two source elements as the same work.
 *
 * Dedup produces relations from 0.5 upwards. Merging everything chained those
 * into transitively wrong clusters (for example
 * `{Acts of god, Freeze-Endowment, Clap-In}`), so both the graph and the
 * published artifact only trust relations at or above this threshold.
 * `graph-overrides.json` can still add or reject individual matches.
 */
export const MIN_CLUSTER_CONFIDENCE = 0.85;
