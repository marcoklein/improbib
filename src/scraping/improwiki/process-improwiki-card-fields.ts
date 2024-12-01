import type { ElementType } from "../shared/element-type";
import { appLogger } from "../../logger";

export async function processImprowikiCardFields(resultDictionary: {
  meta: Record<string, any>;
  elements: ElementType[];
}) {
  const logger = appLogger.getChild("processImprowikiCardFields");

  const cardFieldValues: Record<string, Record<string, number>> = {};

  let { meta, elements } = resultDictionary;
  if (elements.length > 2000) throw new Error("too many elements");

  // general statistics
  for (const element of elements) {
    for (const key of Object.keys(element)) {
      if (key.startsWith("card_")) {
        if (!cardFieldValues[key]) {
          cardFieldValues[key] = {};
        }
        const value = element[key] as string;
        if (cardFieldValues[key][value]) {
          cardFieldValues[key][value] += 1;
        } else {
          cardFieldValues[key][value] = 1;
        }
      }
    }
  }
  for (const key in cardFieldValues) {
    const sortedEntries = Object.entries(cardFieldValues[key]).sort(
      (a, b) => b[1] - a[1]
    );
    cardFieldValues[key] = Object.fromEntries(sortedEntries);
  }
  meta["cardFieldValues"] = cardFieldValues;

  // parse individual fields
  for (const element of elements) {
    // number of players
    const playerCountRegex = /(\d+)\s+bis\s+(\d+)/;

    const inputString =
      element["card_Number Players"] ?? element["card_Anzahl Spieler"];

    if (inputString && typeof inputString === "string") {
      const match = inputString.match(playerCountRegex);

      if (match) {
        const minimumNumber = parseInt(match[1], 10);
        const maximumNumber = parseInt(match[2], 10);
        logger.debug(
          `First number: ${minimumNumber}, Second number: ${maximumNumber}`
        );
        element["playerCountMin"] = minimumNumber;
        element["playerCountMax"] = maximumNumber;
      } else {
        logger.warn(
          `Unable to parse player count for element ${element.name} (${element.identifier})`
        );
      }
    }
  }

  // spieltyp field (only exists in German elements)
  // kompetenzen
  // competences, focus
  // are added to element tags

  const fieldsForTags = [
    "card_Spieltyp",
    "card_Kompetenzen",
    "card_Schwerpunkt",
    "card_Focus",
    "card_Competences",
    "card_Gruppierung",
    "card_grouping",
    "card_Vitality",
    "card_Experience",
    "card_Erfahrung",
    "card_Dynamik",
  ].map((v) => v.toLowerCase());

  logger.info(
    "Processing field values that are added as additional tags: {fields}",
    { fields: fieldsForTags }
  );
  for (const element of elements) {
    logger.debug("Processing {elementName}", { elementName: element.name });
    const matchingKeys = Object.keys(element).filter((key) =>
      fieldsForTags.includes(key.toLowerCase())
    );
    if (!matchingKeys.length) continue;
    logger.debug("Matching keys: {matchingKeys}", { matchingKeys });
    const newTags = matchingKeys.flatMap((key) => {
      const value = element[key];
      if (typeof value === "string") {
        return value.split(",").map((v) => v.trim());
      }
      logger.error("Unable to parse values as the expected type is string.");
      return [];
    });
    element.tags = [...new Set([...element.tags, ...newTags])];
    logger.debug("Added tags from card_ fields: {newTags}", { newTags });
  }

  meta["tagTaxonomy"] = {
    experience: [
      "freshman",
      "advanced",
      "pro",
      "Anfänger",
      "Fortgeschritten",
      "Profi",
    ],
    vitality: ["ruhig", "lebhaft", "wild", "calm", "energetic"],
  };
}
