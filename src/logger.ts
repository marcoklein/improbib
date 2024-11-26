import {
  ansiColorFormatter,
  configure,
  getConsoleSink,
  getFileSink,
  getLogger,
} from "@logtape/logtape";

export const appLogger = getLogger(["app"]);

export async function initLogging() {
  await configure({
    sinks: {
      console: getConsoleSink({ formatter: ansiColorFormatter }),
      file: getFileSink("app.log"),
    },
    loggers: [
      {
        category: "app",
        level: "info",
        sinks: ["console", "file"],
      },
    ],
  });
}
