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
import { createGraphIndex, getGraphIndex } from "./query/graph-query";
import type { GraphIndex } from "./query/graph-query";

const PORT = parseInt(process.env.PORT || "5000");

function jsonResponse(data: unknown, req: Request, status: number = 200): Response {
  const body = JSON.stringify(data, null, 2);
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  };

  if (req.headers.get("accept-encoding")?.includes("gzip")) {
    const compressed = gzipSync(new Uint8Array(Buffer.from(body)));
    headers["content-encoding"] = "gzip";
    return new Response(compressed, { headers, status });
  }

  return new Response(body, { headers, status });
}

function serveFile(filePath: string, req: Request, contentType: string = "application/json; charset=utf-8"): Response | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  if (contentType.startsWith("text/html")) {
    return new Response(content, {
      headers: { "content-type": contentType, "access-control-allow-origin": "*" },
    });
  }
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

let graphIndex: GraphIndex | null = null;
const graphPath = path.join(process.cwd(), "output", "graph.json");
try {
  const graphFile = Bun.file(graphPath);
  if (await graphFile.exists()) {
    const graph = await graphFile.json();
    graphIndex = createGraphIndex(graph);
    console.log(`Graph loaded: ${graphIndex.meta.nodeCount} nodes, ${graphIndex.meta.edgeCount} edges`);
  } else {
    console.log("No graph.json found — query API will return 503 until graph is derived");
  }
} catch (err) {
  console.error("Failed to load graph:", err);
}

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
    runNormalizationChain().catch((err) => {
      console.error(`[${new Date().toISOString()}] Normalization chain failed:`, err);
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Scrape failed:`, err);
  } finally {
    scrapeRunning = false;
  }
}

async function runNormalizationChain() {
  if (normalizeRunning) {
    console.log(`[${new Date().toISOString()}] Normalization already running — skipping chain.`);
    return;
  }
  normalizeRunning = true;
  console.log(`[${new Date().toISOString()}] Starting normalization chain (Stages 1, 3, 4 + graph)...`);

  try {
    await scanner.normalizeAll();
    console.log(`[${new Date().toISOString()}] Stage 1 (extraction) complete.`);
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Stage 1 failed:`, err.message);
  }

  try {
    const { normalizeVocabularyStage } = await import("./normalize/normalize");
    await normalizeVocabularyStage();
    console.log(`[${new Date().toISOString()}] Stage 3 (vocabulary) complete.`);
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Stage 3 (vocabulary) failed:`, err.message);
  }

  try {
    const { dedupElementsStage } = await import("./normalize/normalize");
    await dedupElementsStage();
    console.log(`[${new Date().toISOString()}] Stage 4 (dedup) complete.`);
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Stage 4 (dedup) failed:`, err.message);
  }

  try {
    const { writeGraph } = await import("./graph/derive");
    await writeGraph();
    console.log(`[${new Date().toISOString()}] Graph derivation complete.`);
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Graph derivation failed:`, err.message);
  }

  normalizeRunning = false;
  console.log(`[${new Date().toISOString()}] Normalization chain finished.`);
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

    if (url.pathname === "/" || url.pathname.endsWith(".html")) {
      const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
      const htmlPath = path.join(import.meta.dir, "..", "public", filePath);
      if (existsSync(htmlPath)) {
        const content = readFileSync(htmlPath, "utf-8");
        return new Response(content, {
          headers: { "content-type": "text/html; charset=utf-8", "access-control-allow-origin": "*" },
        });
      }
      return new Response("Not Found", { status: 404 });
    }

    if (url.pathname === "/status") {
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
        normalizedSources: normFiles.filter((f) => f.endsWith(".json") && !f.startsWith("dropped-")),
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

    if (url.pathname === "/api/vocabulary") {
      console.log(`[${new Date().toISOString()}] Manual vocabulary trigger...`);
      if (normalizeRunning) {
        return jsonResponse({ status: "normalization in progress — try again later" }, req);
      }
      normalizeRunning = true;
      import("./normalize/normalize").then(({ normalizeVocabularyStage }) => {
        return normalizeVocabularyStage();
      }).then(() => {
        normalizeRunning = false;
        console.log(`[${new Date().toISOString()}] Vocabulary normalization complete.`);
      }).catch((err: Error) => {
        normalizeRunning = false;
        console.error(`[${new Date().toISOString()}] Vocabulary normalization failed:`, err.message);
      });
      return jsonResponse({ status: "vocabulary normalization started" }, req);
    }

    if (url.pathname === "/api/dedup") {
      console.log(`[${new Date().toISOString()}] Manual dedup trigger...`);
      if (normalizeRunning) {
        return jsonResponse({ status: "normalization in progress — try again later" }, req);
      }
      normalizeRunning = true;
      import("./normalize/normalize").then(({ dedupElementsStage }) => {
        return dedupElementsStage();
      }).then(() => {
        normalizeRunning = false;
        console.log(`[${new Date().toISOString()}] Dedup complete.`);
      }).catch((err: Error) => {
        normalizeRunning = false;
        console.error(`[${new Date().toISOString()}] Dedup failed:`, err.message);
      });
      return jsonResponse({ status: "dedup started" }, req);
    }

    if (url.pathname === "/vocabulary.json") {
      const res = serveFile(path.join(process.cwd(), "output", "vocabulary.json"), req);
      if (res) return res;
      return jsonResponse({ error: "vocabulary.json not found — run vocabulary normalization first" }, req);
    }

    if (url.pathname === "/api/graph") {
      console.log(`[${new Date().toISOString()}] Manual graph derivation trigger...`);
      if (normalizeRunning) {
        return jsonResponse({ status: "normalization in progress — try again later" }, req);
      }
      normalizeRunning = true;
      import("./graph/derive").then(({ writeGraph }) => writeGraph()).then(() => {
        normalizeRunning = false;
        console.log(`[${new Date().toISOString()}] Graph derivation complete.`);
      }).catch((err: Error) => {
        normalizeRunning = false;
        console.error(`[${new Date().toISOString()}] Graph derivation failed:`, err.message);
      });
      return jsonResponse({ status: "graph derivation started" }, req);
    }

    if (url.pathname === "/graph.json") {
      const res = serveFile(path.join(process.cwd(), "output", "graph.json"), req);
      if (res) return res;
      return jsonResponse({ error: "graph.json not found — derive graph first via POST /api/graph" }, req);
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

    // ── Query API endpoints ──

    if (url.pathname === "/api/elements") {
      if (!graphIndex) return jsonResponse({ error: "Graph not available — run graph derivation first" }, req);
      const { queryElements } = await import("./query/graph-query");
      const filters: Record<string, any> = {};
      if (url.searchParams.has("difficulty")) filters.difficulty = url.searchParams.get("difficulty");
      if (url.searchParams.has("minPlayers")) filters.minPlayers = parseInt(url.searchParams.get("minPlayers")!);
      if (url.searchParams.has("maxPlayers")) filters.maxPlayers = parseInt(url.searchParams.get("maxPlayers")!);
      if (url.searchParams.has("minDuration")) filters.minDuration = parseInt(url.searchParams.get("minDuration")!);
      if (url.searchParams.has("maxDuration")) filters.maxDuration = parseInt(url.searchParams.get("maxDuration")!);
      if (url.searchParams.has("tag")) filters.tag = url.searchParams.get("tag");
      if (url.searchParams.has("mechanic")) filters.mechanic = url.searchParams.get("mechanic");
      if (url.searchParams.has("skill")) filters.skill = url.searchParams.get("skill");
      if (url.searchParams.has("excludeRequirements")) filters.excludeRequirements = url.searchParams.get("excludeRequirements")!.split(",");
      if (url.searchParams.has("requireRequirements")) filters.requireRequirements = url.searchParams.get("requireRequirements")!.split(",");
      if (url.searchParams.has("language")) filters.language = url.searchParams.get("language");
      if (url.searchParams.has("canonicalOnly")) filters.canonicalOnly = url.searchParams.get("canonicalOnly") === "true";
      if (url.searchParams.has("page")) filters.page = parseInt(url.searchParams.get("page")!);
      if (url.searchParams.has("limit")) filters.limit = parseInt(url.searchParams.get("limit")!);
      const result = queryElements(filters);
      return jsonResponse(result, req);
    }

    if (url.pathname.startsWith("/api/elements/") && url.pathname !== "/api/elements/") {
      if (!graphIndex) return jsonResponse({ error: "Graph not available — run graph derivation first" }, req);
      const parts = url.pathname.slice("/api/elements/".length).split("/");
      const id = parts[0];
      if (!id) return jsonResponse({ error: "Missing element ID" }, req);

      if (parts.length === 2 && parts[1] === "similar") {
        const { getSimilarElements } = await import("./query/graph-query");
        const limit = parseInt(url.searchParams.get("limit") || "10");
        const similar = getSimilarElements(id, limit);
        return jsonResponse({ results: similar }, req);
      }

      const { getElementDetail } = await import("./query/graph-query");
      const detail = getElementDetail(id);
      if (!detail) return jsonResponse({ error: `Element not found: ${id}` }, req);
      return jsonResponse(detail, req);
    }

    if (url.pathname === "/api/search" && req.method === "POST") {
      if (!graphIndex) return jsonResponse({ error: "Graph not available — run graph derivation first" }, req, 503);
      const { searchElements } = await import("./query/search");
      try {
        const body = await req.json();
        const { query } = body || {};
        if (!query || typeof query !== "string") {
          return jsonResponse({ error: "Missing or invalid 'query' field" }, req, 400);
        }
        const result = searchElements(query);
        return jsonResponse(result, req);
      } catch {
        return jsonResponse({ error: "Invalid request body" }, req, 400);
      }
    }

    if (url.pathname === "/api/workshop/plan" && req.method === "POST") {
      if (!graphIndex) return jsonResponse({ error: "Graph not available — run graph derivation first" }, req);
      const { planWorkshop } = await import("./query/workshop-planner");
      try {
        const body = await req.json();
        if (!body.duration || typeof body.duration !== "number" || body.duration <= 0) {
          return jsonResponse({ error: "Invalid request", details: "duration must be a positive number" }, req);
        }
        if (!body.players || typeof body.players !== "number" || body.players <= 0) {
          return jsonResponse({ error: "Invalid request", details: "players must be a positive number" }, req);
        }
        const plan = planWorkshop(body);
        return jsonResponse(plan, req);
      } catch {
        return jsonResponse({ error: "Invalid request body" }, req);
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
