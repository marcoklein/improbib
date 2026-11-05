import fs from "node:fs/promises";
import path from "path";
import { appLogger } from "../../logger";

interface Page {
  url: string;
  html: string;
  date: Date;
}

export interface FetchAndCacheOptions {
  delayMs?: number;
  /**
   * A cached entry older than this is treated as missing.
   *
   * Defaults to six hours: the daily scrape always revalidates everything it
   * touches, while a second run within the same half-day can reuse what the
   * first one just fetched. Pass `Number.POSITIVE_INFINITY` to read the cache
   * regardless of age (offline re-parse).
   */
  maxAgeMs?: number;
  /**
   * Ignore any cached copy and fetch from the network.
   */
  forceRefresh?: boolean;
  /**
   * Cache directory. Defaults to `.cache` in the working directory; tests
   * point this at a temporary directory.
   */
  cacheDir?: string;
}

const pendingFetches = new Map<string, Promise<Page>>();

const DEFAULT_DELAY_MS = 500;

/**
 * Must stay below the 24h interval of the daily scrape, otherwise entries
 * written yesterday are still considered fresh when today's run starts.
 */
export const DEFAULT_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

let lastFetchTime = 0;
let backoffMs = 0;

async function readCacheEntry(
  cacheFile: string,
  cacheMetadataFile: string
): Promise<Page | undefined> {
  try {
    const [html, metadataRaw] = await Promise.all([
      fs.readFile(cacheFile, "utf-8"),
      fs.readFile(cacheMetadataFile, "utf-8"),
    ]);
    const metadata = JSON.parse(metadataRaw);
    const date = new Date(metadata.date);

    if (typeof metadata.url !== "string" || Number.isNaN(date.getTime())) {
      return undefined;
    }

    return { url: metadata.url, date, html };
  } catch {
    return undefined;
  }
}

async function fetchPage(
  url: string,
  options?: FetchAndCacheOptions
): Promise<Page> {
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS;
  const logger = appLogger.getChild("fetchAndCacheWebsite");

  const cacheDir = options?.cacheDir ?? path.join(process.cwd(), ".cache");
  const cacheFile = path.join(cacheDir, encodeURIComponent(url) + ".html");
  const cacheMetadataFile = path.join(
    cacheDir,
    encodeURIComponent(url) + ".metadata.json"
  );

  if (!options?.forceRefresh) {
    const cached = await readCacheEntry(cacheFile, cacheMetadataFile);
    const ageMs = cached ? Date.now() - cached.date.getTime() : undefined;

    if (cached && ageMs !== undefined && ageMs <= maxAgeMs) {
      logger.debug(`Reading from cache: ${cacheFile} (age ${ageMs} ms)`);
      return cached;
    }

    if (cached) {
      logger.info(`Cached copy is stale, fetching again: ${url}`, {
        ageMs,
        maxAgeMs,
      });
    }
  }

  await fs.mkdir(cacheDir, { recursive: true });

  let attempt = 0;
  let requestUrl = url;

  while (true) {
    const now = Date.now();
    const wait = Math.max(0, delayMs + backoffMs - (now - lastFetchTime));
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    lastFetchTime = Date.now();
    attempt++;

    logger.debug(`Fetching from URL: ${requestUrl} (attempt ${attempt})`);
    let response = await fetch(requestUrl, { redirect: "manual" });
    logger.debug(`Status: ${response.status}`);

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("Location")
    ) {
      requestUrl = response.headers.get("Location")!;
      logger.debug(`Redirecting to: ${requestUrl}`);
      response = await fetch(requestUrl);
    }

    if (response.status === 429) {
      backoffMs += 500;
      const retryAfter = response.headers.get("Retry-After");
      const waitSec = retryAfter ? parseInt(retryAfter, 10) : 10;
      logger.warn(
        `Rate limited, waiting ${waitSec}s before retry ${attempt}: ${requestUrl}`
      );
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    backoffMs = Math.max(0, backoffMs - 100);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${requestUrl}: ${response.statusText}`
      );
    }

    const html = await response.text();
    const date = new Date();

    await fs.writeFile(cacheFile, html, "utf-8");
    await fs.writeFile(
      cacheMetadataFile,
      JSON.stringify({ date, url: requestUrl }),
      "utf-8"
    );
    return { url: requestUrl, date, html };
  }
}

export async function fetchAndCacheWebsite(
  url: string,
  options?: FetchAndCacheOptions
): Promise<Page> {
  // Deduplicate concurrent requests for the same URL. Only in-flight requests
  // are shared: a long-running process scrapes again the next day and must not
  // keep serving yesterday's in-memory copy.
  const pending = pendingFetches.get(url);
  if (pending) {
    return pending;
  }

  const promise = fetchPage(url, options);
  pendingFetches.set(url, promise);

  try {
    return await promise;
  } finally {
    pendingFetches.delete(url);
  }
}
