import type { NormalizedElement } from "./normalized-schema";
import {
  isUsableNormalization,
  normalizeDifficulty,
  normalizeEnergyLevel,
  sanitizeRequires,
  sanitizeSkills,
  sanitizeUsage,
} from "./normalized-schema";
import { skillPromptList } from "./skills";
import { dropRedundantTips } from "./tip-redundancy";
import { createHash } from "crypto";
import { buildStyleCorrection, collectStyleViolations } from "./style-validator";

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
  parent: string | null;
}

export interface VocabularyMap {
  mechanics: VocabularyCluster[];
  skills: VocabularyCluster[];
}

export interface WorkSourceInput {
  identifier: string;
  name: string;
  sourceName: string;
  url: string;
  languageCode: string;
  /** Raw HTML or markdown of the source page. */
  content: string;
}

export interface LlmClient {
  normalizeElement(name: string, htmlContent: string, languageCode: string, tags: string[]): Promise<NormalizedElement | NormalizedElement[]>;
  /** One extraction from every source that describes the same work. */
  normalizeWork(sources: WorkSourceInput[]): Promise<NormalizedElement>;
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
  "skills": ["impulse", "status"],
  "practical": {"difficulty": "beginner|intermediate|advanced (optional)", "typicalDurationMinutes": number (optional), "energyLevel": "low|medium|high (optional)", "groupSize": {"min": number (optional), "max": number (optional)} (optional), "usage": ["rehearsal", "show"], "requires": "one line, at most 12 words (optional)"}
}

SKILL VOCABULARY — skills are ids from this fixed list, nothing else:
${skillPromptList()}

RULES:
- howToPlay is null ONLY for: theoretical concepts ("Game", "Status" as improv theory), parent index pages listing multiple games, or bare audience ask-for prompts. Everything else (games, exercises, warm-ups, show formats, handles) MUST have structured steps.
- A show format (Harold, Deconstruction) is ONE atomic element. Its howToPlay describes multiple phases — that is correct. NEVER split a show format.
- When a page describes MULTIPLE independent games under separate headings, split them: return an array with the parent index element first (howToPlay: null, referencedElements populated with children), then each child element (splitFrom set to parent's identifier, full fields extracted). Parent gets description summarizing the category. Children get names from their section headings.
- Extract mechanics (reusable building blocks like "freeze signal", "tap out", "alphabet constraint", "translation gimmick").
- SKILLS — pick only what the work actually trains, at most four, using the ids above:
  * A skill describes what a player does on stage, not what the scene is about. A crime story trains "storytelling", not "crime".
  * Use the definition to choose between similar ids, and never invent an id or a phrase.
  * Leave the skill out when the work only mentions it in passing. Two certain skills beat five guessed ones.
- USAGE — where the work belongs:
  * "rehearsal" (German "Probe"): the group trains with it. This is the default for exercises and warm-ups.
  * "show": it can be performed in front of an audience. Add it when the source mentions a performance, a show, an audience, or when the work is a show format.
  * A work that is performed but also drilled in rehearsal gets both. Always give at least one.
- REQUIRES — what must be in place before the work can start: material, space, an established skill. One line, at most twelve words, imperative-free ("Zettel mit Nummern 1–4", "eingespieltes Ensemble, drei Stühle"). Do not repeat group size, duration or difficulty — those are separate fields. Omit the field when nothing is needed.
- Extract practical metadata when the content suggests it: difficulty, typical duration, energy level, group size.
- For <a href="..."> links to other wiki pages: extract the page name into referencedElements. Do NOT generate identifiers — just the name as it appears.
- TIPS — tips are optional. Only extract advice the source actually gives: a hints/notes/tips section, common mistakes, teaching guidance, or an explicit insight into why the game is hard and how to make it work.
  * A tip must add something the steps and the description do not already say. Never paraphrase a step, a rule or the description into a tip.
  * If the source contains no advice of its own, return "tips": [].
  * Never manufacture a tip from the instructions, the variations, or the general nature of the game — a page that only explains how to play has no tips.
  * Categorize as pedagogical (teaching advice), staging (performance/show advice), safety (physical/emotional), group-dynamic (team/group interaction), failure-mode (common mistakes), or general.
- Preserve the source language — German content gets German fields, English gets English. Mechanic and skill names should be in English when possible.
- VOICE — this rule is strict and applies to every howToPlay step:
  * Every step begins with an imperative verb. The players are the subject of the instruction, so do not describe what "the players" or "the moderator" do — tell the reader what to do.
  * German: always informal plural. Use "ihr", "euch", "euer". NEVER "du", "dich", "dir", "dein". NEVER formal "Sie", "Ihnen", "Ihre". NEVER "man" as the actor.
  * German imperative is the plural form ending in "-t": "Bildet", "Stellt", "Geht", "Ruft", "Friert", "Beginnt", "Nehmt". A step must never start with an infinitive or a third-person plural ("Frieren …", "Spielen …") — those are not instructions.
  * English: every step is an imperative sentence: "Form a half-circle", "Move through the space", "Freeze in your pose". Never start a step with "The", "A", "Each", "One", "Players".
  * Do not mix the two modes inside one element. Either all steps address the players or — only when the source describes a performance the reader merely hosts — all steps describe the performers. Addressing is the default and strongly preferred.
  * Convert descriptive source sentences into instructions instead of copying their grammar:
      "Beide Bühnenspieler frieren sofort in ihrer exakten Pose ein."
        → "Friert sofort in eurer exakten Pose ein."
      "Die Synchronsprecher sprechen den Dialog für die Darsteller."
        → "Sprecht als Synchronsprecher den Dialog für die Darsteller."
      "Der Moderator sagt an einer passenden Stelle Stopp."
        → "Lasst den Moderator an einer passenden Stelle Stopp sagen."
      "Jeder wartende Spieler kann Freeze rufen."
        → "Ruft Freeze, wenn ihr wartet."
      "The other players perform the scene based on the director's setup."
        → "Perform the scene based on the director's setup."
      "The leader makes slow, deliberate movements while the mirror follows."
        → "Make slow, deliberate movements; your mirror follows exactly."
  * Keep the quoted words of the game (signal words, phrases the players say) even when they contain "du" or "you" — dialogue is not narration.
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

/**
 * The rules that only apply when one extraction covers several sources.
 *
 * The whole point of the work pipeline: the old one merged finished
 * extractions, so the same game could end up with two walkthroughs next to
 * each other. Here the model sees all source texts and has to produce one
 * answer — which also means it has to decide what to do with a contradiction,
 * and that decision is written down as a variation instead of being lost.
 */
const WORK_MERGE_RULES = `

WORK MERGE — the content is several source pages about the SAME work:
- OUTPUT LANGUAGE — write every field in the work language named below, even
  when a source, the skill list or a game term is in another language. A German
  work gets German, an English work gets English. Never mix the two.
- SKILLS — "skills" is an array of ids from the SKILL VOCABULARY above, for
  example ["impulse", "attention"]. Never write a word or a phrase there.
- PRACTICAL — always fill "practical": at least "difficulty", "energyLevel",
  "usage". "usage" is never empty.
- Produce ONE extraction for the work, never one block per source.
- STEPS — merge what the sources say into one walkthrough in playing order.
  * Target four to six steps, never more than eight. Group related actions; a
    step is a phase of the game, not a single sentence from a source.
  * A rule stated by three sources appears once, not three times.
  * Keep concrete details that differ between sources ("say the name of a
    place", "clap twice") when they make the step clearer.
- CONTRADICTION — when sources describe the same phase differently, the
  rehearsal reading wins: the one a group can actually play with a leader and
  players. The other reading becomes a VARIATION with a short name, so nothing
  is lost and nothing is presented as fact twice.
- VARIATIONS — only real variants: a source names them *and* says what
  changes, or a source describes a different setting (stage vs. rehearsal,
  audience vs. no audience). A bare list of other game names is not a
  variations section — those are separate works, leave them out. Never invent a
  variant by rewording a step.
- TIPS — only advice a source actually gives. Never turn a permission ("you can
  also …") into a rule, and never add taste judgements ("this is funny").
- SOURCES — every claim must be supported by at least one source. Do not add
  rules, materials or constraints that no source mentions.`;

function buildWorkSystemPrompt(): string {
  return buildSystemPrompt() + WORK_MERGE_RULES;
}

function buildWorkUserPrompt(sources: WorkSourceInput[]): string {
  const language = sources[0].languageCode === "de" ? "German" : "English";
  const blocks = sources
    .map(
      (source, index) => `=== SOURCE ${index + 1}: ${source.sourceName} — ${source.url} ===
${source.content}`
    )
    .join("\n\n");

  return `Work name: ${sources[0].name}
OUTPUT LANGUAGE: ${language} — answer in ${language} only.
Sources describing this work: ${sources.length}

${blocks}`;
}

let _promptHash = "";
export function getPromptHash(): string {
  if (!_promptHash) {
    _promptHash = createHash("md5").update(buildSystemPrompt()).digest("hex");
  }
  return _promptHash;
}

let _workPromptHash = "";
/** Like `getPromptHash`, but for the merged-work extraction. */
export function getWorkPromptHash(): string {
  if (!_workPromptHash) {
    _workPromptHash = createHash("md5").update(buildWorkSystemPrompt()).digest("hex");
  }
  return _workPromptHash;
}

const COMPLETENESS_CORRECTION = `

CORRECTION: The previous answer was incomplete and has been rejected. Return the full JSON object again, with:
- "summary": one non-empty sentence naming the element.
- "description": 1-3 non-empty sentences explaining what it is.
- "howToPlay": the structured steps, unless this is a theoretical concept article, an index page listing other games, or a bare audience ask-for.
Empty strings for summary or description are never acceptable.`;

/**
 * A split answer is usable when at least one item carries a real extraction;
 * the parent index of a split may legitimately be sparse.
 */
function hasUsableExtraction(
  value: NormalizedElement | NormalizedElement[]
): boolean {
  const items = Array.isArray(value) ? value : [value];
  return items.some((item) => isUsableNormalization(item.normalized));
}

const DEFAULT_MODELS = ["deepseek-v4.1-flash"];
const API_ENDPOINT = "https://opencode.ai/zen/v1/chat/completions";

function parseModelList(envVal: string | undefined, defaults: string[]): string[] {
  if (!envVal || !envVal.trim()) return defaults;
  return envVal.split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * The models the extractor will try, in order. Exposed so callers can tell
 * whether a cached normalization was produced by the same model.
 */
export function getConfiguredModels(): string[] {
  return parseModelList(process.env.NORMALIZE_MODELS, DEFAULT_MODELS);
}

export function getApiKey(): string {
  return process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY || "";
}

export function createOpencodeGoClient(
  models?: string[],
): LlmClient {
  const modelList = models ?? parseModelList(process.env.NORMALIZE_MODELS, DEFAULT_MODELS);
  const apiKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY || "";
  if (!apiKey) console.warn("No OPENCODE_GO_API_KEY set — normalization will fail.");

  const systemPrompt = buildSystemPrompt();
  const workSystemPrompt = buildWorkSystemPrompt();

  /**
   * One extraction: call the model, repair an incomplete answer once, and pick
   * the better of two answers when the style rules are violated.
   *
   * Shared by the single-source and the merged-work extraction, so both get
   * the same guarantees. The style check is what keeps "Frieren alle ein" from
   * being stored as a step.
   */
  async function runExtraction(
    prompt: string,
    userPrompt: string,
    languageCode: string,
    label: string,
    promptHash: string,
  ): Promise<NormalizedElement | NormalizedElement[]> {
    const first = await callApiDetailed(apiKey, modelList, prompt, userPrompt, 32000, 1, true);
    if (process.env.DEBUG_EXTRACTION) {
      const file = `output/debug-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${languageCode}.txt`;
      await Bun.write(file, `PROMPT:\n${userPrompt}\n\n--- ANSWER ---\n${first.text}`);
      console.log(`  DEBUG ${file}`);
    }
    let parsed = parseNormalizeResponse(first.text);
    let model = first.model;

    // A response that parses but carries no summary/description is a failed
    // extraction (a glitch, a truncation, a refusal). Retry it once with an
    // explicit correction; if it is still empty, throw so the caller keeps
    // the previous answer instead of caching the failure.
    if (!hasUsableExtraction(parsed)) {
      console.warn(
        `  INCOMPLETE ${label}: empty summary/description — retrying with a completeness correction`
      );
      const retry = await callApiDetailed(
        apiKey,
        modelList,
        prompt,
        userPrompt + COMPLETENESS_CORRECTION,
        32000,
        1,
        true
      );
      parsed = parseNormalizeResponse(retry.text);
      model = retry.model;
      if (!hasUsableExtraction(parsed)) {
        throw new Error(
          "Incomplete extraction: the model returned no usable summary/description"
        );
      }
    }

    // Record which model and prompt produced this extraction. The values are
    // written through by the caller, so cached entries stay auditable.
    const withProvenance = (element: NormalizedElement): NormalizedElement => ({
      ...element,
      normalized: { ...element.normalized, model, promptHash },
    });

    // Style is checked after parsing because it is a property of the whole
    // element (mixed voice) as well as of single steps (invalid imperative).
    // One correction attempt: repeating the exact failing rules works better
    // than resending the identical prompt, and two answers are enough to pick
    // the better one. The retry is skipped when the first answer is already
    // clean, which is the common case.
    const firstViolations = collectStyleViolations(parsed, languageCode);
    if (firstViolations.length === 0) {
      return Array.isArray(parsed) ? parsed.map(withProvenance) : withProvenance(parsed);
    }

    console.warn(
      `  STYLE ${label}: ${firstViolations.length} violation(s) [${[
        ...new Set(firstViolations.map((v) => v.rule)),
      ].join(", ")}] — retrying once`
    );

    let best = parsed;
    let bestCount = firstViolations.length;
    let bestModel = model;
    try {
      const retry = await callApiDetailed(
        apiKey,
        modelList,
        prompt,
        userPrompt + buildStyleCorrection(firstViolations),
        32000,
        1,
        true
      );
      const retried = parseNormalizeResponse(retry.text);
      const retryViolations = collectStyleViolations(retried, languageCode);
      const retryCount = retryViolations.length;
      if (retryCount < bestCount) {
        best = retried;
        bestCount = retryCount;
        bestModel = retry.model;
      }
      if (retryCount > 0) {
        console.warn(
          `  STYLE ${label}: retry still has ${retryCount} violation(s) [${[
            ...new Set(retryViolations.map((v) => v.rule)),
          ].join(", ")}] — keeping the better answer`
        );
      }
    } catch (err: any) {
      // A failed retry must not lose the first answer.
      console.warn(`  STYLE ${label}: retry failed (${err.message.slice(0, 80)}) — keeping the first answer`);
    }

    const withModel = (element: NormalizedElement): NormalizedElement => ({
      ...withProvenance(element),
      normalized: { ...element.normalized, model: bestModel, promptHash },
    });
    return Array.isArray(best) ? best.map(withModel) : withModel(best);
  }

  return {
    async normalizeElement(name, htmlContent, languageCode, tags) {
      return runExtraction(
        systemPrompt,
        buildUserPrompt(name, languageCode, tags, htmlContent),
        languageCode,
        name,
        getPromptHash()
      );
    },

    async normalizeWork(sources) {
      const result = await runExtraction(
        workSystemPrompt,
        buildWorkUserPrompt(sources),
        sources[0].languageCode,
        sources[0].name,
        getWorkPromptHash()
      );
      // The merged prompt asks for exactly one extraction. An array means the
      // model fell back to splitting the page, which cannot be shared by the
      // work's members — fail loudly instead of picking an arbitrary item.
      if (Array.isArray(result)) {
        throw new Error(
          `Merged-work extraction returned ${result.length} elements instead of one — the model split the page`
        );
      }
      return result;
    },

    async findCrossSourceMatches(sourceA, sourceB) {
      const prompt = buildMatchPrompt(sourceA, sourceB);
      const text = await callApi(apiKey, modelList, "You compare improv elements and return match pairs as JSON.", prompt, 16000, 2, true);
      return parseMatchResponse(text, sourceA, sourceB);
    },

    async normalizeVocabulary(terms) {
      const prompt = buildVocabularyPrompt(terms);
      const text = await callApi(apiKey, modelList, "You cluster synonym terms from improvisation theatre into canonical forms. Always respond with JSON.", prompt, 16000, 2, true, false);
      return parseVocabularyResponse(text);
    },
  };
}

function isCreditExhausted(status: number, body: string): boolean {
  if (status === 402) return true;
  if ((status === 403 || status === 429) && /insufficient|quota|credit|balance|usage.?limit|FreeUsageLimitError/i.test(body)) return true;
  if (status === 429 && /rate.?limit.*exceeded|usage.*exceeded/i.test(body)) return true;
  return false;
}

export async function callApi(
  apiKey: string,
  models: string[],
  systemMessage: string,
  userMessage: string,
  maxTokens: number = 12000,
  retries: number = 3,
  retryEmpty: boolean = false,
  jsonFormat: boolean = true,
): Promise<string> {
  const { text } = await callApiDetailed(
    apiKey, models, systemMessage, userMessage, maxTokens, retries, retryEmpty, jsonFormat
  );
  return text;
}

/**
 * Like `callApi`, but also reports which model produced the answer. Needed for
 * provenance: a fallback model must not be recorded as the primary one.
 */
export async function callApiDetailed(
  apiKey: string,
  models: string[],
  systemMessage: string,
  userMessage: string,
  maxTokens: number = 12000,
  retries: number = 3,
  retryEmpty: boolean = false,
  jsonFormat: boolean = true,
): Promise<{ text: string; model: string }> {
  const promptChars = systemMessage.length + userMessage.length;
  const estTokens = Math.round(promptChars / 4);
  let lastError: Error | null = null;

  for (let modelIdx = 0; modelIdx < models.length; modelIdx++) {
    const model = models[modelIdx];
    const label = `[api] model=${model} prompt=${(promptChars / 1024).toFixed(1)}K est=${estTokens / 1024}K max=${maxTokens / 1024}K`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const jitter = Math.floor(Math.random() * 1000);
        const delay = Math.min(1000 * Math.pow(2, attempt) + jitter, 30000);
        console.warn(`  Retry ${attempt}/${retries} after ${delay}ms [model=${model}]`);
        await new Promise(r => setTimeout(r, delay));
      }

      const resp = await fetch(API_ENDPOINT, {
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
          ...(jsonFormat ? { response_format: { type: "json_object" } } : {}),
          max_tokens: maxTokens,
          temperature: 0,
        }),
      });

      if (!resp.ok) {
        const err = await resp.text().catch(() => resp.statusText);
        const msg = `API error ${resp.status}: ${err.slice(0, 400)}`;

        if (isCreditExhausted(resp.status, err)) {
          console.warn(`  ${label} HTTP ${resp.status} — model appears out of credits`);
          if (modelIdx < models.length - 1) {
            console.warn(`  Falling back to ${models[modelIdx + 1]}`);
          }
          lastError = new Error(msg);
          break; // break retry loop → try next model
        }

        if (resp.status === 503 || resp.status === 429) {
          console.warn(`  ${label} HTTP ${resp.status} — retryable`);
          lastError = new Error(msg);
          if (attempt < retries) continue;
        }

        throw new Error(msg);
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const finishReason = choice?.finish_reason || "(missing)";
      const usage = data.usage;
      const content = choice?.message?.content;

      if (content) {
        const outTokens = usage?.completion_tokens || 0;
        console.log(`  ${label} HTTP ${resp.status} finish=${finishReason} in=${usage?.prompt_tokens || "?"} out=${outTokens}`);
        return { text: content, model };
      }

      // Empty response — diagnose why
      const reason = finishReason === "length" ? "token limit hit" :
                     finishReason === "stop" ? "model refused" :
                     finishReason === "content_filter" ? "content filter" :
                     "unknown";
      const inTokens = usage?.prompt_tokens ? `${usage.prompt_tokens} in, ` : "";
      console.warn(`  ${label} HTTP ${resp.status} finish=${finishReason} content="" (${reason} — ${inTokens}attempt ${attempt + 1}/${retries + 1})`);

      if (retryEmpty && attempt < retries) {
        if (finishReason === "length") {
          console.warn(`  ${label} — not retrying (token limit hit with same prompt)`);
          break;
        }
        continue;
      }
      break;
    }
  }

  throw lastError || new Error("Empty response from API");
}

export function parseNormalizeResponse(text: string): NormalizedElement | NormalizedElement[] {
  const json = extractJson(text);
  // Split answers are sometimes wrapped in an envelope (`{"elements": [...]}`)
  // instead of being a bare array. Treating the envelope as one element
  // produced an empty parent and threw the children away.
  const value = Array.isArray(json?.elements) ? json.elements : json;
  if (Array.isArray(value)) {
    return value.map((item: any) => coerceElement(item));
  }
  return coerceElement(value);
}

function coerceElement(raw: any): NormalizedElement {
  const howToPlay = coerceHowToPlay(raw.howToPlay);
  const steps = (howToPlay?.steps ?? []).map(
    (step: { action: string }) => step.action
  );

  // The model sometimes nests the sibling fields *inside* howToPlay:
  // {"howToPlay": {"steps": [...], "tips": [...], "skills": [...], …}}.
  // Coercion used to keep only the steps, which silently emptied tips,
  // variations and practical. Read the nested object as a fallback, the top
  // level always wins.
  const nested =
    raw.howToPlay && typeof raw.howToPlay === "object" && !Array.isArray(raw.howToPlay)
      ? raw.howToPlay
      : {};
  const field = (key: string) => raw[key] ?? nested[key];

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
      howToPlay,
      variations: (field("variations") || []).map((v: any) => ({
        name: String(v.name || ""),
        description: String(v.description || ""),
        differsBy: Array.isArray(v.differsBy) ? v.differsBy.map(String) : [],
      })),
      // A tip that repeats a step is not additional advice. Dropped before it
      // is stored, so the cache never holds a duplicate either.
      tips: dropRedundantTips(
        steps,
        (field("tips") || []).map((t: any) => ({
          text: typeof t === "string" ? t : String(t.text || ""),
          category: typeof t === "string" ? "general" : String(t.category || "general"),
        }))
      ),
      referencedElements: (field("referencedElements") || []).map((r: any) => ({
        name: typeof r === "string" ? r : String(r.name || ""),
      })),
      mechanics: (field("mechanics") || []).map((m: any) => ({
        name: typeof m === "string" ? m : String(m.name || ""),
        category: typeof m === "object" && m.category ? String(m.category) : undefined,
      })),
      skills: sanitizeSkills(field("skills")),
      practical: coercePractical(field("practical")),
      contentHash: "",
      normalizedBy: "",
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
    // The model sometimes answers in the source language. Normalize here, so
    // an unexpected label cannot fail the schema of the whole artifact.
    difficulty: normalizeDifficulty(raw.difficulty),
    typicalDurationMinutes: typeof raw.typicalDurationMinutes === "number" ? raw.typicalDurationMinutes : undefined,
    energyLevel: normalizeEnergyLevel(raw.energyLevel),
    groupSize: raw.groupSize && typeof raw.groupSize === "object"
      ? { min: typeof raw.groupSize.min === "number" ? raw.groupSize.min : undefined, max: typeof raw.groupSize.max === "number" ? raw.groupSize.max : undefined }
      : undefined,
    requiresPreparation: typeof raw.requiresPreparation === "boolean" ? raw.requiresPreparation : undefined,
    usage: sanitizeUsage(raw.usage),
    requires: sanitizeRequires(raw.requires),
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
  "mechanics": [{"canonical": "canonical name", "variants": ["synonym1", "synonym2"], "parent": null}],
  "skills": [{"canonical": "canonical name", "variants": ["synonym1", "synonym2"], "parent": null}]
}

parent is always null — reserved for future taxonomy hierarchy.

Each term must appear in exactly one cluster. Terms that are already canonical should appear as their own cluster with just themselves as a variant. Include German terms and map them to English canonical names.`;
}

function parseVocabularyResponse(text: string): VocabularyMap {
  const json = extractJson(text);
  return {
    mechanics: (json.mechanics || []).map((c: any) => ({
      canonical: String(c.canonical || ""),
      variants: (c.variants || []).map(String),
      parent: typeof c.parent === "string" ? c.parent : null,
    })),
    skills: (json.skills || []).map((c: any) => ({
      canonical: String(c.canonical || ""),
      variants: (c.variants || []).map(String),
      parent: typeof c.parent === "string" ? c.parent : null,
    })),
  };
}

export function extractJson(text: string): any {
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
