import { describe, expect, it } from "vitest";
import { plural, pluralCategory, type PluralForms } from "../src/language";
import { sentence, type Sentence } from "../src/sentence";

/**
 * THE CATEGORY A COUNT TAKES, AND THE HUNGARIAN `few`.
 *
 * Hungarian departs from CLDR for a whole 2, 3 and 4 and nowhere else; an
 * entry written before that, with two Hungarian slots, still answers 3 with
 * its `other` form. The forms here are markers, not words: no Slovak or
 * Hungarian word is written in this file.
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
