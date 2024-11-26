import type { ElementType } from "../element-type";
import { appLogger } from "../logger";
import { mergeEntities } from "../merge-entities";

/**
 * Merges English and German fields of all elements.
 */
export function mergeTranslationFields(output: { elements: ElementType[] }) {
  const { elements } = output;
  const logger = appLogger.getChild("mergeTranslationFields");

  const mergedEntities: Record<string, ElementType> = {};

  for (const element of elements) {
    const linkedIdentifier =
      element.translationLinkDeIdentifier ??
      element.translationLinkEnIdentifier;
    mergedEntities[element.identifier] = element;
    if (!linkedIdentifier) {
      continue;
    }
    const otherElement = elements.find(
      (el) => el.identifier === linkedIdentifier
    );
    if (!otherElement) {
      logger.warn(
        "Could not find other element via language identifier. {elementName} ({elementIdentifier}) => other identifier: {otherIdentifier}",
        {
          elementName: element.name,
          elementIdentifier: element.identifier,
          otherIdentifier: linkedIdentifier,
        }
      );
      continue;
    }

    mergedEntities[element.identifier] = mergeEntities(element, otherElement, [
      "tags",
      "playerCountMin",
      "playerCountMax",
    ]);
  }

  output.elements = Object.values(mergedEntities);
}
