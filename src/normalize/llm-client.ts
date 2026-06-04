import type { NormalizedElement } from "./normalized-schema";

// Stage 2 types
export interface MatchCandidate {
  identifier: string;
  name: string;
  description: string;
  sourceName: string;
  languageCode: string;
}

export interface ConfirmedMatch {
  a: string;
  b: string;
  confidence: number;
}

// Stage 3 types
export interface VocabularyCluster {
  canonical: string;
  variants: string[];
}

export interface VocabularyMap {
  mechanics: VocabularyCluster[];
  skills: VocabularyCluster[];
}

export interface LlmClient {
  normalizeElement(name: string, htmlContent: string, languageCode: string, tags: string[]): Promise<NormalizedElement | NormalizedElement[]>;
  findCrossSourceMatches(sourceA: MatchCandidate[], sourceB: MatchCandidate[]): Promise<ConfirmedMatch[]>;
  normalizeVocabulary(terms: { mechanics: string[]; skills: string[] }): Promise<VocabularyMap>;
}

function buildSystemPrompt(): string {
  return `You extract structured fields from improvisation theatre content. Raw HTML is provided — use the heading hierarchy, link targets (<a href>), list types (<ol>/<ul>), and text emphasis (<strong>/<em>) to understand the content.

Return ONLY valid JSON matching this structure:
{
  "summary": "one sentence summary in the source language",
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
- howToPlay is null ONLY for: theoretical concepts ("Game", "Status" as improv theory), parent index pages listing multiple games, or bare audience ask-for prompts. Everything else (games, exercises, warm-ups, show formats, handles) MUST have structured steps.
- A show format (Harold, Deconstruction) is ONE atomic element. Its howToPlay describes multiple phases — that is correct. NEVER split a show format.
- When a page describes MULTIPLE independent games under separate headings, split them: return an array with the parent index element first (howToPlay: null, referencedElements populated with children), then each child element (splitFrom set to parent's identifier, full fields extracted). Parent gets description summarizing the category. Children get names from their section headings.
- Extract mechanics (reusable building blocks like "freeze signal", "tap out", "alphabet constraint", "translation gimmick") and skills (competencies like "active listening", "spontaneity", "group mind").
- Extract practical metadata when the content suggests it: difficulty, typical duration, energy level, group size, preparation requirements, suitable contexts.
- For <a href="..."> links to other wiki pages: extract the page name into referencedElements. Do NOT generate identifiers — just the name as it appears.
- For tips: categorize as pedagogical (teaching advice), staging (performance/show advice), safety (physical/emotional), group-dynamic (team/group interaction), failure-mode (common mistakes), or general.
- Preserve the source language — German content gets German fields, English gets English. Mechanic and skill names should be in English when possible.
- TONE: Use imperative mood for all step instructions. English: start each step with a verb. German: use informal "Du/ihr" everywhere — steps ("geht", "stellt euch", "bildet Paare"), constraints ("du darfst nicht sprechen", "ihr müsst euch berühren"), role descriptions ("der Spieler, der führt"). Never use "Sie" or "man". Descriptions: factual third-person, no personal pronouns.
- CATEGORY GUIDANCE: Pick the most specific category that fits. Skill examples: social (acceptance, status play, trust), physical (body awareness, mirroring, spatial coordination), cognitive (spontaneity, pattern recognition, quick thinking, active listening), narrative (storytelling, character creation, theme exploration), vocal (singing, projection, vocal expression). Mechanic examples: constraint (touch to speak, alphabet constraint, time limit), signal (freeze, tap out, clap), role (protagonist, moderator, translator), structure (opening scene, callback, scene rotation), interaction (audience voting, physical contact, mirroring).`;
}

function buildUserPrompt(name: string, languageCode: string, tags: string[], htmlContent: string): string {
  const lang = languageCode === "de" ? "German" : "English";
  const tagsStr = tags.length > 0 ? tags.join(", ") : "(none)";
  return `Name: ${name}
Language: ${lang}
Tags: ${tagsStr}
Content:
${htmlContent}`;
}

export function createOpencodeGoClient(
  model: string = "deepseek-v4-flash",
): LlmClient {
  const apiKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY || "";
  if (!apiKey) console.warn("No OPENCODE_GO_API_KEY set — normalization will fail.");

  const systemPrompt = buildSystemPrompt();

  return {
    async normalizeElement(name, htmlContent, languageCode, tags) {
      const userPrompt = buildUserPrompt(name, languageCode, tags, htmlContent);
      const text = await callApi(apiKey, model, systemPrompt, userPrompt, 16000);
      return parseNormalizeResponse(text);
    },

    async findCrossSourceMatches(sourceA, sourceB) {
      const prompt = buildMatchPrompt(sourceA, sourceB);
      const text = await callApi(apiKey, model, "You compare improv elements and return match pairs as JSON.", prompt, 8000);
      return parseMatchResponse(text, sourceA, sourceB);
    },

    async normalizeVocabulary(terms) {
      const prompt = buildVocabularyPrompt(terms);
      const text = await callApi(apiKey, model, "You cluster synonym terms from improvisation theatre into canonical forms. Always respond with JSON.", prompt, 32000);
      return parseVocabularyResponse(text);
    },
  };
}

export async function callApi(
  apiKey: string,
  model: string,
  systemMessage: string,
  userMessage: string,
  maxTokens: number = 12000,
  retries: number = 3,
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.warn(`  Retry ${attempt}/${retries} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }

    const resp = await fetch("https://opencode.ai/zen/go/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature: 0,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      const msg = `API error ${resp.status}: ${err.slice(0, 400)}`;
      if (resp.status === 503 || resp.status === 429) {
        if (attempt < retries) continue;
      }
      throw new Error(msg);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) return content;
    // Empty response — don't retry, it's likely a prompt size issue
    throw new Error("Empty response from API");
  }
  throw new Error(`API returned empty response after ${retries + 1} attempts`);
}

function parseNormalizeResponse(text: string): NormalizedElement | NormalizedElement[] {
  const json = extractJson(text);
  if (Array.isArray(json)) {
    return json.map((item: any) => coerceElement(item));
  }
  return coerceElement(json);
}

function coerceElement(raw: any): NormalizedElement {
  return {
    identifier: "",
    name: String(raw.name || ""),
    url: "",
    sourceName: "",
    languageCode: "en",
    tags: [],
    htmlContent: "",
    splitFrom: typeof raw.splitFrom === "string" && raw.splitFrom.length === 32 ? raw.splitFrom : undefined,
    normalized: {
      summary: String(raw.summary || raw.description || ""),
      description: String(raw.description || ""),
      howToPlay: coerceHowToPlay(raw.howToPlay),
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
        category: typeof m === "object" && m.category ? String(m.category) : undefined,
      })),
      skills: (raw.skills || []).map((s: any) => ({
        name: typeof s === "string" ? s : String(s.name || ""),
        category: typeof s === "object" && s.category ? String(s.category) : undefined,
      })),
      practical: coercePractical(raw.practical),
      contentHash: "",
      extractedAt: new Date().toISOString(),
    },
    derivedElements: [],
    relatedIdentifiers: [],
  };
}

function coerceHowToPlay(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    if (value.trim() === "null" || value.trim() === "") return null;
    return { steps: [{ action: value }] };
  }
  if (value.steps && Array.isArray(value.steps)) {
    return {
      steps: value.steps.map((s: any) => ({
        action: String(s.action || ""),
        role: s.role ? String(s.role) : undefined,
        constraint: s.constraint ? String(s.constraint) : undefined,
      })),
    };
  }
  return { steps: [{ action: String(value) }] };
}

function coercePractical(raw: any): any {
  if (!raw || typeof raw !== "object") return {};
  return {
    difficulty: raw.difficulty || undefined,
    typicalDurationMinutes: typeof raw.typicalDurationMinutes === "number" ? raw.typicalDurationMinutes : undefined,
    energyLevel: raw.energyLevel || undefined,
    groupSize: raw.groupSize && typeof raw.groupSize === "object"
      ? { min: typeof raw.groupSize.min === "number" ? raw.groupSize.min : undefined, max: typeof raw.groupSize.max === "number" ? raw.groupSize.max : undefined }
      : undefined,
    requiresPreparation: typeof raw.requiresPreparation === "boolean" ? raw.requiresPreparation : undefined,
    suitableFor: Array.isArray(raw.suitableFor) ? raw.suitableFor : undefined,
  };
}

function buildMatchPrompt(sourceA: MatchCandidate[], sourceB: MatchCandidate[]): string {
  const abbreviate = (d: string) => d.length > 200 ? d.slice(0, 200) + "..." : d;
  const listA = sourceA.map((e, i) => `- [${i}] ${e.name}: ${abbreviate(e.description)}`).join("\n");
  const listB = sourceB.map((e, i) => `- [${i}] ${e.name}: ${abbreviate(e.description)}`).join("\n");

  return `Compare these two lists of improv elements from different sources. Return all pairs that refer to the same game/exercise/concept.

Source A (${sourceA[0]?.sourceName || "unknown"}):
${listA}

Source B (${sourceB[0]?.sourceName || "unknown"}):
${listB}

Return a JSON object: {"matches": [{"a": "index from A", "b": "index from B", "confidence": 0.0-1.0}]}
Use the numeric index (in brackets) from each list. Confidence should reflect how certain you are these are the same thing. 1.0 = definitely identical (e.g., exact same name in different languages via translation). 0.5 = possibly related. Only include pairs with confidence >= 0.5.`;
}

function parseMatchResponse(text: string, sourceA: MatchCandidate[], sourceB: MatchCandidate[]): ConfirmedMatch[] {
  const json = extractJson(text);
  if (json.matches && Array.isArray(json.matches)) {
    return json.matches.map((m: any) => {
      const aIdx = Number(m.a);
      const bIdx = Number(m.b);
      return {
        a: sourceA[aIdx]?.identifier || String(m.a || ""),
        b: sourceB[bIdx]?.identifier || String(m.b || ""),
        confidence: typeof m.confidence === "number" ? m.confidence : 0.5,
      };
    });
  }
  return [];
}

function buildVocabularyPrompt(terms: { mechanics: string[]; skills: string[] }): string {
  const mechList = terms.mechanics.map(t => `- ${t}`).join("\n") || "(none)";
  const skillList = terms.skills.map(t => `- ${t}`).join("\n") || "(none)";

  return `Cluster these improv terminology terms into canonical forms. Group synonyms together and choose the best canonical English name for each cluster.

Mechanics (reusable building blocks):
${mechList}

Skills (competencies trained):
${skillList}

Return a JSON object:
{
  "mechanics": [{"canonical": "canonical name", "variants": ["synonym1", "synonym2"]}],
  "skills": [{"canonical": "canonical name", "variants": ["synonym1", "synonym2"]}]
}

Each term must appear in exactly one cluster. Terms that are already canonical should appear as their own cluster with just themselves as a variant. Include German terms and map them to English canonical names.`;
}

function parseVocabularyResponse(text: string): VocabularyMap {
  const json = extractJson(text);
  return {
    mechanics: (json.mechanics || []).map((c: any) => ({
      canonical: String(c.canonical || ""),
      variants: (c.variants || []).map(String),
    })),
    skills: (json.skills || []).map((c: any) => ({
      canonical: String(c.canonical || ""),
      variants: (c.variants || []).map(String),
    })),
  };
}

function extractJson(text: string): any {
  // Try markdown code fence
  const mdMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (mdMatch) {
    const inner = mdMatch[1].trim();
    try { return JSON.parse(inner); } catch {}
  }
  // Try parsing directly
  try { return JSON.parse(text.trim()); } catch {}
  // Try extracting {...} or [...]
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
  }
  // Try repairing truncated JSON (close unclosed braces/strings)
  let attempt = text.trim();
  // Remove trailing "..." if present (streaming artifact)
  attempt = attempt.replace(/\.{3,}$/, "");
  // Count braces
  let openBraces = 0, openBrackets = 0;
  let inString = false, escaped = false;
  const chars: string[] = [];
  for (const ch of attempt) {
    if (escaped) { chars.push(ch); escaped = false; continue; }
    if (ch === "\\") { chars.push(ch); escaped = true; continue; }
    if (ch === '"' && !inString) { inString = true; chars.push(ch); continue; }
    if (ch === '"' && inString) { inString = false; chars.push(ch); continue; }
    if (inString) { chars.push(ch); continue; }
    if (ch === "{") openBraces++;
    if (ch === "}") openBraces--;
    if (ch === "[") openBrackets++;
    if (ch === "]") openBrackets--;
    chars.push(ch);
  }
  while (openBrackets > 0) { chars.push("]"); openBrackets--; }
  while (openBraces > 0) { chars.push("}"); openBraces--; }
  if (inString) chars.push('"');
  const repaired = chars.join("");
  try { return JSON.parse(repaired); } catch {}
  if (!text) throw new Error("Empty response from API");
  throw new Error(`Could not parse JSON from response: ${text.slice(0, 300)}`);
}
