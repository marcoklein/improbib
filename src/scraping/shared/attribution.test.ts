import { describe, expect, test } from "bun:test";
import {
  extractAttribution,
  extractImprowikiAttribution,
  extractIrcWikiAttribution,
  extractLearnImprovAttribution,
} from "./attribution";

describe("extractImprowikiAttribution", () => {
  test("reads the German edit footer", () => {
    const html = `
      <footer>
        Zuletzt bearbeitet von improwiki, 11.05.2026 20:10 ·
        <a href="/de/wiki/freeze-tag/history">Versionsgeschichte</a>
      </footer>`;

    expect(extractImprowikiAttribution(html)).toEqual({
      authors: [],
      lastModified: "2026-05-11",
    });
  });

  test("reads the English edit footer", () => {
    const html = "Last edited by improwiki, 11.05.2026 19:48";

    expect(extractImprowikiAttribution(html).lastModified).toBe("2026-05-11");
  });

  test("handles editor names that contain digits", () => {
    // The old date regex required 80 non-digit characters before the date, so
    // a user name like "testy99" made it miss the date entirely.
    const html = "Zuletzt bearbeitet von testy99, 01.12.2013 10:00";

    expect(extractImprowikiAttribution(html)).toEqual({
      authors: [],
      lastModified: "2013-12-01",
    });
  });

  test("returns no attribution when the footer is missing", () => {
    expect(extractImprowikiAttribution("<p>Freeze Tag</p>")).toEqual({
      authors: [],
    });
  });
});

describe("extractLearnImprovAttribution", () => {
  test("reads the WordPress byline and date", () => {
    const html = `
      <div class="adt">
        By
        <span class="vcard author">
          <span class="fn"><a rel="author">learnimprov</a></span>
        </span>
        <span class="meta-sep">|</span>
        <span class="date updated">January 30, 2019</span>
      </div>`;

    expect(extractLearnImprovAttribution(html)).toEqual({
      authors: ["learnimprov"],
      lastModified: "2019-01-30",
    });
  });

  test("deduplicates repeated bylines", () => {
    const html = `
      <span class="vcard author"><span class="fn">learnimprov</span></span>
      <span class="vcard author"><span class="fn">learnimprov</span></span>`;

    expect(extractLearnImprovAttribution(html).authors).toEqual([
      "learnimprov",
    ]);
  });

  test("returns no attribution without a byline", () => {
    expect(extractLearnImprovAttribution("<p>No byline</p>")).toEqual({
      authors: [],
    });
  });
});

describe("extractIrcWikiAttribution", () => {
  test("reads the MediaWiki last-edited footer", () => {
    const html = `
      <div id="footer">
        <li id="lastmod">This page was last edited on 29 December 2023, at 18:26.</li>
      </div>`;

    expect(extractIrcWikiAttribution(html)).toEqual({
      authors: [],
      lastModified: "2023-12-29T18:26:00.000Z",
    });
  });

  test("returns no attribution when the footer is missing", () => {
    expect(extractIrcWikiAttribution("<p>No footer</p>")).toEqual({
      authors: [],
    });
  });
});

describe("extractAttribution", () => {
  test("dispatches by source and ignores unknown sources", () => {
    expect(
      extractAttribution("improwiki", "Last edited by improwiki, 01.02.2020 10:00")
        .lastModified
    ).toBe("2020-02-01");
    expect(extractAttribution("unknown", "anything")).toEqual({ authors: [] });
  });
});
