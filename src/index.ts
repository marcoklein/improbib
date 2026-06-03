import fs from "node:fs/promises";
import { initLogging } from "./logger";
import { scrapeImprowiki } from "./scrape-improwiki";
import { scrapeLearnImprov } from "./scraping/learnimprov/scrape-learnimprov";
import { scrapeIrcWiki } from "./scraping/ircwiki/scrape-ircwiki";
import { assemble } from "./assemble";
import { improbibSchema } from "./validation/improbib-schema";

export class Improbib {
  async enableLogging() {
    await initLogging();
  }

  async scrape(options?: { maxPagesPerListing?: number }) {
    await scrapeImprowiki(options);
    await scrapeLearnImprov(options);
    await scrapeIrcWiki(options);
    console.log("All sources scraped.");
    await assemble();
  }

  async scrapeImprowiki() {
    return await scrapeImprowiki();
  }

  async scrapeLearnImprov() {
    return await scrapeLearnImprov();
  }

  async scrapeIrcWiki() {
    return await scrapeIrcWiki();
  }

  async assemble() {
    return await assemble();
  }
}

export async function readImprobibJson(filePath: string) {
  const improbib = await fs.readFile(filePath, "utf-8");
  const parsed = improbibSchema.parse(JSON.parse(improbib));
  return parsed;
}

export type ImprobibType = Awaited<ReturnType<typeof readImprobibJson>>;
