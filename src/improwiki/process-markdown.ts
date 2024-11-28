import TurndownService from "turndown";
import type { ElementType } from "../element-type";
import { appLogger } from "../logger";

export async function processMarkdown(output: {
  meta: Record<string, any>;
  elements: ElementType[];
}) {
  const turndownService = new TurndownService({
    headingStyle: "atx",
  });
  const { elements } = output;
  const logger = appLogger.getChild("processMarkdown");
  logger.info("Processing markdown");

  for (const element of elements) {
    logger.debug(`Processing markdown for ${element.htmlContent}`);
    if (element.htmlContent && typeof element.htmlContent === "string") {
      element.markdown = turndownService.turndown(element.htmlContent);

      // process markdown
      const REMOVE_EDIT_LINKS = /^\[edit]\(.*\/edit\)(\r?\n\r?\n)?/gm;
      element.markdown.replaceAll(REMOVE_EDIT_LINKS, "");
    } else {
      logger.warn(
        `Element ${element.name} (${element.identifier}) has no htmlContent`
      );
    }
  }
}
