import { mkdir } from "node:fs/promises";

const storagePath = process.env.STORAGE_PATH || process.cwd();
await mkdir(storagePath, { recursive: true });
process.chdir(storagePath);

const GIT_REV = process.env.GIT_REV || "unknown";

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

function rawSourcesExist(): boolean {
  const sources = ["improwiki", "learnimprov", "ircwiki"];
  for (const src of sources) {
    if (!existsSync(path.join(process.cwd(), "output", "raw", `${src}.json`))) return false;
  }
  return true;
}

const scanner = new Improbib();
await scanner.enableLogging();

let scrapeRunning = false;
let normalizeRunning = false;

async function runScrape(force: boolean = false) {
  if (!force && rawSourcesExist()) {
    console.log(`[${new Date().toISOString()}] Raw sources already exist — skipping scrape. Use ?force=true to re-scrape.`);
    return;
  }
  if (scrapeRunning) {
    console.log(`[${new Date().toISOString()}] Scrape already running — skipping.`);
    return;
  }
  if (normalizeRunning) {
    console.log(`[${new Date().toISOString()}] Normalization in progress — skipping scrape.`);
    return;
  }
  scrapeRunning = true;
  console.log(`[${new Date().toISOString()}] Starting scrape${force ? " (forced)" : ""}...`);
  try {
    await scanner.scrape();
    console.log(`[${new Date().toISOString()}] Scrape complete.`);
    console.log(`[${new Date().toISOString()}] To normalize: curl -X POST https://improbib.host.impromat.app:5000/api/normalize`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Scrape failed:`, err);
  } finally {
    scrapeRunning = false;
  }
}

let lastRunDate: string | null = null;

setInterval(async () => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (now.getUTCHours() === 4 && lastRunDate !== today) {
    lastRunDate = today;
    await runScrape(true);
  }
}, 60_000);

console.log(`[${new Date().toISOString()}] Starting HTTP server on port ${PORT}...`);
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/" || url.pathname === "/status") {
      const storage = process.env.STORAGE_PATH || process.cwd();
      const rawDir = path.join(storage, "output", "raw");
      const normDir = path.join(storage, "output", "normalized");
      const files = serveDir(rawDir);
      const normFiles = serveDir(normDir);

      let normalizeProgress = null;
      try {
        const { getNormalizeProgress } = await import("./normalize/normalize");
        normalizeProgress = getNormalizeProgress();
      } catch {}

      return jsonResponse({
        storage,
        version: GIT_REV,
        sources: files.filter((f) => f.endsWith(".json")),
        normalizedSources: normFiles.filter((f) => f.endsWith(".json")),
        normalizeProgress,
        scrapeRunning,
        normalizeRunning,
      }, req);
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

    if (url.pathname === "/api/version") {
      return jsonResponse({ version: GIT_REV }, req);
    }

    if (url.pathname === "/api/scrape") {
      const force = url.searchParams.get("force") === "true";
      console.log(`[${new Date().toISOString()}] Manual scrape trigger${force ? " (forced)" : ""}...`);
      runScrape(force).catch((err: Error) => {
        console.error(`[${new Date().toISOString()}] Manual scrape failed:`, err.message);
      });
      return jsonResponse({ status: "scrape started", force }, req);
    }

    if (url.pathname === "/api/normalize") {
      const maxElements = url.searchParams.get("max") ? parseInt(url.searchParams.get("max")!) : undefined;
      const source = url.searchParams.get("source") || undefined;
      const stagesParam = url.searchParams.get("stages");
      const stages = stagesParam ? stagesParam.split(",").map(Number) : undefined;
      console.log(`[${new Date().toISOString()}] Manual normalize trigger${maxElements ? ` (max=${maxElements})` : ""}${source ? ` (source=${source})` : ""}${stages ? ` (stages=${stages})` : ""}...`);
      if (normalizeRunning) {
        return jsonResponse({ status: "normalization already running" }, req);
      }
      normalizeRunning = true;
      scanner.normalizeAll({ maxElements, source, stages }).then(() => {
        normalizeRunning = false;
        console.log(`[${new Date().toISOString()}] Normalize complete.`);
      }).catch((err: Error) => {
        normalizeRunning = false;
        console.error(`[${new Date().toISOString()}] Normalize failed:`, err.message, err.stack?.slice(0, 1000));
      });
      return jsonResponse({ status: "normalization started", maxElements: maxElements || null, source: source || null }, req);
    }

    if (url.pathname === "/api/test-normalize") {
      try {
        const { createOpencodeGoClient } = await import("./normalize/llm-client");
        const client = createOpencodeGoClient();
        const result = await client.normalizeElement("Test Game", "<p>Players form a circle. One starts a word, the next continues.</p>", "en", ["game"]);
        return jsonResponse({ ok: true, result }, req);
      } catch (err: any) {
        return jsonResponse({ ok: false, error: err.message }, req);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server listening on http://0.0.0.0:${PORT}`);

console.log(`[${new Date().toISOString()}] Checking for existing raw sources...`);
if (rawSourcesExist()) {
  console.log(`[${new Date().toISOString()}] Raw sources found — skipping initial scrape.`);
} else {
  console.log(`[${new Date().toISOString()}] No raw sources found — running initial scrape...`);
  runScrape().catch((err) => console.error(`[${new Date().toISOString()}] Initial scrape failed:`, err));
}
