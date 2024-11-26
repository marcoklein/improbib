import type { ElementType } from "./element-type";
import { appLogger } from "./logger";
import { mergeEntities } from "./merge-entities";

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
