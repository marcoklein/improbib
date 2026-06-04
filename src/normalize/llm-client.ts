import TurndownService from "turndown";
import type { GoldenOutput } from "./__testdata__/golden-set";

const turndown = new TurndownService({ headingStyle: "atx" });

export interface LlmClient {
  normalizeElement(name: string, htmlContent: string, languageCode: string): Promise<GoldenOutput>;
}

export function createOpencodeGoClient(
  model: string = "deepseek-v4-flash",
): LlmClient {
  const apiKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY || "";
  if (!apiKey) console.warn("No OPENCODE_GO_API_KEY set — normalization will fail.");

  return {
    async normalizeElement(name, htmlContent, languageCode) {
      const md = turndown.turndown(htmlContent).trim();
      const lang = languageCode === "de" ? "German" : "English";

      const prompt = `Extract structured fields from this improv element. Return ONLY a JSON object — no markdown, no backticks, no explanation outside the JSON.

Name: ${name}
Language: ${lang}
Content:
${md || "(blank)"}

Return: {"description":"1-3 sentence summary","howToPlay":"numbered steps or null for concepts/theory ONLY","variations":[{"name":"...","description":"..."}],"tips":["..."],"referencedElements":["name or empty"]}`;

      const text = await callApi(apiKey, model, prompt);
      return parseOutput(text);
    },
  };
}

export async function callApi(
  apiKey: string,
  model: string,
  userMessage: string,
): Promise<string> {
  const resp = await fetch("https://opencode.ai/zen/go/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You extract structured fields from improv game descriptions. Return ONLY valid JSON matching the requested structure." },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
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

export function parseOutput(text: string): GoldenOutput {
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

function normalizeHowToPlay(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v: any) => String(v)).join("\n");
  return String(value);
}
