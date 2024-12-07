import { initLogging } from "./logger";
import { scrapeImprowiki } from "./scrape-improwiki";

export class Improbib {
  async enableLogging() {
    await initLogging();
  }

  async scrape() {
    return await scrapeImprowiki();
  }
}
