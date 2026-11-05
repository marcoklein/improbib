export type ElementType = {
  /** Url of the element that it got fetched from. */
  url: string;
  tags: string[];
  identifier: string;
  name: string;
  sourceName: string;
  languageCode: string;
  translationLinkEn?: string;
  translationLinkDe?: string;
  translationLinkEnIdentifier?: string;
  translationLinkDeIdentifier?: string;
  markdown?: string;
  htmlContent?: string;
  htmlContentPath?: string;
  fetchedAt?: string;
  lastUpdate?: string;
  lastModified?: string;
  linksInHtmlContent?: string[];
  /** Source taxonomies that are kept separate in the raw layer (ADR-0004). */
  categories?: string[];
  postTags?: string[];
  /** Derived by `transformAndTranslateTags`. */
  cleanTags?: string[];
  /** Canonical, language-neutral concept ids. */
  tagIds?: string[];
  /** Localized labels, index-aligned with `tagIds`. */
  translatedTags?: string[];
  playerCountMin?: number;
  playerCountMax?: number;
  type?: string;
  licenseName?: string;
  licenseSpdxIdentifier?: string;
  licenseUrl?: string;
} & Record<string, string | string[] | number | undefined>;
