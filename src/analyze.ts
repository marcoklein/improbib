import { Improbib } from ".";

const scraper = new Improbib();

await scraper.enableLogging();
const result = await scraper.scrape();

const tagIdGroups = result.elements.map((element) => element.tagIds);

console.log(tagIdGroups);

const tagsUsedWithWarmup = tagIdGroups
  .filter((tagIds) => tagIds.includes("warmup"))
  .flat();

console.log([...new Set(tagsUsedWithWarmup)].sort());
