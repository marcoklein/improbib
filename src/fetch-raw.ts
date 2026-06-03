import path from "path";

const BASE_URL = "https://improbib.host.impromat.app/raw";
const SOURCES = ["improwiki", "learnimprov", "ircwiki"] as const;

async function main() {
  const outDir = path.join(process.cwd(), "output", "raw");
  await Bun.$`mkdir -p ${outDir}`.quiet();

  for (const source of SOURCES) {
    const url = `${BASE_URL}/${source}.json`;
    console.log(`Fetching ${url}...`);
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`  Failed: ${resp.status} ${resp.statusText}`);
      continue;
    }
    const data = await resp.json();
    const count = data.elements?.length ?? 0;
    const outPath = path.join(outDir, `${source}.json`);
    await Bun.write(outPath, JSON.stringify(data, null, 2));
    console.log(`  Wrote ${outPath} (${count} elements)`);
  }
  console.log("Done.");
}

main().catch(console.error);
