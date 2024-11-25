import type { ElementType } from "..";
import { appLogger } from "../logger";
import { processImprowikiPage } from "./process-improwiki-page";

export async function resolveTranslationLinks(
  elements: ElementType[]
): Promise<ElementType[]> {
  const logger = appLogger.getChild("resolveTranslationLinks");
  const urlToIdentifierMap: { [url: string]: string } = {};

  elements.forEach((element) => {
    urlToIdentifierMap[element.url] = element.identifier;
  });

  for (const element of elements) {
    if (element.translationLinkEn) {
      const enIdentifier = urlToIdentifierMap[element.translationLinkEn];
      if (enIdentifier) {
        element.translationLinkEnIdentifier = enIdentifier;
      } else {
        logger.info(
          `No matching element found for translationLinkEn: ${element.translationLinkEn} . Loading that element...`
        );
        const result = await processImprowikiPage(element.translationLinkEn);
        if (result) {
          elements.push(result);
          element.translationLinkEnIdentifier = result.identifier;
          urlToIdentifierMap[element.translationLinkEn] = result.identifier;
          logger.info(
            `Loaded element for translationLinkEn: ${element.translationLinkEn}`
          );
        } else {
          logger.warn(
            `No matching element found for translationLinkEn: ${element.translationLinkEn}`
          );
        }
      }
    }

    if (element.translationLinkDe) {
      const deIdentifier = urlToIdentifierMap[element.translationLinkDe];
      if (deIdentifier) {
        element.translationLinkDeIdentifier = deIdentifier;
      } else {
        logger.info(
          `No matching element found for translationLinkDe: ${element.translationLinkDe} . Loading that element...`
        );
        const result = await processImprowikiPage(element.translationLinkDe);
        if (result) {
          elements.push(result);
          element.translationLinkDeIdentifier = result.identifier;
          urlToIdentifierMap[element.translationLinkDe] = result.identifier;
          logger.info(
            `Loaded element for translationLinkDe: ${element.translationLinkDe}`
          );
        } else {
          logger.warn(
            `No matching element found for translationLinkDe: ${element.translationLinkDe}`
          );
        }
      }
    }
  }

  logger.info("Assessing translation links");
  // Validate that translation links go both directions
  elements.forEach((element) => {
    if (element.translationLinkEn) {
      const enElement = elements.find(
        (el) => el.identifier === element.translationLinkEn
      );
      if (enElement && enElement.translationLinkDe !== element.identifier) {
        logger.warn(
          `Translation link mismatch: ${element.url} <-> ${enElement.url}`
        );
      }
    }

    if (element.translationLinkDe) {
      const deElement = elements.find(
        (el) => el.identifier === element.translationLinkDe
      );
      if (deElement && deElement.translationLinkEn !== element.identifier) {
        logger.warn(
          `Translation link mismatch: ${element.url} <-> ${deElement.url}`
        );
      }
    }
  });
  logger.info("Translation link validation complete");
  return elements;
}
