import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fetchAndCacheWebsite } from "./fetch-and-cache-website";

const URL = "https://example.com/page";

const cacheDirs: string[] = [];
let fetchSpy: ReturnType<typeof spyOn> | undefined;

afterEach(async () => {
  fetchSpy?.mockRestore();
  fetchSpy = undefined;
  await Promise.all(
    cacheDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function newCacheDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "improbib-cache-"));
  cacheDirs.push(dir);
  return dir;
}

function respondWith(html: string, init?: ResponseInit) {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(html, { status: 200, ...init })
  );
  return fetchSpy;
}

function cachePaths(cacheDir: string) {
  const encoded = encodeURIComponent(URL);
  return {
    html: path.join(cacheDir, `${encoded}.html`),
    metadata: path.join(cacheDir, `${encoded}.metadata.json`),
  };
}

async function writeCacheEntry(
  cacheDir: string,
  html: string,
  date: Date
) {
  const paths = cachePaths(cacheDir);
  await writeFile(paths.html, html, "utf-8");
  await writeFile(
    paths.metadata,
    JSON.stringify({ url: URL, date }),
    "utf-8"
  );
}

describe("fetchAndCacheWebsite", () => {
  test("fetches and stores the page in the cache", async () => {
    const cacheDir = await newCacheDir();
    const spy = respondWith("<html>fresh</html>");

    const page = await fetchAndCacheWebsite(URL, { delayMs: 0, cacheDir });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(page.html).toBe("<html>fresh</html>");
    const paths = cachePaths(cacheDir);
    expect(await readFile(paths.html, "utf-8")).toBe("<html>fresh</html>");
    const metadata = JSON.parse(await readFile(paths.metadata, "utf-8"));
    expect(metadata.url).toBe(URL);
  });

  test("serves a cache entry younger than maxAgeMs without fetching", async () => {
    const cacheDir = await newCacheDir();
    await writeCacheEntry(cacheDir, "<html>cached</html>", new Date());

    fetchSpy = spyOn(globalThis, "fetch");

    const page = await fetchAndCacheWebsite(URL, { delayMs: 0, cacheDir });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(page.html).toBe("<html>cached</html>");
  });

  test("re-fetches when the cached copy is older than maxAgeMs", async () => {
    const cacheDir = await newCacheDir();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await writeCacheEntry(cacheDir, "<html>old</html>", twoDaysAgo);
    const spy = respondWith("<html>new</html>");

    const page = await fetchAndCacheWebsite(URL, {
      delayMs: 0,
      cacheDir,
      maxAgeMs: 6 * 60 * 60 * 1000,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(page.html).toBe("<html>new</html>");
    expect(await readFile(cachePaths(cacheDir).html, "utf-8")).toBe(
      "<html>new</html>"
    );
  });

  test("keeps serving an old cache entry with maxAgeMs Infinity", async () => {
    const cacheDir = await newCacheDir();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await writeCacheEntry(cacheDir, "<html>old</html>", twoDaysAgo);

    fetchSpy = spyOn(globalThis, "fetch");

    const page = await fetchAndCacheWebsite(URL, {
      delayMs: 0,
      cacheDir,
      maxAgeMs: Number.POSITIVE_INFINITY,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(page.html).toBe("<html>old</html>");
  });

  test("forceRefresh ignores a fresh cache entry", async () => {
    const cacheDir = await newCacheDir();
    await writeCacheEntry(cacheDir, "<html>cached</html>", new Date());
    const spy = respondWith("<html>forced</html>");

    const page = await fetchAndCacheWebsite(URL, {
      delayMs: 0,
      cacheDir,
      forceRefresh: true,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(page.html).toBe("<html>forced</html>");
  });

  test("treats metadata it cannot parse as a cache miss", async () => {
    const cacheDir = await newCacheDir();
    const paths = cachePaths(cacheDir);
    await writeFile(paths.html, "<html>orphan</html>", "utf-8");
    await writeFile(paths.metadata, "not json", "utf-8");
    const spy = respondWith("<html>fresh</html>");

    const page = await fetchAndCacheWebsite(URL, { delayMs: 0, cacheDir });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(page.html).toBe("<html>fresh</html>");
  });

  test("does not cache a failed response", async () => {
    const cacheDir = await newCacheDir();
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 500, statusText: "Internal Server Error" })
    );

    await expect(
      fetchAndCacheWebsite(URL, { delayMs: 0, cacheDir })
    ).rejects.toThrow("Failed to fetch");

    await expect(readFile(cachePaths(cacheDir).html, "utf-8")).rejects.toThrow();
  });

  test("deduplicates concurrent requests for the same URL", async () => {
    const cacheDir = await newCacheDir();
    const spy = respondWith("<html>once</html>");

    const [first, second] = await Promise.all([
      fetchAndCacheWebsite(URL, { delayMs: 0, cacheDir }),
      fetchAndCacheWebsite(URL, { delayMs: 0, cacheDir }),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(first.html).toBe("<html>once</html>");
    expect(second.html).toBe("<html>once</html>");
  });

  test("fetches again on a later call after the in-flight entry is gone", async () => {
    const cacheDir = await newCacheDir();
    respondWith("<html>first</html>");
    await fetchAndCacheWebsite(URL, {
      delayMs: 0,
      cacheDir,
      maxAgeMs: Number.POSITIVE_INFINITY,
    });

    // A different response proves the second call did not reuse the resolved
    // promise from the first call.
    respondWith("<html>second</html>");
    const page = await fetchAndCacheWebsite(URL, {
      delayMs: 0,
      cacheDir,
      forceRefresh: true,
    });

    expect(page.html).toBe("<html>second</html>");
  });
});
