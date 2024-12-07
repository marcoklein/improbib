import {
  ansiColorFormatter,
  configure,
  getConsoleSink,
  getLogger,
} from "@logtape/logtape";

export const appLogger = getLogger(["impromat-scraper"]);

export async function initLogging() {
  await configure({
    sinks: {
      console: getConsoleSink({ formatter: ansiColorFormatter }),
      // file: getFileSink("app.log"),
    },
    filters: {
      infoAndAbove: "info",
    },
    loggers: [
      {
        category: "impromat-scraper",
        level: "info",
        filters: ["infoAndAbove"],
        sinks: ["console"],
      },
      {
        category: "meta",
        level: "warning",
        sinks: ["console"],
      },
    ],
  });
}
