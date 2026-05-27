import { load } from "cheerio";

export type SitemapEntry = {
  loc: string;
  lastmod: string | null;
};

export function parseSitemapXml(xml: string): SitemapEntry[] {
  const $ = load(xml, { xml: true });
  const entries: SitemapEntry[] = [];

  $("urlset > url, sitemapindex > sitemap").each((_, el) => {
    const loc = $(el).find("loc").first().text().trim();
    const lastmod = $(el).find("lastmod").first().text().trim() || null;
    if (loc) {
      entries.push({ loc, lastmod });
    }
  });

  return entries;
}

export function buildSitemapMap(
  entries: SitemapEntry[]
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const entry of entries) {
    map.set(entry.loc, entry.lastmod);
  }
  return map;
}
