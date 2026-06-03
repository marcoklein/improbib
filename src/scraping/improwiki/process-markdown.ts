import type { ElementType } from "../shared/element-type";
import { convertHtmlToMarkdown } from "../shared/process-markdown";
import { processMarkdownOfElement } from "./process-markdown-of-element";

/**
 * Transforms html content to markdown and cleans markdown (improwiki-specific).
 */
export async function processMarkdown(output: {
  meta: Record<string, any>;
  elements: ElementType[];
}) {
  const { elements } = output;

  for (const element of elements) {
    if (element.identifier === "19911874ee7c6a99e23ca40ed4be969a") {
      element.markdown = "";
      continue;
    }
  }

  convertHtmlToMarkdown(elements);

  for (const element of elements) {
    if (element.markdown) {
      processMarkdownOfElement(element);
    }
  }
}
