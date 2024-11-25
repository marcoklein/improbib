import { appLogger } from "./logger";

export function mergeEntities<
  T extends Record<string, string | string[] | undefined>
>(objectA: T, objectB: T) {
  const logger = appLogger.getChild("mergeEntities");
  const mergedObject = { ...objectA };
  logger.debug("Merging entities");
  for (const key in objectB) {
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
          `Conflict in key ${key}: ${objectA[key]} !== ${objectB[key]}`
        );
      }
      mergedObject[key] = objectB[key];
    }
  }
  return mergedObject;
}
