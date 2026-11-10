/**
 * Test run for the merged-work extraction.
 *
 * Takes the source pages of a work, hands all of them to one extraction, and
 * writes the result next to a compact report. Used to check the merge prompt
 * on real data before it runs over the whole library.
 *
 *   bun run src/works-test.ts "Freeze Tag" "Der Mord"
 *
 * The work groups come from the published artifact, so this script tests the
 * *extraction*, not the matcher (which has its own evaluation).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createOpencodeGoClient } from "./normalize/llm-client";
import type { WorkSourceInput } from "./normalize/llm-client";
import type { ElementType } from "./scraping/shared/element-type";
import { truncateMarkdown } from "./scraping/shared/markdown-limit";

interface ArtifactWork {
  id: string;
  name: string;
  languageCode: string;
  memberIds: string[];
  sources: { sourceName: string; identifier: string; url: string }[];
}

const OUTPUT_DIR = path.join("output", "works-test");

function fileSafe(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "work"
  );
}

async function main(): Promise<void> {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error('Usage: bun run src/works-test.ts "<work name>" ["<work name>" …]');
    process.exit(1);
  }

  const artifact = await Bun.file("output/improbib.json").json();
  const works: ArtifactWork[] = artifact.works;
  const elementsById = new Map<string, ElementType>(
    artifact.elements.map((element: ElementType) => [element.identifier, element])
  );

  // Raw HTML is what the pipeline has before any extraction. The published
  // element carries the capped markdown, which is fine for a test run and much
  // closer to what the real extraction sees.
  const rawBySource = new Map<string, ElementType[]>();
  for (const source of ["improwiki", "learnimprov"]) {
    const data = await Bun.file(`output/raw/${source}.json`).json();
    rawBySource.set(source, data.elements);
  }
  const rawById = new Map<string, ElementType>();
  for (const elements of rawBySource.values()) {
    for (const element of elements) rawById.set(element.identifier, element);
  }

  const client = createOpencodeGoClient();
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const name of names) {
    const [workName, wantedLanguage] = name.split("#");
    const matches = works.filter(
      (work) =>
        work.name.toLowerCase() === workName.toLowerCase() &&
        (!wantedLanguage || work.languageCode === wantedLanguage)
    );
    if (matches.length === 0) {
      console.error(`! no work named "${workName}"`);
      continue;
    }

    for (const work of matches) {
      const sources: WorkSourceInput[] = work.memberIds
        .map((id) => rawById.get(id) ?? elementsById.get(id))
        .filter((element): element is ElementType => Boolean(element))
        .map((element) => ({
          identifier: element.identifier,
          name: element.name,
          sourceName: element.sourceName,
          url: element.url,
          languageCode: element.languageCode,
          // Raw HTML first — that is what the real extraction sees. Split
          // children only exist as markdown in the artifact.
          content:
            element.htmlContent && element.htmlContent.length > 0
              ? element.htmlContent
              : truncateMarkdown(element.markdown ?? ""),
        }));

      if (sources.length === 0) {
        console.error(`! ${work.name}: no raw sources found`);
        continue;
      }

      console.log(
        `\n=== ${work.name} (${work.languageCode}) — ${sources.length} source(s): ${sources
          .map((source) => source.sourceName)
          .join(", ")}`
      );

      const started = Date.now();
      const normalized = await client.normalizeWork(sources);
      const seconds = ((Date.now() - started) / 1000).toFixed(1);

      const record = {
        testWork: {
          id: work.id,
          name: work.name,
          languageCode: work.languageCode,
          sourceCount: sources.length,
          sources: sources.map((source) => ({
            identifier: source.identifier,
            sourceName: source.sourceName,
            name: source.name,
            url: source.url,
            contentChars: source.content.length,
          })),
          seconds: Number(seconds),
        },
        normalized,
      };

      const file = path.join(OUTPUT_DIR, `${fileSafe(work.name)}-${work.languageCode}.json`);
      await Bun.write(file, JSON.stringify(record, null, 2));

      const steps = normalized.normalized.howToPlay?.steps ?? [];
      console.log(`summary:    ${normalized.normalized.summary}`);
      console.log(`steps:      ${steps.length}`);
      steps.forEach((step, index) => console.log(`  ${index + 1}. ${step.action}`));
      console.log(`tips:       ${normalized.normalized.tips.length}`);
      console.log(`variations: ${normalized.normalized.variations.length}`);
      console.log(
        `skills:     ${normalized.normalized.skills.join(", ") || "(none)"}`
      );
      console.log(
        `usage:      ${(normalized.normalized.practical.usage ?? []).join(", ") || "(none)"}`
      );
      console.log(
        `requires:   ${normalized.normalized.practical.requires ?? "(none)"}`
      );
      console.log(`written:    ${file}`);
    }
  }
}

await main();
