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

  /* The same English line in two places: the frame's crumb and the body's heading (SHELL1). */
  const twice = page("Sales agents\tPartial\nBody\nSales agents\tPartial", "en");

  it("is identical for a line in two places only when both carry the approved text", () => {
    const verdict = measure(
      ITEM,
      "sk",
      twice,
      page("Makléri\tČiastočné\nTelo\nMakléri\tČiastočné", "sk"),
    );
    expect(verdict).toEqual({ state: "identical", rendered: "Makléri\tČiastočné" });
  });

  it("differs when one of two places keeps the English, and names both candidates", () => {
    const verdict = measure(
      ITEM,
      "sk",
      twice,
      page("Sales agents\tPartial\nTelo\nMakléri\tČiastočné", "sk"),
    );
    expect(verdict).toEqual({
      state: "differs",
      rendered: "Sales agents\tPartial  [1 of 2 places] | Makléri\tČiastočné  [1 of 2 places]",
      nbspOnly: false,
    });
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

  /* Two neighbours: item 1 offers two Slovak forms to choose from, item 2 is decided (NYOMTAT1). */
  const halfDecided = [
    "## petra /alpha/northgate/report",
    "### 1\\.",
    "**EN** Sales agents\tPartial",
    "**SK, 09-27-i tervezet:** Makléri\tČiastočné",
    "**SK, mai render:** Makléri\tČiastočne",
    "**HU** Értékesítők\tRészleges",
    "**Javítás:**",
    "",
    "### 2\\.",
    "**EN** Heading",
    "**SK** Hlavička",
    "**HU** Fejléc",
    "**Javítás:**",
  ].join("\n");

  it("reads an item with two forms to choose from as pending, and its decided neighbour as before", () => {
    const [pending, decided] = parseSheet(halfDecided);
    expect(pending?.pending).toEqual({ sk: ["Makléri\tČiastočné", "Makléri\tČiastočne"] });
    expect(pending?.hu).toBe("Értékesítők\tRészleges");
    expect(decided).toEqual({
      n: 2,
      page: "petra /alpha/northgate/report",
      en: "Heading",
      sk: "Hlavička",
      hu: "Fejléc",
    });
  });

  it("still refuses a correction written in, beside a pending item", () => {
    const corrected = halfDecided.replace(/\*\*Javítás:\*\*$/, "**Javítás:** SK: d");
    expect(() => parseSheet(corrected)).toThrow(/carries a correction/);
  });
});

describe("an item awaiting a choice between two forms (NYOMTAT1)", () => {
  const sheet = [
    "## petra /alpha/northgate/report",
    "### 1\\.",
    "**EN** Sales agents\tPartial",
    "**SK, 09-27-i tervezet:** Makléri\tČiastočné",
    "**SK, mai render:** Makléri\tČiastočne",
    "**HU** Értékesítők\tRészleges",
    "### 2\\.",
    "**EN** Heading",
    "**SK** Hlavička",
    "**HU** Fejléc",
  ].join("\n");
  const en = page("Heading\nSales agents\tPartial", "en");
  const sk = page("Hlavička\nMakléri\tČiastočné", "sk");

  it("is pending in the language that offers two forms, never a difference", () => {
    const [item] = parseSheet(sheet);
    if (item === undefined) throw new Error("no item");
    expect(measure(item, "sk", en, sk)).toMatchObject({ state: "pending_decision" });
    expect(measure(item, "hu", en, page("Fejléc\nÉrtékesítők\tRészleges", "hu"))).toEqual({
      state: "identical",
      rendered: "Értékesítők\tRészleges",
    });
  });

  it("measures the decided neighbour as before: identical, or a difference", () => {
    const [, item] = parseSheet(sheet);
    if (item === undefined) throw new Error("no item");
    expect(measure(item, "sk", en, sk)).toEqual({ state: "identical", rendered: "Hlavička" });
    expect(measure(item, "sk", en, page("Hlavicka\nMakléri\tČiastočné", "sk"))).toMatchObject({
      state: "differs",
    });
  });
});
