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
  /**
   * Named creators as attributed by the source. These are usually site
   * accounts (e.g. "learnimprov"), not natural persons; empty when the source
   * does not attribute anyone.
   */
  authors?: string[];
  linksInHtmlContent?: string[];
  /** Normalized content published alongside the source element (v2 artifact). */
  normalized?: object;
  /** Work id shared by all source elements that are the same work. */
  canonicalId?: string;
  /** Translation group shared by the DE and EN work. */
  translationId?: string;
  /** Work id of the parent element, when this element is a variation. */
  variationOf?: string;
  workKind?: "element" | "variation";
  isCanonicalMember?: boolean;
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
} & Record<string, string | string[] | number | boolean | object | undefined>;
