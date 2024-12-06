import { initLogging } from "./logger";
import { scrapeImprowiki } from "./scrape-improwiki";

export class OutputReader {}

export class ImprowikiScraper {
  async enableLogging() {
    await initLogging();
  }

  async scrape() {
    return await scrapeImprowiki();
  }
}
