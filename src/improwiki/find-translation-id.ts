import { combinedTags } from "./combined-tags";

export function findTranslationId(text: string): string | null {
  if ((combinedTags as any)[text]) {
    return text;
  }
  for (const [key, value] of Object.entries(combinedTags)) {
    if (
      value.en.toLowerCase() === text.toLowerCase() ||
      value.de.toLowerCase() === text.toLowerCase()
    ) {
      return key;
    }
  }

  return null;
}
