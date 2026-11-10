/**
 * Second opinion on the groups the deterministic matcher is unsure about.
 *
 *   bun run src/works-review.ts
 *
 * The matcher puts a group in the review band when the titles are similar but
 * not identical, or when a title match disagrees with the first paragraphs.
 * This script asks the model what the group actually is, one group per call,
 * and writes `output/works-review.json`.
 *
 * Three outcomes, deliberately not two:
 *
 * - `same`      — the pages describe one work; merge them before extracting.
 * - `variant`   — a named variant of a work in the group; keep it as its own
 *                 work so its page and variations survive, link it as a variant.
 * - `different` — unrelated; never merge.
 *
 * The `variant` case matters: merging "Conducted Story-Die" into "Conducted
 * Story" would delete a page a reader can find today, while the variation is
 * already represented.
 */
import { callApi, getApiKey, getConfiguredModels } from "./normalize/llm-client";

interface GroupSource {
  identifier: string;
  name: string;
  sourceName: string;
  lead: string;
}

interface Group {
  confidence: number;
  method: string;
  languageCode: string;
  sources: GroupSource[];
}

interface Verdict {
  decision: "same" | "variant" | "different";
  confidence: number;
  reason: string;
  /** For `variant`: the name of the source whose work it varies. */
  variantOf?: string;
}

const SYSTEM_PROMPT = `You compare improv source pages and decide whether they describe the same work.

Return JSON: {"decision": "same" | "variant" | "different", "confidence": 0.0-1.0, "reason": "one sentence", "variantOf": "source name (only for variant)"}

Rules:
- "same": the pages describe the same game, exercise or format — the same rules, even when one page is fuller or names details differently. Different titles are fine when the described activity is the same.
- "variant": one page is a named variation or a narrower version of another page's work (same base activity, one rule changed). The variant keeps its own page.
- "different": the pages are about different games, even when they share words ("Car Wash" vs "Car"), or they only share a topic (two unrelated status exercises).
- Judge the described activity, not the title and not the topic. A warm-up and a long form are never the same work.
- When unsure, answer "different" — a missed merge is cheaper than a wrong one.`;

function buildPrompt(group: Group): string {
  const list = group.sources
    .map(
      (source, index) => `${index + 1}. ${source.sourceName}: "${source.name}"
   ${source.lead || "(no lead available)"}`
    )
    .join("\n\n");

  return `Language: ${group.languageCode === "de" ? "German" : "English"}
The matcher suspects these pages belong together (confidence ${group.confidence}, method ${group.method}).

${list}`;
}

function parseVerdict(text: string): Verdict {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON in answer: ${text.slice(0, 200)}`);
  const raw = JSON.parse(match[0]);
  const decision =
    raw.decision === "same" || raw.decision === "variant" ? raw.decision : "different";
  return {
    decision,
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
    reason: typeof raw.reason === "string" ? raw.reason : "",
    variantOf: typeof raw.variantOf === "string" ? raw.variantOf : undefined,
  };
}

const groupKey = (group: Group) =>
  group.sources
    .map((source) => source.identifier)
    .sort()
    .join(",");

async function main(): Promise<void> {
  const retryFailed = process.argv.includes("--retry-failed");
  const input = await Bun.file("output/works-matching.json").json();
  const previous = retryFailed
    ? ((await Bun.file("output/works-review.json").json()).groups as ({
        group: Group;
        decision: string;
        reason: string;
      })[])
    : [];
  const failedKeys = new Set(
    previous
      .filter((result) => result.reason.startsWith("review failed"))
      .map((result) => groupKey(result.group))
  );
  const groups: Group[] = (input.review ?? []).filter(
    (group: Group) => !retryFailed || failedKeys.has(groupKey(group))
  );
  const apiKey = getApiKey();
  const models = getConfiguredModels();
  if (!apiKey) throw new Error("No OPENCODE_GO_API_KEY set");

  console.log(`reviewing ${groups.length} groups`);

  const results: ({ group: Group } & Verdict)[] = new Array(groups.length);
  const concurrency = 5;
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= groups.length) return;
      const group = groups[index];
      try {
        const text = await callApi(
          apiKey,
          models,
          SYSTEM_PROMPT,
          buildPrompt(group),
          6000,
          2,
          true
        );
        results[index] = { group, ...parseVerdict(text) };
      } catch (error: any) {
        console.warn(`! group ${index + 1} failed: ${error.message.slice(0, 100)}`);
        results[index] = {
          group,
          decision: "different",
          confidence: 0,
          reason: `review failed: ${error.message.slice(0, 80)}`,
        };
      }
      const done = results.filter(Boolean).length;
      if (done % 5 === 0) console.log(`  ${done}/${groups.length}`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const fresh = results.filter(Boolean);
  const merged = retryFailed
    ? [
        ...previous.filter(
          (result) => !fresh.some((entry) => groupKey(entry.group) === groupKey(result.group))
        ),
        ...fresh,
      ]
    : fresh;

  const output = {
    generatedAt: new Date().toISOString(),
    groups: merged,
  };
  await Bun.write("output/works-review.json", JSON.stringify(output, null, 2));

  for (const result of fresh) {
    const names = result.group.sources
      .map((source) => `${source.sourceName}:${source.name}`)
      .join(" | ");
    console.log(`\n[${result.decision} ${result.confidence}] ${names}`);
    console.log(`  ${result.reason}`);
  }
}

await main();
