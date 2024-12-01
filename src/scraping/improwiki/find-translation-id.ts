import { tagTranslations } from "./tag-translations";

export function findTranslationId(text: string): string | null {
  if ((tagTranslations as any)[text]) {
    return text;
  }
  for (const [key, value] of Object.entries(tagTranslations)) {
    if (
      value.en.toLowerCase() === text.toLowerCase() ||
      value.de.toLowerCase() === text.toLowerCase()
    ) {
      return key;
    }
  }

  return null;
}
