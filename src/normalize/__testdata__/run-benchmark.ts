import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import TurndownService from "turndown";
import { goldenSet } from "./golden-set";
import type { GoldenOutput } from "./golden-set";
import { callApi } from "../llm-client";

const turndown = new TurndownService({ headingStyle: "atx" });

const MODELS = [
  { id: "pro" as const, model: "deepseek-v4-pro", label: "deepseek-v4-pro" },
  { id: "flash" as const, model: "deepseek-v4-flash", label: "deepseek-v4-flash" },
];

function getApiKey(): string {
  if (process.env.OPENCODE_GO_API_KEY) return process.env.OPENCODE_GO_API_KEY;
  try {
    const auth = JSON.parse(
      readFileSync(join(homedir(), ".local/share/opencode/auth.json"), "utf-8"),
    );
    return auth["opencode-go"]?.key || "";
  } catch {
    console.error("No API key found. Set OPENCODE_GO_API_KEY or ensure ~/.local/share/opencode/auth.json exists.");
    process.exit(1);
  }
}

function buildBatchPrompt(): string {
  let prompt = `Extract structured fields from each of the ${goldenSet.length} improv elements below. Return a JSON array of ${goldenSet.length} objects — no explanations, no markdown, no backticks.

For each element return:
{
  "id": "element-id",
  "description": "1-3 sentence summary in the element's language",
  "howToPlay": "numbered step-by-step instructions. Use null ONLY if this is a theoretical concept page with no actionable steps (e.g. an improv theory article). ALL games, exercises, warm-ups, show formats, and handles MUST have step-by-step howToPlay instructions.",
  "variations": [{"name": "variation name", "description": "brief description of the variation"}],
  "tips": ["tip", "another tip"],
  "referencedElements": ["name of another improv element mentioned"]
}

Important: 
- howToPlay is null ONLY for pure theory/concept pages (like "Game" or "Status" as improv concepts).
- Every game, exercise, warmup, show format, or handle MUST have numbered howToPlay steps extracted from the markdown.
- For ask-for prompts (element names that are questions), howToPlay should be null and description should note it's an audience prompt.

Elements to extract:
`;

  for (const e of goldenSet) {
    const md = turndown.turndown(e.input.htmlContent).trim();
    const lang = e.input.languageCode === "de" ? "German" : "English";
    prompt += `
---
ID: ${e.id}
Name: ${e.input.name}
Language: ${lang}
Source: ${e.input.sourceName}
Markdown:
${md || "(blank — this is an audience ask-for prompt, not a game)"}
---`;
  }

  prompt += `\n\nReturn EXACTLY a JSON array of ${goldenSet.length} objects. No other text.`;
  return prompt;
}

function extractJsonArray(text: string): any[] {
  const mdMatch = text.match(/```(?:json)?\s*\n?(\[[\s\S]*?\])\n?```/);
  const jsonStr = mdMatch ? mdMatch[1].trim() : text.trim();
  const arrMatch = jsonStr.match(/\[[\s\S]*\]/);
  const finalStr = arrMatch ? arrMatch[0] : jsonStr;
  return JSON.parse(finalStr);
}

async function callModel(model: string, prompt: string): Promise<string> {
  const apiKey = process.env.OPENCODE_GO_API_KEY
    || process.env.OPENCODE_API_KEY
    || (() => {
        try { return JSON.parse(readFileSync(join(homedir(), ".local/share/opencode/auth.json"), "utf-8"))["opencode-go"]?.key || ""; }
        catch { return ""; }
      })();

  return callApi(apiKey, model, prompt);
}

interface Result {
  elementId: string;
  name: string;
  category: string;
  source: string;
  lang: string;
  expected: GoldenOutput;
  actual: GoldenOutput | null;
  error?: string;
  scores: {
    descOk: boolean;
    howToPlayOk: boolean;
    varCountMatch: boolean;
    varRecall: number;
    tipRecall: number;
    refRecall: number;
  };
}

function normalizeOutput(raw: any): GoldenOutput {
  return {
    description: String(raw.description || ""),
    howToPlay: raw.howToPlay ?? null,
    variations: (raw.variations || []).map((v: any) => ({
      name: String(v.name || ""),
      description: String(v.description || ""),
    })),
    tips: (raw.tips || []).map(String),
    referencedElements: (raw.referencedElements || []).map(String),
  };
}

function scoreResult(expected: GoldenOutput, actual: GoldenOutput) {
  const descOk = actual.description.length >= 20;
  const howToPlayOk = expected.howToPlay === null
    ? actual.howToPlay === null
    : actual.howToPlay !== null && (actual.howToPlay as string).length >= 10;

  const expectedVarNames = new Set(expected.variations.map((v) => v.name.toLowerCase()));
  const actualVarNames = new Set(actual.variations.map((v) => v.name.toLowerCase()));
  const varRecall = expectedVarNames.size === 0
    ? 1.0
    : [...expectedVarNames].filter((n) => actualVarNames.has(n)).length / expectedVarNames.size;

  const expectedTipWords = expected.tips.flatMap((t) => t.toLowerCase().split(/\s+/));
  const actualTipText = actual.tips.join(" ").toLowerCase();
  const tipRecall = expected.tips.length === 0
    ? 1.0
    : expected.tips.filter((t) => {
        const words = t.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        return words.filter((w) => actualTipText.includes(w)).length / Math.max(words.length, 1) > 0.5;
      }).length / expected.tips.length;

  const expectedRefs = new Set(expected.referencedElements.map((r) => r.toLowerCase()));
  const actualRefs = new Set(actual.referencedElements.map((r) => r.toLowerCase()));
  const refRecall = expectedRefs.size === 0
    ? 1.0
    : [...expectedRefs].filter((r) => actualRefs.has(r)).length / expectedRefs.size;

  const varCountMatch = Math.abs(actual.variations.length - expected.variations.length) <= 2;

  return { descOk, howToPlayOk, varCountMatch, varRecall, tipRecall, refRecall };
}

async function getOpencodeVersion(): Promise<string> {
  try {
    const proc = Bun.spawn(["opencode", "--version"], { stdout: "pipe" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return out.trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  const targetModel = Bun.argv[2];

  const modelsToRun = targetModel
    ? MODELS.filter((m) => m.id === targetModel)
    : MODELS;

  if (targetModel && modelsToRun.length === 0) {
    console.error(`Unknown model: ${targetModel}. Options: ${MODELS.map((m) => m.id).join(", ")}`);
    process.exit(1);
  }

  const opencodeVersion = await getOpencodeVersion();
  const runTimestamp = new Date().toISOString();
  const runId = runTimestamp.replace(/[:.]/g, "-");

  console.log(`API Key: ${getApiKey().slice(0, 8)}...`);
  console.log(`OpenCode: ${opencodeVersion}`);
  console.log(`Run:      ${runTimestamp}`);
  console.log(`Running ${modelsToRun.length} model(s) against ${goldenSet.length} golden elements\n`);

  const allResults: Record<string, Result[]> = {};

  for (const m of modelsToRun) {
    const prompt = buildBatchPrompt();
    console.log(`${m.label.toUpperCase()} — prompt: ${prompt.length} chars`);

    const start = Date.now();
    let rawOutput: string;
    try {
      rawOutput = await callModel(m.model, prompt);
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}`);
      continue;
    }
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  Completed in ${elapsed}s (${rawOutput.length} chars output)`);

    let outputs: any[];
    try {
      outputs = extractJsonArray(rawOutput);
    } catch (err: any) {
      console.error(`  JSON parse FAILED: ${err.message}`);
      console.error(`  First 300 chars: ${rawOutput.slice(0, 300)}`);
      continue;
    }

    if (outputs.length !== goldenSet.length) {
      console.error(`  Expected ${goldenSet.length} outputs, got ${outputs.length}`);
    }

    const results: Result[] = goldenSet.map((entry, i) => {
      const raw = outputs[i] || {};
      const actual = normalizeOutput(raw);
      return {
        elementId: entry.id,
        name: entry.input.name,
        category: entry.category,
        source: entry.input.sourceName,
        lang: entry.input.languageCode,
        expected: entry.expectedOutput,
        actual,
        scores: scoreResult(entry.expectedOutput, actual),
      };
    });

    allResults[m.id] = results;

    const outFile = `src/normalize/__testdata__/results/${m.id}-results.json`;
    await Bun.write(outFile, JSON.stringify({
      meta: {
        model: m.label,
        modelId: m.model,
        opencodeVersion,
        timestamp: runTimestamp,
        runId,
        elementCount: goldenSet.length,
        promptChars: prompt.length,
        outputChars: rawOutput.length,
        elapsedSeconds: parseFloat(elapsed),
      },
      results,
    }, null, 2));
    console.log(`  Wrote ${outFile}`);

    // Quick stats
    const descOk = results.filter((r) => r.scores.descOk).length;
    const howOk = results.filter((r) => r.scores.howToPlayOk).length;
    const avgVar = results.reduce((s, r) => s + r.scores.varRecall, 0) / results.length;
    const avgTip = results.reduce((s, r) => s + r.scores.tipRecall, 0) / results.length;
    const avgRef = results.reduce((s, r) => s + r.scores.refRecall, 0) / results.length;
    const overall = ((descOk + howOk) / (results.length * 2) + (avgVar + avgTip + avgRef) / 3) / 2;

    console.log(`  Descriptions: ${descOk}/${results.length}`);
    console.log(`  howToPlay:    ${howOk}/${results.length}`);
    console.log(`  Var recall:   ${(avgVar * 100).toFixed(0)}%`);
    console.log(`  Tip recall:   ${(avgTip * 100).toFixed(0)}%`);
    console.log(`  Ref recall:   ${(avgRef * 100).toFixed(0)}%`);
    console.log(`  OVERALL:      ${(overall * 100).toFixed(0)}%\n`);
  }

  // ── Comparison ──
  if (Object.keys(allResults).length >= 2) {
    console.log("═══ COMPARISON ═══");
    console.log(`{"Element":15,"Pro":15,"Flash":15}`.replace(/\d+/g, (m) => "─".repeat(parseInt(m))));
    console.log(
      ` │ ${"Element".padEnd(22)} │ ${"Pro".padEnd(6)} │ ${"Flash".padEnd(6)} │`,
    );

    for (const entry of goldenSet) {
      const pro = allResults["pro"]?.find((r) => r.elementId === entry.id);
      const flash = allResults["flash"]?.find((r) => r.elementId === entry.id);

      const scoreEmoji = (ok: boolean) => ok ? "✓" : "✗";
      const proOk = pro ? scoreEmoji(pro.scores.descOk && pro.scores.howToPlayOk) : "—";
      const flashOk = flash ? scoreEmoji(flash.scores.descOk && flash.scores.howToPlayOk) : "—";

      console.log(
        ` │ ${entry.id.padEnd(22).slice(0, 22)} │ ${proOk.padEnd(6)} │ ${flashOk.padEnd(6)} │`,
      );
    }

    const compFile = "src/normalize/__testdata__/results/comparison.json";
    await Bun.write(compFile, JSON.stringify({
      meta: {
        opencodeVersion,
        timestamp: runTimestamp,
        runId,
        elementCount: goldenSet.length,
      },
      models: MODELS.map((m) => ({
        id: m.id,
        label: m.label,
        modelId: m.model,
        results: allResults[m.id],
        summary: {
          descOk: (allResults[m.id] || []).filter((r) => r.scores.descOk).length,
          howOk: (allResults[m.id] || []).filter((r) => r.scores.howToPlayOk).length,
          avgVarRecall: (allResults[m.id] || []).reduce((s, r) => s + r.scores.varRecall, 0) / Math.max((allResults[m.id] || []).length, 1),
          avgTipRecall: (allResults[m.id] || []).reduce((s, r) => s + r.scores.tipRecall, 0) / Math.max((allResults[m.id] || []).length, 1),
          avgRefRecall: (allResults[m.id] || []).reduce((s, r) => s + r.scores.refRecall, 0) / Math.max((allResults[m.id] || []).length, 1),
        },
      })),
    }, null, 2));
    console.log(`\nWrote ${compFile}`);
  }
}

main().catch(console.error);
