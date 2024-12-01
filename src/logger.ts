import {
  ansiColorFormatter,
  configure,
  getConsoleSink,
  getFileSink,
  getLogger,
} from "@logtape/logtape";

export const appLogger = getLogger(["impromat-scraper"]);

export async function initLogging() {
  await configure({
    sinks: {
      console: getConsoleSink({ formatter: ansiColorFormatter }),
      file: getFileSink("app.log"),
    },
    loggers: [
      {
        category: "impromat-scraper",
        level: "info",
        sinks: ["console", "file"],
      },
      {
        category: "meta",
        level: "warning",
        sinks: ["console", "file"],
      },
    ],
  });
}
