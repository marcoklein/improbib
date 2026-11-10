import type { NormalizedElement } from "../normalize/normalized-schema";

export interface WorkNormalization {
  memberIds: string[];
  normalized: NormalizedElement["normalized"];
}

/**
 * Give every member of a work the one merged extraction.
 *
 * The per-element content stays in `elements`, so consumers that read a single
 * element must see the same walkthrough as the work — not the page-local
 * extraction that the staged run skipped. Identifiers that no longer exist in
 * the published elements are simply ignored.
 */
export function applyWorkNormalizations<
  T extends { identifier: string; normalized: NormalizedElement["normalized"] },
>(elements: T[], works: WorkNormalization[]): T[] {
  const byMember = new Map<string, NormalizedElement["normalized"]>();
  for (const work of works) {
    for (const memberId of work.memberIds) {
      byMember.set(memberId, work.normalized);
    }
  }

  return elements.map((element) => {
    const normalized = byMember.get(element.identifier);
    return normalized ? { ...element, normalized } : element;
  });
}
