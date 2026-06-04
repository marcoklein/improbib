import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { goldenSet } from "./golden-set";
import type { GoldenOutput } from "./golden-set";

const MODELS = [
  { id: "pro" as const, model: "opencode-go/deepseek-v4-pro", label: "deepseek-v4-pro" },
  { id: "flash" as const, model: "opencode-go/deepseek-v4-flash", label: "deepseek-v4-flash" },
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
  const systemPrompt = `You extract structured fields from improvisation theatre content. Raw HTML is provided — use the heading hierarchy, link targets, list types, and text emphasis to understand the content.

Return ONLY valid JSON matching this structure:
{
  "description": "1-3 sentence summary in the source language",
  "howToPlay": null or {"steps": [{"action": "what to do", "role": "who (optional)", "constraint": "rule (optional)"}]},
  "variations": [{"name": "name", "description": "description", "differsBy": ["what changes"]}],
  "tips": [{"text": "tip", "category": "pedagogical|staging|safety|group-dynamic|failure-mode|general"}],
  "referencedElements": [{"name": "as it appears in text"}],
  "mechanics": [{"name": "canonical name", "category": "constraint|signal|role|structure|interaction (optional)"}],
  "skills": [{"name": "canonical name", "category": "social|physical|cognitive|narrative|vocal (optional)"}],
  "practical": {"difficulty": "beginner|intermediate|advanced (optional)", "typicalDurationMinutes": number (optional), "energyLevel": "low|medium|high (optional)", "groupSize": {"min": number (optional), "max": number (optional)} (optional), "requiresPreparation": boolean (optional), "suitableFor": ["warmup|exercise|performance|encore|workshop"] (optional)}
}

RULES:
- howToPlay is null ONLY for: theoretical concepts, parent index pages, or bare audience ask-for prompts. Everything else MUST have structured steps.
- When a page describes MULTIPLE independent games under separate headings, return an array with the parent first (howToPlay: null), then each child.
- A show format (Harold, Deconstruction) is ONE atomic element — never split it, even though it has multiple phases.
- Extract mechanics (reusable building blocks) and skills (competencies trained).
- For <a href> links: extract the page name into referencedElements. Do NOT generate identifiers.
- For tips: categorize as pedagogical, staging, safety, group-dynamic, failure-mode, or general.`;

  let prompt = `${systemPrompt}

Extract each of the ${goldenSet.length} elements below. Return a JSON array of ${goldenSet.length} objects — no explanations, no markdown, no backticks.

Elements to extract:
`;

  for (const e of goldenSet) {
    const lang = e.input.languageCode === "de" ? "German" : "English";
    const tagsStr = e.input.tags.length > 0 ? e.input.tags.join(", ") : "(none)";
    prompt += `
---
ID: ${e.id}
Name: ${e.input.name}
Language: ${lang}
Source: ${e.input.sourceName}
Tags: ${tagsStr}
HTML:
${e.input.htmlContent || "(no content — this is an audience ask-for prompt, not a game)"}
---`;
  }

  prompt += `\n\nReturn EXACTLY a JSON array of ${goldenSet.length} objects. Each object must have an "id" field matching the element ID. No other text.`;
  return prompt;
}

function extractJsonArray(text: string): any[] {
  const mdMatch = text.match(/```(?:json)?\s*\n?(\[[\s\S]*?\])\n?```/);
  const jsonStr = mdMatch ? mdMatch[1].trim() : text.trim();
  const arrMatch = jsonStr.match(/\[[\s\S]*\]/);
  const finalStr = arrMatch ? arrMatch[0] : jsonStr;
  return JSON.parse(finalStr);
}

async function callApi(apiKey: string, model: string, userMessage: string): Promise<string> {
  const resp = await fetch("https://opencode.ai/zen/go/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      max_tokens: 16000,
      temperature: 0,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`API error ${resp.status}: ${err.slice(0, 400)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
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
    splitOk: boolean;
    noSplitOk: boolean;
    varRecall: number;
    tipRecall: number;
    refRecall: number;
    mechPrecision: number;
    skillPrecision: number;
  };
}

function normalizeOutput(raw: any): GoldenOutput {
  return {
    description: String(raw.description || ""),
    howToPlay: raw.howToPlay === null || raw.howToPlay === undefined ? null : {
      steps: Array.isArray(raw.howToPlay?.steps) ? raw.howToPlay.steps.map((s: any) => ({
        action: String(s.action || ""),
        role: s.role ? String(s.role) : undefined,
        constraint: s.constraint ? String(s.constraint) : undefined,
      })) : [],
    },
    variations: (raw.variations || []).map((v: any) => ({
      name: String(v.name || ""),
      description: String(v.description || ""),
      differsBy: Array.isArray(v.differsBy) ? v.differsBy.map(String) : [],
    })),
    tips: (raw.tips || []).map((t: any) => ({
      text: typeof t === "string" ? t : String(t.text || ""),
      category: typeof t === "string" ? "general" : String(t.category || "general"),
    })),
    referencedElements: (raw.referencedElements || []).map((r: any) => ({
      name: typeof r === "string" ? r : String(r.name || ""),
    })),
    mechanics: (raw.mechanics || []).map((m: any) => ({
      name: typeof m === "string" ? m : String(m.name || ""),
      category: typeof m === "object" ? m.category : undefined,
    })),
    skills: (raw.skills || []).map((s: any) => ({
      name: typeof s === "string" ? s : String(s.name || ""),
      category: typeof s === "object" ? s.category : undefined,
    })),
    practical: raw.practical || {},
  };
}

function scoreResult(expected: GoldenOutput, actual: GoldenOutput, category: string) {
  const descOk = actual.description.length >= 20;
  const howToPlayOk = expected.howToPlay === null
    ? actual.howToPlay === null
    : actual.howToPlay !== null && (actual.howToPlay.steps.length >= 1);

  const expectedVarNames = new Set(expected.variations.map((v) => v.name.toLowerCase()));
  const actualVarNames = new Set(actual.variations.map((v) => v.name.toLowerCase()));
  const varRecall = expectedVarNames.size === 0
    ? 1.0
    : [...expectedVarNames].filter((n) => actualVarNames.has(n)).length / expectedVarNames.size;

  const expectedTipWords = expected.tips.flatMap((t) => t.text.toLowerCase().split(/\s+/));
  const actualTipText = actual.tips.map(t => t.text).join(" ").toLowerCase();
  const tipRecall = expected.tips.length === 0
    ? 1.0
    : expected.tips.filter((t) => {
        const words = t.text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        return words.filter((w) => actualTipText.includes(w)).length / Math.max(words.length, 1) > 0.5;
      }).length / expected.tips.length;

  const expectedRefs = new Set(expected.referencedElements.map((r) => r.name.toLowerCase()));
  const actualRefs = new Set(actual.referencedElements.map((r) => r.name.toLowerCase()));
  const refRecall = expectedRefs.size === 0
    ? 1.0
    : [...expectedRefs].filter((r) => actualRefs.has(r)).length / expectedRefs.size;

  const expectedMechs = new Set(expected.mechanics.map(m => m.name.toLowerCase()));
  const actualMechs = new Set(actual.mechanics.map(m => m.name.toLowerCase()));
  const mechPrecision = expectedMechs.size === 0
    ? 1.0
    : [...expectedMechs].filter(m => actualMechs.has(m)).length / Math.max(expectedMechs.size, 1);

  const expectedSkills = new Set(expected.skills.map(s => s.name.toLowerCase()));
  const actualSkills = new Set(actual.skills.map(s => s.name.toLowerCase()));
  const skillPrecision = expectedSkills.size === 0
    ? 1.0
    : [...expectedSkills].filter(s => actualSkills.has(s)).length / Math.max(expectedSkills.size, 1);

  const splitOk = category.includes("multi-element") || category === "show-format"
    ? true : true;
  const noSplitOk = category === "show-format" ? actual.howToPlay !== null : true;

  return { descOk, howToPlayOk, splitOk, noSplitOk, varRecall, tipRecall, refRecall, mechPrecision, skillPrecision };
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

  const apiKey = getApiKey();
  const runTimestamp = new Date().toISOString();

  console.log(`API Key: ${apiKey.slice(0, 8)}...`);
  console.log(`Run:      ${runTimestamp}`);
  console.log(`Running ${modelsToRun.length} model(s) against ${goldenSet.length} golden elements\n`);

  for (const m of modelsToRun) {
    const prompt = buildBatchPrompt();
    console.log(`${m.label.toUpperCase()} — prompt: ${prompt.length} chars`);

    const start = Date.now();
    let rawOutput: string;
    try {
      rawOutput = await callApi(apiKey, m.model, prompt);
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
        scores: scoreResult(entry.expectedOutput, actual, entry.category),
      };
    });

    // Quick stats
    const descOk = results.filter((r) => r.scores.descOk).length;
    const howOk = results.filter((r) => r.scores.howToPlayOk).length;
    const avgVar = results.reduce((s, r) => s + r.scores.varRecall, 0) / results.length;
    const avgTip = results.reduce((s, r) => s + r.scores.tipRecall, 0) / results.length;
    const avgRef = results.reduce((s, r) => s + r.scores.refRecall, 0) / results.length;
    const avgMech = results.reduce((s, r) => s + r.scores.mechPrecision, 0) / results.length;
    const avgSkill = results.reduce((s, r) => s + r.scores.skillPrecision, 0) / results.length;
    const overall = ((descOk + howOk) / (results.length * 2) + (avgVar + avgTip + avgRef + avgMech + avgSkill) / 5) / 2;

    console.log(`  Descriptions: ${descOk}/${results.length}`);
    console.log(`  howToPlay:    ${howOk}/${results.length}`);
    console.log(`  Var recall:   ${(avgVar * 100).toFixed(0)}%`);
    console.log(`  Tip recall:   ${(avgTip * 100).toFixed(0)}%`);
    console.log(`  Ref recall:   ${(avgRef * 100).toFixed(0)}%`);
    console.log(`  Mech recall:  ${(avgMech * 100).toFixed(0)}%`);
    console.log(`  Skill recall: ${(avgSkill * 100).toFixed(0)}%`);
    console.log(`  OVERALL:      ${(overall * 100).toFixed(0)}%\n`);

    const outFile = `src/normalize/__testdata__/results/${m.id}-results.json`;
    await Bun.write(outFile, JSON.stringify({
      meta: { model: m.label, modelId: m.model, timestamp: runTimestamp, elementCount: goldenSet.length, promptChars: prompt.length, outputChars: rawOutput.length, elapsedSeconds: parseFloat(elapsed) },
      results,
    }, null, 2));
    console.log(`  Wrote ${outFile}\n`);
  }
}

main().catch(console.error);
