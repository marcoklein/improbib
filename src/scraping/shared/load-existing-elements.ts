import fs from "node:fs/promises";
import path from "path";
import type { ElementType } from "./element-type";

export async function loadExistingElements(
  sourceName: string
): Promise<{ elements: ElementType[]; urlMap: Map<string, ElementType> }> {
  const rawFile = path.join(
    process.cwd(),
    "output",
    "raw",
    `${sourceName}.json`
  );
  try {
    await fs.access(rawFile);
  } catch {
    return { elements: [], urlMap: new Map() };
  }

  const raw = JSON.parse(await fs.readFile(rawFile, "utf-8"));
  const elements: ElementType[] = raw.elements || [];
  const urlMap = new Map<string, ElementType>();
  for (const element of elements) {
    urlMap.set(element.url, element);
  }
  return { elements, urlMap };
}
