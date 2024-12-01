import { appLogger } from "./logger";
import type { ElementType } from "./scraping/shared/element-type";
import { findTranslationId } from "./scraping/improwiki/find-translation-id";
import { tagTranslations } from "./scraping/improwiki/tag-translations";
import { tagTransformations } from "./scraping/shared/tag-transformations";

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

  output.meta.tagTranslations = tagTranslations;

  output.meta.untranslatedTags = [...untranslatedTags];
}
