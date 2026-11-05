import { appLogger } from "../../logger";
import type { ElementType } from "./element-type";
import { labelFor, resolveTagIds } from "./tag-vocabulary";
import { tagTranslations } from "./tag-translations";

/**
 * Derives the canonical `tagIds` for every element and the localized
 * `translatedTags` shown to users.
 *
 * Invariants:
 * - `tagIds` only contains keys of `tagTranslations`
 * - `translatedTags[i]` is the label of `tagIds[i]` in the element's language
 * - unknown source labels are reported in `meta.unmappedTags`, never emitted
 */
export function transformAndTranslateTags(output: {
  meta: Record<string, any>;
  elements: ElementType[];
}) {
  const { elements } = output;
  const logger = appLogger.getChild("translateTags");

  logger.info("CALL translateTag");
  const unmappedTags = new Map<string, number>();

  for (const element of elements) {
    const { ids, unmapped } = resolveTagIds(element.tags ?? []);

    for (const label of unmapped) {
      unmappedTags.set(label, (unmappedTags.get(label) ?? 0) + 1);
      logger.debug("No canonical concept for raw tag {tag} on element {id}", {
        tag: label,
        id: element.identifier,
      });
    }

    element.tagIds = ids;
    element.translatedTags = ids.map((id) =>
      labelFor(id, element.languageCode)
    );
  }

  output.meta.tagTranslations = tagTranslations;
  output.meta.tagVocabulary = Object.fromEntries(
    Object.entries(tagTranslations).map(([id, { de, en, axis }]) => [
      id,
      { de, en, axis },
    ])
  );
  output.meta.untranslatedTags = [...unmappedTags.keys()].sort();
  output.meta.untranslatedTagCounts = Object.fromEntries(
    [...unmappedTags.entries()].sort((a, b) => b[1] - a[1])
  );
}
