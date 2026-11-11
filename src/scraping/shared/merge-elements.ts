import { appLogger } from "../../logger";
import type { ElementType } from "./element-type";
import { mergeEntities } from "./merge-entities";
import { normalizeSourceUrl } from "./url-identity";

/**
 * Merges all duplicated elements by the identifier.
 * Directly operates on the given elements input.
 *
 * @param result
 */
export function mergeElements(result: { elements: ElementType[] }) {
  const logger = appLogger.getChild("mergeElements");
  const mergedElements: Record<string, ElementType> = {};

  for (const element of result.elements) {
    const key = element.identifier;
    if (mergedElements[key]) {
      logger.debug(`Duplicated element: ${element.name}. Merging elements...`);
      logger.debug(
        `Existing element ${mergedElements[key].name} (${mergedElements[key].url})`
      );
      logger.debug(`New element ${element.name} (${element.url})`);
      const existingElement = mergedElements[key];
      mergedElements[key] = mergeEntities(existingElement, element);
    } else {
      mergedElements[key] = element;
    }
  }

  result.elements = Object.values(mergedElements);
}

const METADATA_ARRAY_FIELDS = ["tags", "categories", "postTags"] as const;

/**
 * The element that represents a page when the scraper produced several.
 *
 * A fresh fetch is the current state of the page, so the newest `fetchedAt`
 * wins; when timestamps are equal the one with more content wins, and the
 * identifier is the last tie-breaker. Everything is stable across runs.
 */
function pickUrlKeeper(group: ElementType[]): ElementType {
  return [...group].sort((a, b) => {
    const byDate = (b.fetchedAt ?? "").localeCompare(a.fetchedAt ?? "");
    if (byDate !== 0) return byDate;
    const byLength =
      (b.markdown?.length ?? b.htmlContent?.length ?? 0) -
      (a.markdown?.length ?? a.htmlContent?.length ?? 0);
    if (byLength !== 0) return byLength;
    return a.identifier.localeCompare(b.identifier);
  })[0];
}

/**
 * Keeps one element per `(source, url)`.
 *
 * The element identifier is `md5("element;<name>;<url>")`, so a page whose
 * title changed is stored a second time under a new identifier while the
 * previous element is kept by `loadExistingElements` — the same URL then has
 * two elements that `mergeElements` cannot collapse. This pass is the cheap
 * guard at the point of discovery: newest fetch wins, metadata arrays are
 * unioned so tags from a second listing page are not lost.
 *
 * @returns the number of elements that were merged away
 */
export function dedupeElementsByUrl(result: {
  elements: ElementType[];
}): number {
  const logger = appLogger.getChild("dedupeElementsByUrl");
  const keyOf = (element: ElementType) =>
    `${element.sourceName}\u0000${normalizeSourceUrl(element.url)}`;
  const groups = new Map<string, ElementType[]>();

  for (const element of result.elements) {
    const key = keyOf(element);
    const group = groups.get(key);
    if (group) group.push(element);
    else groups.set(key, [element]);
  }

  const kept: ElementType[] = [];
  let removed = 0;

  for (const element of result.elements) {
    const keeper = pickUrlKeeper(groups.get(keyOf(element))!);
    if (element.identifier !== keeper.identifier) {
      removed++;
      continue;
    }
    // Rebuild the keeper once, when its turn comes, so the union sees every
    // member of the group regardless of the input order.
    const merged = { ...element };
    for (const member of groups.get(keyOf(element))!) {
      if (member.identifier === keeper.identifier) continue;
      for (const field of METADATA_ARRAY_FIELDS) {
        const extra = member[field];
        if (!Array.isArray(extra) || extra.length === 0) continue;
        merged[field] = [...new Set([...(merged[field] ?? []), ...extra])];
      }
      logger.debug(
        `Dropping ${member.name} (${member.identifier}) for the same URL as ${keeper.name} (${keeper.identifier})`
      );
    }
    kept.push(merged);
  }

  result.elements = kept;
  return removed;
}
