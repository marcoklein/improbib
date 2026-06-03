import TurndownService from "turndown";
import type { GoldenOutput } from "./__testdata__/golden-set";

const turndown = new TurndownService({ headingStyle: "atx" });

export interface LlmClient {
  normalizeElement(name: string, htmlContent: string, languageCode: string): Promise<GoldenOutput>;
}

export function createOpencodeGoClient(
  model: string = "opencode-go/deepseek-v4-flash",
): LlmClient {
  return {
    async normalizeElement(name, htmlContent, languageCode) {
      const md = turndown.turndown(htmlContent).trim();
      const lang = languageCode === "de" ? "German" : "English";

      const prompt = `Extract structured fields from this improv element. Return ONLY a JSON object — no markdown, no backticks.

Name: ${name}
Language: ${lang}
Content:
${md || "(blank)"}

Return: {"description":"1-3 sentence summary","howToPlay":"numbered steps or null for concepts/theory ONLY","variations":[{"name":"...","description":"..."}],"tips":["..."],"referencedElements":["name or empty"]}`;

      const text = await callOpenCodeGo(prompt, model);
      return extractJson(text);
    },
  };
}

async function callOpenCodeGo(prompt: string, model: string): Promise<string> {
  const promptFile = `/tmp/improbib-nl-${Date.now()}.txt`;
  await Bun.write(promptFile, prompt);

  try {
    const proc = Bun.spawn(
      ["sh", "-c", `cat ${promptFile} | opencode run --model ${model} --format json --dangerously-skip-permissions`],
      { stdout: "pipe", stderr: "pipe" },
    );

    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(`opencode exited ${exitCode}: ${stderr.slice(0, 500)}`);
    }

    const events = output
      .split("\n")
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    const text = events
      .filter((e: any) => e.type === "text")
      .map((e: any) => e.part?.text || e.text || "")
      .join("");

    if (!text) {
      const errorEvents = events.filter((e: any) => e.type === "error");
      const errorDetails = errorEvents.map((e: any) => JSON.stringify(e)).join("; ");
      throw new Error(`No text in model output. Events: ${eventTypes}. Errors: ${errorDetails}. stderr: ${stderr.slice(0, 200)}`);
    }

    return text;
  } finally {
    Bun.file(promptFile).delete().catch(() => {});
  }
}

function normalizeHowToPlay(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join("\n");
  }
  return String(value);
}

function extractJson(text: string): GoldenOutput {
  const mdMatch = text.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\n?```/);
  const jsonStr = mdMatch ? mdMatch[1].trim() : text.trim();
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  const finalStr = objMatch ? objMatch[0] : jsonStr;
  const parsed = JSON.parse(finalStr);

  return {
    description: String(parsed.description || ""),
    howToPlay: normalizeHowToPlay(parsed.howToPlay),
    variations: (parsed.variations || []).map((v: any) => ({
      name: String(v.name || ""),
      description: String(v.description || ""),
    })),
    tips: (parsed.tips || []).map(String),
    referencedElements: (parsed.referencedElements || []).map(String),
  };
}
