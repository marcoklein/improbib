import { mkdir } from "node:fs/promises";

const storagePath = process.env.STORAGE_PATH || process.cwd();
await mkdir(storagePath, { recursive: true });
process.chdir(storagePath);

const { assemble } = await import("./assemble");

console.log(`Assembling artifact in ${storagePath} ...`);
const output = await assemble();
console.log(
  `Done: ${output.elements.length} elements, ${output.works?.length ?? 0} works`
);
