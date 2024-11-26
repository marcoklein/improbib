export type ElementType = {
  /**
   * Url of the element that it got fetched from.
   */
  url: string;
  tags: string[];
  identifier: string;
  name: string;
  sourceName: string;
  languageCode: string;
  translationLinkEn?: string;
  translationLinkDe?: string;
} & Record<string, string | string[] | number | undefined>;
