import { mkdir } from "node:fs/promises";

const storagePath = process.env.STORAGE_PATH || process.cwd();
await mkdir(storagePath, { recursive: true });
process.chdir(storagePath);

const { reparseImprowiki } = await import("./scraping/improwiki/reparse");
const { assemble } = await import("./assemble");

console.log(`Re-parsing improwiki from cache in ${storagePath} ...`);
const stats = await reparseImprowiki();
console.log(
  `Re-parsed ${stats.reparsed}/${stats.total} elements, skipped ${stats.skipped}, ` +
    `${stats.withPlayerCount} now have a player count`
);

console.log("Assembling ...");
const output = await assemble();
console.log(`Done: ${output.elements.length} elements in output/improbib.json`);
