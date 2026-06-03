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
      const files = serveDir(rawDir);
      const improbableExists = existsSync(path.join(storage, "output", "improbib.json"));

      return jsonResponse({
        storage,
        sources: files.filter((f) => f.endsWith(".json")),
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

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server listening on http://0.0.0.0:${PORT}`);

console.log(`[${new Date().toISOString()}] Running initial scrape in background...`);
runScrape();
