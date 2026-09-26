import { describe, expect, it } from "vitest";
import { LANGUAGES, type Language } from "../src/language";
import { sentence, type Sentence } from "../src/sentence";

/**
 * THE NUMERAL PLACEHOLDER, `{#name|count}`.
 *
 * From 1 to 4 a sentence writes its own word for a count; from 5 it writes
 * the figure exactly as the site formatted it. The words here are markers —
 * E for English, S for Slovak, X and B for Hungarian — because no Slovak or
 * Hungarian numeral has been approved yet, and none is written in this file.
 */

const COUNTS = [1, 2, 3, 4, 5, 11, 100] as const;
const FIGURE = new Intl.NumberFormat("en-GB");

const NUMERAL: Sentence = {
  en: { text: "<{#count|n}>", numerals: { count: ["E1", "E2", "E3", "E4"] } },
  sk: { text: "<{#count|n}>", numerals: { count: ["S1", "S2", "S3", "S4"] } },
  hu: { text: "<{#count|n}>", numerals: { count: ["X1", "X2", "X3", "X4"] } },
};

describe("{#name|count}", () => {
  const expected: Readonly<Record<Language, readonly string[]>> = {
    en: ["<E1>", "<E2>", "<E3>", "<E4>", "<5>", "<11>", "<100>"],
    sk: ["<S1>", "<S2>", "<S3>", "<S4>", "<5>", "<11>", "<100>"],
    hu: ["<X1>", "<X2>", "<X3>", "<X4>", "<5>", "<11>", "<100>"],
  };

  it.each([...LANGUAGES])(
    "%s: the sentence's own word from 1 to 4, the figure from 5",
    (language) => {
      expect(
        COUNTS.map((n) => sentence(language, NUMERAL, { count: FIGURE.format(n), n })),
      ).toEqual(expected[language]);
    },
  );

  it("writes the figure exactly as the site formatted it, and refuses a bare number", () => {
    expect(sentence("en", NUMERAL, { count: "12,345", n: 12345 })).toBe("<12,345>");
    expect(sentence("sk", NUMERAL, { count: "12 345", n: 12345 })).toBe("<12 345>");
    expect(() => sentence("en", NUMERAL, { count: 12345, n: 12345 })).toThrow(/formatted/);
  });

  it("refuses a numeral it has no words for, and a count that is not a number", () => {
    const bare: Sentence = { en: { text: "{#count|n}" }, sk: { text: "" }, hu: { text: "" } };
    expect(() => sentence("en", bare, { count: "3", n: 3 })).toThrow(/no words/);
    expect(() => sentence("en", NUMERAL, { count: "3", n: "3" })).toThrow(/not a number/);
  });

  it("sits beside the counted word and the value, and inside a counted word", () => {
    const beside: Sentence = {
      en: {
        text: "{#count|n} {word|n} in {place}; {inside|n}",
        words: {
          word: { one: "W-one", other: "W-other" },
          inside: { one: "I-one {#count|n}", other: "I-other {#count|n}" },
        },
        numerals: { count: ["E1", "E2", "E3", "E4"] },
      },
      sk: { text: "" },
      hu: { text: "" },
    };
    expect(sentence("en", beside, { count: "1", n: 1, place: "P" })).toBe(
      "E1 W-one in P; I-one E1",
    );
    expect(sentence("en", beside, { count: "3", n: 3, place: "P" })).toBe(
      "E3 W-other in P; I-other E3",
    );
    expect(sentence("en", beside, { count: "11", n: 11, place: "P" })).toBe(
      "11 W-other in P; I-other 11",
    );
  });
});

/*
 * The Hungarian article before a numeral is chosen from the numeral as it is
 * written. X is read "iksz" and takes "az"; B is read "bé" and takes "a". A
 * figure takes the article it is read with: "az 1", "a 2" … "az 5", "a 11",
 * "a 100". So wherever a marker's article differs from its figure's, the
 * article can only have come from the marker.
 */
describe("{az:#name|count}", () => {
  const ARTICLE: Sentence = {
    en: { text: "" },
    sk: { text: "" },
    hu: {
      text: "{Az:#x|n} / {az:#b|n}",
      numerals: { x: ["X1", "X2", "X3", "X4"], b: ["B1", "B2", "B3", "B4"] },
    },
  };

  it("takes the article of the word written from 1 to 4, and of the figure from 5", () => {
    expect(
      COUNTS.map((n) => sentence("hu", ARTICLE, { x: FIGURE.format(n), b: FIGURE.format(n), n })),
    ).toEqual([
      "Az X1 / a B1",
      "Az X2 / a B2",
      "Az X3 / a B3",
      "Az X4 / a B4",
      "Az 5 / az 5",
      "A 11 / a 11",
      "A 100 / a 100",
    ]);
  });
});
