import { describe, expect, test } from "bun:test";
import { normalizeSourceUrl } from "./url-identity";

describe("normalizeSourceUrl", () => {
  test("folds scheme and host case", () => {
    expect(normalizeSourceUrl("HTTPS://WWW.LearnImprov.COM/bippity/")).toBe(
      normalizeSourceUrl("https://www.learnimprov.com/bippity")
    );
  });

  test("ignores a trailing slash and a fragment", () => {
    expect(
      normalizeSourceUrl("https://www.learnimprov.com/bippity/#comments")
    ).toBe("https://www.learnimprov.com/bippity");
    expect(normalizeSourceUrl("https://www.learnimprov.com/bippity/")).toBe(
      "https://www.learnimprov.com/bippity"
    );
  });

  test("keeps the root path stable", () => {
    expect(normalizeSourceUrl("https://www.learnimprov.com")).toBe(
      normalizeSourceUrl("https://www.learnimprov.com/")
    );
  });

  test("keeps path case, path segments and the query", () => {
    expect(normalizeSourceUrl("https://example.com/Some/Path/")).toBe(
      "https://example.com/Some/Path"
    );
    expect(normalizeSourceUrl("https://example.com/page?lang=en")).toBe(
      "https://example.com/page?lang=en"
    );
    // A trailing slash is not stripped from the query.
    expect(normalizeSourceUrl("https://example.com/page?next=http://a/")).toBe(
      "https://example.com/page?next=http://a/"
    );
  });

  test("does not join different paths", () => {
    expect(normalizeSourceUrl("https://example.com/a")).not.toBe(
      normalizeSourceUrl("https://example.com/b")
    );
  });
});
