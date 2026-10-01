import { describe, expect, it } from "vitest";
import { measure, parseSheet, type Dump, type SheetItem } from "../../scripts/p217/compare";

/**
 * The P2-17 comparison keeps its three states apart (MERES1).
 *
 * An item is IDENTICAL only when the approved text is the rendered line byte
 * for byte, DIFFERS when the line is there and is not, and NOT MEASURABLE when
 * the item's English is not on the page at all — which is a limit of the
 * world rendering it, never a difference.
 */

const page = (text: string, lang: string): Dump => ({
  "petra /alpha/northgate/report": { url: "/alpha/northgate/report", status: 200, lang, text },
});

const ITEM: SheetItem = {
  n: 1,
  page: "petra /alpha/northgate/report",
  en: "Sales agents\tPartial",
  sk: "Makléri\tČiastočné",
  hu: "Értékesítők\tRészleges",
};

describe("the comparison of approved text with the rendered page", () => {
  const english = page("Heading\n\tSales agents\tPartial\t\nFooter", "en");

  it("is identical only byte for byte, with the line's outer tabs set aside", () => {
    const verdict = measure(
      ITEM,
      "sk",
      english,
      page("Hlavička\n\tMakléri\tČiastočné\t\nPäta", "sk"),
    );
    expect(verdict).toEqual({ state: "identical", rendered: "Makléri\tČiastočné" });
  });

  it("reports one changed character as a difference, with both texts", () => {
    const verdict = measure(ITEM, "sk", english, page("Hlavička\nMakleri\tČiastočné\nPäta", "sk"));
    expect(verdict).toEqual({ state: "differs", rendered: "Makleri\tČiastočné", nbspOnly: false });
  });

  it("names a difference that is only a no-break space", () => {
    const item = { ...ITEM, en: "45% of meetings", sk: "45 % stretnutí" };
    const verdict = measure(
      item,
      "sk",
      page("x\n45% of meetings\ny", "en"),
      page("x\n45\u00a0% stretnutí\ny", "sk"),
    );
    expect(verdict).toMatchObject({ state: "differs", nbspOnly: true });
  });

  it("calls an instance the page does not render not measurable, never a difference", () => {
    const verdict = measure(
      ITEM,
      "sk",
      page("Heading\nFooter", "en"),
      page("Hlavička\nPäta", "sk"),
    );
    expect(verdict.state).toBe("not_measurable");
  });

  it("does not pair lines across pages of different lengths", () => {
    const verdict = measure(ITEM, "sk", english, page("Hlavička\nMakléri\tČiastočné", "sk"));
    expect(verdict.state).toBe("not_measurable");
  });
});

describe("the approval sheets", () => {
  it("reads both forms, unescapes markdown and ignores trailing spaces", () => {
    const items = parseSheet(
      [
        "## petra /alpha/northgate/report?period=last\\_28\\_days",
        "",
        "### 1\\.",
        "",
        "**EN** It is short by 16.",
        "",
        "**SK Chýba mu ešte 16\\.**  ",
        "",
        "**HU** Még 16 hiányzik.",
        "",
        "**Javítás:**",
        "",
      ].join("\n"),
    );
    expect(items).toEqual([
      {
        n: 1,
        page: "petra /alpha/northgate/report?period=last_28_days",
        en: "It is short by 16.",
        sk: "Chýba mu ešte 16.",
        hu: "Még 16 hiányzik.",
      },
    ]);
  });

  it("refuses a sheet with a correction written in, which a person reads first", () => {
    const sheet = [
      "## petra /alpha/northgate/report",
      "### 1\\.",
      "**EN** a",
      "**SK** b",
      "**HU** c",
      "**Javítás:**",
      "SK: d",
    ].join("\n");
    expect(() => parseSheet(sheet)).toThrow(/carries a correction/);
  });
});
