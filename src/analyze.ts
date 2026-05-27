import { Improbib } from ".";

const scraper = new Improbib();

await scraper.enableLogging();
await scraper.scrapeLearnImprov();

console.log("Done.");
