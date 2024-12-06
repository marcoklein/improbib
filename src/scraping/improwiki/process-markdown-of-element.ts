import { appLogger } from "../../logger";
import type { ElementType } from "../shared/element-type";

export function processMarkdownOfElement(element: ElementType) {
  if (!element.markdown) throw new Error(`markdown is required`);

  const logger = appLogger.getChild("processMarkdownOfElement");
  const unmodifiedMarkdown = element.markdown;

  // process markdown
  const REMOVE_MARKDOWN_COMMENTS = /<!--(.|\r?\n)*?-->/g;
  const REMOVE_EDIT_LINKS = /^\[edit]\(.*\/edit\)(\r?\n\r?\n)?/gm;
  const REMOVE_FILMBEISPIELE = /^#{2,3} Filmbeispiel([^#])*/gm;
  const REGEX_REMOVE_SEE_ALSO_LINE = /^_?[Ss]iehe [Aa]uch_?.*$$/gm;
  const REGEX_REMOVE_SEE_ALSO_INLINE =
    / \(_?[Ss]iehe [Aa]uch_?.*?(\(.*?\)).*?\)/g;
  const REGEX_REMOVE_SEE_ALSO_SECTION = /^#{2,3} [Ss]iehe [Aa]uch([^#])*/gm;
  const REMOVE_TABLE_OF_CONTENTS =
    /(^#{2,3} (Inhaltsverzeichnis|Table of Contents)(.|\n)*?^)([^#])*/gim;
  const REMOVE_RELATED = /^#{2,3} Verwandt([^#])*/gm;
  const REPLACE_LINKS = /\[(.*?)]\(.*?\)/gm;

  element.originalMarkdown = element.markdown;
  element.markdown = element.markdown.trim();
  element.markdown = element.markdown.replaceAll(REMOVE_MARKDOWN_COMMENTS, "");
  element.markdown = element.markdown.replaceAll(REMOVE_EDIT_LINKS, "");
  element.markdown = element.markdown.replaceAll(REMOVE_FILMBEISPIELE, "");
  element.markdown = element.markdown.replaceAll(
    REGEX_REMOVE_SEE_ALSO_LINE,
    ""
  );
  element.markdown = element.markdown.replaceAll(
    REGEX_REMOVE_SEE_ALSO_INLINE,
    ""
  );
  element.markdown = element.markdown.replaceAll(
    REGEX_REMOVE_SEE_ALSO_SECTION,
    ""
  );
  element.markdown = element.markdown.replaceAll(REMOVE_RELATED, "");

  element.markdown = element.markdown.replaceAll(REPLACE_LINKS, "$1");

  element.markdown = element.markdown.replaceAll(
    REMOVE_TABLE_OF_CONTENTS,
    "$3"
  );

  const changedCharacterPercentage =
    (unmodifiedMarkdown.length - element.markdown.length) /
    unmodifiedMarkdown.length;
  logger.debug(
    `Markdown for ${element.name} (${element.identifier}) changed by ${
      changedCharacterPercentage * 100
    }%`
  );
  if (changedCharacterPercentage > 0.1 && changedCharacterPercentage < 0.4) {
    logger.warn(
      `Markdown for ${element.name} (${element.identifier}) changed by ${
        changedCharacterPercentage * 100
      }%`
    );
  } else if (changedCharacterPercentage > 0.4) {
    logger.error(
      `Markdown for ${element.name} (${element.identifier}) changed by ${
        changedCharacterPercentage * 100
      }%`
    );
    logger.warn("Original markdown: {unmodifiedMarkdown}", {
      unmodifiedMarkdown,
    });
    logger.warn("New markdown: {elementMarkdown}", {
      elementMarkdown: element.markdown,
    });
    // throw new Error(
    //   `Markdown for ${element.name} (${element.identifier}) changed by ${
    //     changedCharacterPercentage * 100
    //   }%`
    // );
  }

  if (element.originalMarkdown !== element.markdown) {
    element.isMarkdownModified = 1;
  } else {
    element.isMarkdownModified = 0;
    element.originalMarkdown = undefined;
  }

  // TODO links could point to other elements => extract them and see if we can look them up
}
