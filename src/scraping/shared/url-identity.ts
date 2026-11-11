/**
 * Conservative identity key for a source URL.
 *
 * Only the parts that cannot change which page is meant are folded: scheme and
 * host are case-insensitive (RFC 3986) and a trailing slash on the path or a
 * fragment never selects a different page. Path case, path segments and the
 * query string are kept exactly as they are — they can be significant, and
 * neither the scraper nor the dedup pass may guess.
 *
 * Shared by the scraper (which keeps one element per URL) and the dedup stage
 * (which collapses same-page groups before any model runs), so both layers
 * agree on what "the same page" means.
 */
export function normalizeSourceUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.host = parsed.host.toLowerCase();
    parsed.hash = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    // Not a parseable URL (split children or older scrapes). Strip only what
    // is unambiguous and keep the rest byte-for-byte.
    return trimmed.replace(/#.*$/, "").replace(/\/$/, "");
  }
}
