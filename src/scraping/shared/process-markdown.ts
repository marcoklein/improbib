import TurndownService from "turndown";
import { appLogger } from "../../logger";
import type { ElementType } from "./element-type";

export function convertHtmlToMarkdown(elements: ElementType[]) {
  const turndownService = new TurndownService({
    headingStyle: "atx",
  });
  const logger = appLogger.getChild("convertHtmlToMarkdown");
  logger.info("Processing markdown");

  for (const element of elements) {
    logger.debug(`Processing markdown for ${element.name}`);
    if (element.htmlContent && typeof element.htmlContent === "string") {
      element.markdown = turndownService.turndown(element.htmlContent);
    } else {
      logger.warn(
        `Element ${element.name} (${element.identifier}) has no htmlContent`
      );
    }
  }
}
