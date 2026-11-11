/**
 * Targeted re-extraction: `NORMALIZE_FORCE_IDS`.
 *
 * A normalization run is expensive, so the stages cache per content hash and
 * reuse whatever still matches. After a prompt or quality fix that changes only
 * the answer (not the page), every cached element still matches — the fix would
 * take a full re-extraction to land. This variable names the few elements that
 * must be extracted again regardless of their cache state.
 *
 * Comma-separated element identifiers, e.g.
 * `NORMALIZE_FORCE_IDS=abc123,def456`.
 */

/** Identifiers listed in `NORMALIZE_FORCE_IDS` (comma-separated). */
export function parseForceIds(
  envVal: string | undefined = process.env.NORMALIZE_FORCE_IDS
): Set<string> {
  return new Set(
    (envVal ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

/** Whether a force list names this element. */
export function isForcedIdentifier(
  identifier: string | undefined,
  forceIds: ReadonlySet<string>
): boolean {
  return Boolean(identifier && forceIds.has(identifier));
}

/**
 * Whether a force list names any member of a merged work unit. The unit is the
 * cached entity there, so one listed member forces the whole unit.
 */
export function isForcedUnit(
  memberIds: readonly string[],
  forceIds: ReadonlySet<string>
): boolean {
  return memberIds.some((id) => forceIds.has(id));
}
