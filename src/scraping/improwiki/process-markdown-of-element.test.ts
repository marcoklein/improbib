import { describe, expect, it } from "bun:test";
import type { ElementType } from "../shared/element-type";
import { processMarkdownOfElement } from "./process-markdown-of-element";

describe("processMarkdownOfElement", () => {
  it("should process all cases in one big test", () => {
    const element = {
      markdown: `
Hello <!-- comment -->World
[edit](some/link/edit)

Hello World
## Filmbeispiel
Some content
## Another Section
Some content
_Siehe auch_ some link
Before Link (_siehe auch some link_)
## Siehe auch
Some content
## Keep after Siehe Auch
## Inhaltsverzeichnis
Inhaltsverzeichnis Content
## Table of Contents
ToC Content
## Another Section
## Verwandt
Some content
## Another Section
[Link Text](some/link)
      `.trim(),
      name: "Test Element",
      identifier: "test-element",
    } as ElementType;
    processMarkdownOfElement(element);
    expect(element.markdown).toBe(
      `
Hello World
Hello World
## Another Section
Some content

Before Link (_siehe auch some link_)
## Keep after Siehe Auch


## Another Section
## Another Section
Link Text
      `.trim()
    );
    expect(element.isMarkdownModified).toBe(1);
  });
});
