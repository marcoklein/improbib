import { describe, expect, test } from "bun:test";
import { parseImprowikiPage } from "./process-improwiki-page";

function page(options: {
  title: string;
  language: "de" | "en";
  categories?: string[];
  card?: Record<string, string>;
}) {
  const categoriesLabel = options.language === "de" ? "Kategorien" : "Categories";
  const categoryLinks = (options.categories ?? [])
    .map((c) => `<a href="/${options.language}/kategorie/x">${c}</a>`)
    .join(", ");

  const cardSections = Object.entries(options.card ?? {})
    .map(
      ([label, value]) =>
        `<div><h3 class="text-xs">${label}</h3><p class="text-sm">${value}</p></div>`
    )
    .join("");

  return `<!doctype html>
<html><head>
<link rel="alternate" hreflang="en" href="https://improwiki.com/en/wiki/example">
</head><body>
<div class="flex"><h1 class="font-comic text-[42px]">${options.title}</h1></div>
<div class="article-content"><p>Das ist der Artikeltext.</p></div>
<aside class="sticky">
  <div class="p-5 sticky top-20 space-y-4">
    <div><h3 class="text-xs">Badge</h3><p>copy this</p></div>
    <div><h3 class="text-xs">${categoriesLabel}</h3><div class="text-sm">${categoryLinks}</div></div>
    ${cardSections}
    <div><h3 class="text-xs">Verlink uns auf deiner Seite</h3><div>embed</div></div>
  </div>
</aside>
<div class="mt-8">Zuletzt bearbeitet von Ueder, 07.08.2023 23:47</div>
</body></html>`;
}

describe("parseImprowikiPage", () => {
  test("reads the sidebar card fields from the whole aside", () => {
    const parsed = parseImprowikiPage({
      baseUrl: "https://improwiki.com",
      elementUrl: "https://improwiki.com/de/wiki/beispiel",
      fetchedAt: "2026-06-02T07:00:00.000Z",
      html: page({
        title: "Beispiel",
        language: "de",
        categories: ["Sonstige"],
        card: {
          Kompetenzen: "Pantomime, Timing, Aufmerksamkeit",
          "Anzahl Spieler": "4 bis 6",
          Erfahrung: "Anfänger, Fortgeschritten",
          Dynamik: "lebhaft",
        },
      }),
    });

    expect(parsed?.name).toBe("Beispiel");
    expect(parsed?.tags).toEqual(["Sonstige"]);
    expect(parsed?.card_Kompetenzen).toBe("Pantomime, Timing, Aufmerksamkeit");
    expect(parsed?.["card_Anzahl Spieler"]).toBe("4 bis 6");
    expect(parsed?.["card_Erfahrung"]).toBe("Anfänger, Fortgeschritten");
    expect(parsed?.["card_Dynamik"]).toBe("lebhaft");
    // UI headings must not leak into the data
    expect(Object.keys(parsed ?? {})).not.toContain("card_Badge");
    expect(Object.keys(parsed ?? {})).not.toContain(
      "card_Verlink uns auf deiner Seite"
    );
    expect(parsed?.lastUpdate).toBe("07.08.2023");
  });

  test("normalizes English field names", () => {
    const parsed = parseImprowikiPage({
      baseUrl: "https://improwiki.com",
      elementUrl: "https://improwiki.com/en/wiki/example",
      fetchedAt: "2026-06-02T07:00:00.000Z",
      html: page({
        title: "Example",
        language: "en",
        categories: ["Switches", "Chain Games"],
        card: {
          Competences: "Character, Attention",
          "Number of Players": "2 to 6",
          Experience: "Beginner",
          Energy: "calm, lively",
        },
      }),
    });

    expect(parsed?.tags).toEqual(["Switches", "Chain Games"]);
    expect(parsed?.["card_Number Players"]).toBe("2 to 6");
    expect(parsed?.card_Competences).toBe("Character, Attention");
    expect(parsed?.card_Experience).toBe("Beginner");
    expect(parsed?.card_Energy).toBe("calm, lively");
  });

  test("returns undefined when there is no element title", () => {
    const parsed = parseImprowikiPage({
      baseUrl: "https://improwiki.com",
      elementUrl: "https://improwiki.com/de/wiki/kein-element",
      fetchedAt: "2026-06-02T07:00:00.000Z",
      html: "<html><body><p>404</p></body></html>",
    });
    expect(parsed).toBeUndefined();
  });
});
