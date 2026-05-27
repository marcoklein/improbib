import fs from "node:fs/promises";
import { initLogging } from "./logger";
import { scrapeImprowiki } from "./scrape-improwiki";
import { scrapeLearnImprov } from "./scraping/learnimprov/scrape-learnimprov";
import { improbibSchema } from "./validation/improbib-schema";

export class Improbib {
  async enableLogging() {
    await initLogging();
  }

  async scrape() {
    await scrapeImprowiki();
    await scrapeLearnImprov();
    console.log("All sources scraped.");
  }

  async scrapeImprowiki() {
    return await scrapeImprowiki();
  }

  async scrapeLearnImprov() {
    return await scrapeLearnImprov();
  }
}

export async function readImprobibJson(filePath: string) {
  const improbib = await fs.readFile(filePath, "utf-8");
  const parsed = improbibSchema.parse(JSON.parse(improbib));
  return parsed;
}

export type ImprobibType = Awaited<ReturnType<typeof readImprobibJson>>;
