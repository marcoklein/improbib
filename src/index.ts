import fs from "node:fs/promises";
import { initLogging } from "./logger";
import { scrapeImprowiki } from "./scrape-improwiki";
import { improbibSchema } from "./validation/improbib-schema";

export class Improbib {
  async enableLogging() {
    await initLogging();
  }

  async scrape() {
    return await scrapeImprowiki();
  }
}

export async function readImprobibJson(filePath: string) {
  const improbib = await fs.readFile(filePath, "utf-8");

  const parsed = improbibSchema.parse(JSON.parse(improbib));

  return parsed;
}

export type ImprobibType = Awaited<ReturnType<typeof readImprobibJson>>;
