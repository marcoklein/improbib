import fs from "node:fs/promises";
import path from "path";
import { appLogger } from "../../logger";

interface Page {
  url: string;
  html: string;
  date: Date;
}

const pendingFetches = new Map<string, Promise<Page>>();

const DEFAULT_DELAY_MS = 500;

let lastFetchTime = 0;
let backoffMs = 0;

export async function fetchAndCacheWebsite(
  url: string,
  options?: { delayMs?: number }
): Promise<Page> {
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  const logger = appLogger.getChild("fetchAndCacheWebsite");

  if (pendingFetches.has(url)) {
    return pendingFetches.get(url)!;
  }

  const cacheDir = path.join(process.cwd(), ".cache");
  const cacheFile = path.join(cacheDir, encodeURIComponent(url) + ".html");
  const cacheMetadataFile = path.join(
    cacheDir,
    encodeURIComponent(url) + ".metadata.json"
  );

  await fs.mkdir(cacheDir, { recursive: true });

  try {
    await fs.access(cacheFile);
    logger.debug(`Reading from cache: ${cacheFile}`);
    const cachedContent = await fs.readFile(cacheFile, "utf-8");
    const metadata = JSON.parse(await fs.readFile(cacheMetadataFile, "utf-8"));
    return {
      url: metadata.url,
      date: new Date(metadata.date),
      html: cachedContent,
    };
  } catch {}

  const promise = (async () => {
    let attempt = 0;

    while (true) {
      const now = Date.now();
      const wait = Math.max(0, delayMs + backoffMs - (now - lastFetchTime));
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
      lastFetchTime = Date.now();
      attempt++;

      logger.debug(`Fetching from URL: ${url} (attempt ${attempt})`);
      let response = await fetch(url, { redirect: "manual" });
      logger.debug(`Status: ${response.status}`);

      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("Location")
      ) {
        url = response.headers.get("Location")!;
        logger.debug(`Redirecting to: ${url}`);
        response = await fetch(url);
      }

      if (response.status === 429) {
        backoffMs += 500;
        const retryAfter = response.headers.get("Retry-After");
        const waitSec = retryAfter ? parseInt(retryAfter, 10) : 10;
        logger.warn(`Rate limited, waiting ${waitSec}s before retry ${attempt}: ${url}`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }

      backoffMs = Math.max(0, backoffMs - 100);

      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      }

      const html = await response.text();
      const date = new Date();

      await fs.writeFile(cacheFile, html, "utf-8");
      await fs.writeFile(
        cacheMetadataFile,
        JSON.stringify({ date, url }),
        "utf-8"
      );
      return { url, date, html };
    }
  })();

  pendingFetches.set(url, promise);
  return promise;
}
