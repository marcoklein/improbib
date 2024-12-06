import { appLogger } from "../../logger";
import { findTranslationId } from "../improwiki/find-translation-id";
import { tagTranslations } from "../improwiki/tag-translations";
import type { ElementType } from "./element-type";
import { tagTransformations } from "./tag-transformations";

/**
 * Creates a new set of translated tags.
 *
 * @param output
 */
export function transformAndTranslateTags(output: {
  meta: Record<string, any>;
  elements: ElementType[];
}) {
  const { elements } = output;
  const logger = appLogger.getChild("translateTags");

  logger.info("CALL translateTag");
  const untranslatedTags = new Set<string>();

  for (const element of elements) {
    element.cleanTags = element.tags.flatMap(
      (tag) =>
        tagTransformations[tag as keyof typeof tagTransformations] || [tag]
    );
  }

  // created tagIds
  for (const element of elements) {
    element["tagIds"] = [
      ...new Set(
        (element.cleanTags as string[]).map((tag) => {
          const translation = findTranslationId(tag);
          if (!translation) {
            logger.warn(
              "No translation id found for {tag} for element id {elementId}",
              { tag, elementId: element.identifier }
            );
            untranslatedTags.add(tag);
          }
          return translation ?? `no_translation_id_${tag}`;
        })
      ),
    ];
  }

  // add translated tags to element
  for (const element of elements) {
    element["translatedTags"] = (element.tagIds as string[]).map(
      (tagId) =>
        tagTranslations[tagId as keyof typeof tagTranslations][
          element.languageCode as "de" | "en"
        ]
    );
    element["translatedTags"] = [...new Set(element["translatedTags"])];
  }

  output.meta.tagTranslations = tagTranslations;
  output.meta.untranslatedTags = [...untranslatedTags];
}
