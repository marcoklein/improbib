import fs from "node:fs/promises";
import path from "path";
import { appLogger } from "./logger";

interface Page {
  url: string;
  html: string;
  date: Date;
}

export async function fetchAndCacheWebsite(url: string): Promise<Page> {
  const logger = appLogger.getChild("fetchAndCacheWebsite");

  logger.debug(`[fetchAndCacheWebsite] Fetching and caching: ${url}`);
  const cacheDir = path.join(process.cwd(), ".cache");
  const cacheFile = path.join(cacheDir, encodeURIComponent(url) + ".html");
  const cacheMetadataFile = path.join(
    cacheDir,
    encodeURIComponent(url) + ".metadata.json"
  );

  // Ensure the cache directory exists
  await fs.mkdir(cacheDir, { recursive: true });

  try {
    // Check if the file exists in the cache
    await fs.access(cacheFile);
    logger.debug(`Reading from cache: ${cacheFile}`);
    const cachedContent = await fs.readFile(cacheFile, "utf-8");
    const metadata = JSON.parse(await fs.readFile(cacheMetadataFile, "utf-8"));
    logger.debug("Found in cache. Returning...");
    return {
      url: metadata.url,
      date: new Date(metadata.date),
      html: cachedContent,
    };
  } catch (err) {
    // File does not exist, fetch the content from the URL
    logger.debug(`Fetching from URL: ${url}`);
    let response = await fetch(url, { redirect: "manual" });
    logger.debug(`Status: ${response.status}`);

    // Handle redirection
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("Location")
    ) {
      url = response.headers.get("Location")!;
      logger.debug(`Redirecting to: ${url}`);
      response = await fetch(url);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const html = await response.text();
    const date = new Date();

    // Save the fetched content to the cache
    await fs.writeFile(cacheFile, html, "utf-8");
    await fs.writeFile(
      cacheMetadataFile,
      JSON.stringify({ date, url }),
      "utf-8"
    );
    return {
      url,
      date,
      html,
    };
  }
}
