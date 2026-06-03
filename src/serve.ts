import { mkdir } from "node:fs/promises";

const storagePath = process.env.STORAGE_PATH || process.cwd();
await mkdir(storagePath, { recursive: true });
process.chdir(storagePath);

import { Improbib } from ".";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "path";

const PORT = parseInt(process.env.PORT || "5000");

function jsonResponse(data: unknown, req: Request): Response {
  const body = JSON.stringify(data, null, 2);
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  };

  if (req.headers.get("accept-encoding")?.includes("gzip")) {
    const compressed = gzipSync(Buffer.from(body));
    headers["content-encoding"] = "gzip";
    return new Response(compressed, { headers });
  }

  return new Response(body, { headers });
}

function serveFile(filePath: string, req: Request): Response | null {
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, "utf-8");
  return jsonResponse(JSON.parse(content), req);
}

function serveDir(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];

  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((d: { isFile: () => boolean }) => d.isFile())
    .map((d: { name: string }) => d.name);
}

const scanner = new Improbib();
await scanner.enableLogging();

async function runScrape() {
  console.log(`[${new Date().toISOString()}] Starting scrape...`);
  try {
    await scanner.scrape();
    console.log(`[${new Date().toISOString()}] Scrape complete.`);
    console.log(`[${new Date().toISOString()}] Run normalization: bun run src/normalize/normalize.ts`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Scrape failed:`, err);
  }
}

let lastRunDate: string | null = null;

setInterval(async () => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (now.getUTCHours() === 4 && lastRunDate !== today) {
    lastRunDate = today;
    await runScrape();
  }
}, 60_000);

console.log(`[${new Date().toISOString()}] Starting HTTP server on port ${PORT}...`);
Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/" || url.pathname === "/status") {
      const storage = process.env.STORAGE_PATH || process.cwd();
      const rawDir = path.join(storage, "output", "raw");
      const normDir = path.join(storage, "output", "normalized");
      const files = serveDir(rawDir);
      const normFiles = serveDir(normDir);
      const improbableExists = existsSync(path.join(storage, "output", "improbib.json"));

      return jsonResponse({
        storage,
        sources: files.filter((f) => f.endsWith(".json")),
        normalizedSources: normFiles.filter((f) => f.endsWith(".json")),
        improbableBuilt: improbableExists,
      }, req);
    }

    if (url.pathname === "/improbib.json") {
      const res = serveFile(path.join(process.cwd(), "output", "improbib.json"), req);
      if (res) return res;
    }

    if (url.pathname.startsWith("/raw/")) {
      const fileName = path.basename(url.pathname);
      const res = serveFile(path.join(process.cwd(), "output", "raw", fileName), req);
      if (res) return res;
    }

    if (url.pathname.startsWith("/normalized/")) {
      const fileName = path.basename(url.pathname);
      const res = serveFile(path.join(process.cwd(), "output", "normalized", fileName), req);
      if (res) return res;
    }

    if (url.pathname === "/api/normalize") {
      console.log(`[${new Date().toISOString()}] Manual normalize trigger...`);
      scanner.normalizeAll().then(() => {
        console.log(`[${new Date().toISOString()}] Normalize complete.`);
      }).catch((err: Error) => {
        console.error(`[${new Date().toISOString()}] Normalize failed:`, err.message, err.stack?.slice(0, 500));
      });
      return jsonResponse({ status: "normalization started" }, req);
    }

    if (url.pathname === "/api/test-normalize") {
      try {
        const { createOpencodeGoClient } = await import("./normalize/llm-client");
        const client = createOpencodeGoClient();
        const result = await client.normalizeElement("Test Game", "<p>Players form a circle. One starts a word, the next continues.</p>", "en");
        return jsonResponse({ ok: true, result }, req);
      } catch (err: any) {
        return jsonResponse({ ok: false, error: err.message, stack: err.stack?.slice(0, 500) }, req);
      }
    }

    if (url.pathname === "/api/opencode-check") {
      const result = Bun.spawnSync(["opencode", "--version"], { stdout: "pipe", stderr: "pipe" });
      return jsonResponse({
        opencode: result.exitCode === 0,
        version: new TextDecoder().decode(result.stdout).trim() || null,
        error: new TextDecoder().decode(result.stderr).trim() || null,
        authExists: existsSync(path.join(process.env.HOME || "/root", ".local/share/opencode/auth.json")),
      }, req);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server listening on http://0.0.0.0:${PORT}`);

console.log(`[${new Date().toISOString()}] Running initial scrape in background...`);
runScrape();
