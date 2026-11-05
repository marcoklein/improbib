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
    // number of players: "2 bis 4", "2 to 4", "2-4" or a single number
    const playerCountRange = /(\d+)\s*(?:bis|to|[-–])\s*(\d+)/i;
    const playerCountSingle = /^\s*(\d+)\s*$/;

    const inputString =
      element["card_Number Players"] ?? element["card_Anzahl Spieler"];

    if (inputString && typeof inputString === "string") {
      const range = inputString.match(playerCountRange);
      const single = inputString.match(playerCountSingle);

      if (range) {
        const minimumNumber = parseInt(range[1], 10);
        const maximumNumber = parseInt(range[2], 10);
        element["playerCountMin"] = minimumNumber;
        element["playerCountMax"] = maximumNumber;
      } else if (single) {
        const count = parseInt(single[1], 10);
        element["playerCountMin"] = count;
        element["playerCountMax"] = count;
      } else {
        logger.warn(
          `Unable to parse player count "${inputString}" for element ${element.name} (${element.identifier})`
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
    "card_Competences",
    "card_Schwerpunkt",
    "card_Focus",
    "card_Gruppierung",
    "card_grouping",
    "card_Vitality",
    "card_Experience",
    "card_Erfahrung",
    "card_Dynamik",
    "card_Energy",
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
      "beginner",
      "advanced",
      "intermediate",
      "pro",
      "professional",
      "Anfänger",
      "Fortgeschritten",
      "Profi",
    ],
    energy: [
      "ruhig",
      "lebhaft",
      "wild",
      "calm",
      "lively",
      "energetic",
    ],
  };
}
