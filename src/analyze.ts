import { Improbib } from ".";

const testMode = Bun.argv.includes("--test");

const scraper = new Improbib();

await scraper.enableLogging();
await scraper.scrape(testMode ? { maxPagesPerListing: 1 } : {});

console.log("Done.");
