import { describe, expect, it } from "vitest";
import { plural, pluralCategory, slovakZForm, type PluralForms } from "../src/language";
import { sentence, type Sentence } from "../src/sentence";

/**
 * THE CATEGORY A COUNT TAKES, THE HUNGARIAN `few`, AND THE SLOVAK "Z" OR "ZO".
 *
 * Hungarian departs from CLDR for a whole 2, 3 and 4 and nowhere else; an
 * entry written before that, with two Hungarian slots, still answers 3 with
 * its `other` form. The plural forms here are markers, not words. The one
 * place real Slovak is written is the preposition `slovakZForm` returns, each
 * expected form stated beside its number.
 */

describe("pluralCategory", () => {
  it("puts a whole 2, 3 and 4 in Hungarian's few, and 1 and 5 where CLDR puts them", () => {
    expect([1, 2, 3, 4, 5].map((n) => pluralCategory("hu", n))).toEqual([
      "one",
      "few",
      "few",
      "few",
      "other",
    ]);
  });

  it("leaves Slovak and English as CLDR has them", () => {
    expect([1, 2, 3, 4, 5].map((n) => pluralCategory("sk", n))).toEqual([
      "one",
      "few",
      "few",
      "few",
      "other",
    ]);
    expect([1, 2, 3, 4, 5].map((n) => pluralCategory("en", n))).toEqual([
      "one",
      "other",
      "other",
      "other",
      "other",
    ]);
  });
});

describe("an entry written with two Hungarian slots", () => {
  const TWO: PluralForms = {
    en: { one: "E-one", other: "E-other" },
    sk: { one: "S-one", few: "S-few", other: "S-other" },
    hu: { one: "H-one", other: "H-other" },
  };
  const THREE: PluralForms = { ...TWO, hu: { one: "H-one", few: "H-few", other: "H-other" } };
  const COUNTED: Sentence = {
    en: { text: "{word|n}", words: { word: TWO.en } },
    sk: { text: "{word|n}", words: { word: TWO.sk } },
    hu: { text: "{word|n}", words: { word: TWO.hu } },
  };

  it("still answers 3 with its other form, in plural and in a sentence", () => {
    expect(plural("hu", 3, TWO)).toBe("H-other");
    expect(sentence("hu", COUNTED, { n: 3 })).toBe("H-other");
    expect(plural("hu", 3, THREE)).toBe("H-few");
  });
});

describe("slovakZForm", () => {
  it("reads z or zo from the word said first, at every number the rule was checked on", () => {
    const expected: readonly (readonly [number, "z" | "zo"])[] = [
      [1, "z"],
      [2, "z"],
      [3, "z"],
      [4, "zo"],
      [5, "z"],
      [6, "zo"],
      [7, "zo"],
      [8, "z"],
      [9, "z"],
      [10, "z"],
      [11, "z"],
      [12, "z"],
      [13, "z"],
      [14, "zo"],
      [15, "z"],
      [16, "zo"],
      [17, "zo"],
      [18, "z"],
      [19, "z"],
      [20, "z"],
      [24, "z"],
      [40, "zo"],
      [44, "zo"],
      [60, "zo"],
      [70, "zo"],
      [100, "zo"],
      [400, "zo"],
      [700, "zo"],
      [1000, "z"],
    ];
    for (const [n, form] of expected) expect([n, slovakZForm(n)]).toEqual([n, form]);
  });

  it("refuses what is not a whole number", () => {
    expect(() => slovakZForm(1.5)).toThrow(RangeError);
    expect(() => slovakZForm(-3)).toThrow(RangeError);
  });
});
