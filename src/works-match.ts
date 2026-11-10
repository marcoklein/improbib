/**
 * Group the raw source pages into works — before anything is extracted.
 *
 *   bun run src/works-match.ts
 *
 * Writes `output/works-matching.json`:
 *
 * - `auto`   — groups above the confidence threshold; safe to extract as one work
 * - `review` — groups in the review band; merge only after a human or the LLM
 *              confirms them
 *
 * The script never touches the normalized data. It is the stage that has to
 * exist before the extraction so the extractor can see all sources of a work.
 */
import { findReviewGroups, findWorkGroups } from "./normalize/work-matching";
import type { WorkSource } from "./normalize/work-matching";
import { ACTIVE_SOURCES } from "./sources";

function leadOf(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

const sources: WorkSource[] = [];
for (const sourceName of ACTIVE_SOURCES) {
  const file = Bun.file(`output/raw/${sourceName}.json`);
  if (!(await file.exists())) {
    console.warn(`! missing output/raw/${sourceName}.json`);
    continue;
  }
  const data = await file.json();
  for (const element of data.elements) {
    sources.push({
      identifier: element.identifier,
      name: element.name,
      languageCode: element.languageCode,
      sourceName: element.sourceName,
      lead: leadOf(element.htmlContent),
    });
  }
}

const byId = new Map(sources.map((source) => [source.identifier, source]));
const groups = findWorkGroups(sources);
const review = new Set(findReviewGroups(groups));

const describe = (group: (typeof groups)[number]) => ({
  confidence: group.confidence,
  method: group.method,
  languageCode: group.languageCode,
  sources: group.ids.map((id) => {
    const source = byId.get(id);
    return {
      identifier: id,
      name: source?.name ?? "",
      sourceName: source?.sourceName ?? "",
      lead: source?.lead?.slice(0, 240) ?? "",
    };
  }),
});

const output = {
  generatedAt: new Date().toISOString(),
  sourceCount: sources.length,
  auto: groups.filter((group) => !review.has(group)).map(describe),
  review: groups.filter((group) => review.has(group)).map(describe),
};

await Bun.write(
  "output/works-matching.json",
  JSON.stringify(output, null, 2)
);

console.log(
  `sources: ${sources.length} · groups: ${groups.length} · auto: ${output.auto.length} · review: ${output.review.length}`
);
for (const group of output.review) {
  console.log(
    `\nreview (${group.confidence}): ${group.sources
      .map((source) => `${source.sourceName}:${source.name}`)
      .join(" | ")}`
  );
}
console.log("\nwritten: output/works-matching.json");
