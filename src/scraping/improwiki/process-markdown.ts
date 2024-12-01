import TurndownService from "turndown";
import { appLogger } from "../../logger";
import type { ElementType } from "../shared/element-type";
import { processMarkdownOfElement } from "./process-markdown-of-element";

/**
 * Transforms html content to markdown and cleans markdown.
 *
 * @param output
 */
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
    if (element.identifier === "19911874ee7c6a99e23ca40ed4be969a") {
      // TODO make ignore list for elements
      // or better: mark the element quality as BAD
      element.markdown = "";
      continue;
    }
    logger.debug(`Processing markdown for ${element.htmlContent}`);
    if (element.htmlContent && typeof element.htmlContent === "string") {
      element.markdown = turndownService.turndown(element.htmlContent);
      processMarkdownOfElement(element);
    } else {
      logger.warn(
        `Element ${element.name} (${element.identifier}) has no htmlContent`
      );
    }
  }
}
