import { appLogger } from "../../logger";

export function mergeEntities<
  T extends Record<string, string | string[] | undefined | number>
>(objectA: T, objectB: T, keysToMerge: string[] = []) {
  const logger = appLogger.getChild("mergeEntities");
  const mergedObject = { ...objectA };
  logger.debug("Merging entities");
  for (const key in objectB) {
    if (keysToMerge.length > 0 && !keysToMerge.includes(key)) {
      continue;
    }
    if (objectB[key] === undefined) {
      continue;
    }
    if (objectA[key] === undefined) {
      mergedObject[key] = objectB[key];
    } else if (Array.isArray(objectA[key])) {
      mergedObject[key] = [
        ...new Set([
          ...(objectA[key] as string[]),
          ...(objectB[key] as string[]),
        ]),
      ] as T[Extract<keyof T, string>];
    } else {
      if (objectA[key] !== objectB[key]) {
        logger.warn(
          `Conflict in key ${key}: ${objectA[key]} !== ${objectB[key]} for ${objectA.name} (${objectA.identifier})`
        );
      }
      mergedObject[key] = objectB[key];
    }
  }
  return mergedObject;
}
