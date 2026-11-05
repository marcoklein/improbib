import { appLogger } from "../../logger";
import type { ElementType } from "../shared/element-type";
import { mergeEntities } from "../shared/merge-entities";

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

    // Both language pages describe the same element, so unify the tag set.
    // Player counts are kept per page and only filled in when one side is
    // missing — the pages sometimes disagree, and taking the twin's value
    // would silently swap the two.
    const merged = mergeEntities(element, otherElement, ["tags"]);
    merged.playerCountMin ??= otherElement.playerCountMin;
    merged.playerCountMax ??= otherElement.playerCountMax;
    mergedEntities[element.identifier] = merged;
  }

  output.elements = Object.values(mergedEntities);
}
