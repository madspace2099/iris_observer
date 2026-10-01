import { describe, expect, it } from "vitest";
import { LANGUAGES, type Language } from "../src/language";
import {
  hungarianAccusative,
  hungarianInstrumental,
  hungarianNumberSuffix,
  sentence,
  type Sentence,
} from "../src/sentence";

/**
 * THE NUMERAL PLACEHOLDER, `{#name|count}`.
 *
 * From 1 to 4 a sentence writes its own word for a count, and at 5 where its
 * table has a fifth cell; otherwise it writes the figure exactly as the site
 * formatted it. The words here are markers —
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

  it("reads a fifth cell at 5 where the table has one, and the figure from 6", () => {
    const five: Sentence = {
      en: { text: "<{#count|n}>", numerals: { count: ["E1", "E2", "E3", "E4", "E5"] } },
      sk: { text: "" },
      hu: { text: "" },
    };
    expect(COUNTS.map((n) => sentence("en", five, { count: FIGURE.format(n), n }))).toEqual([
      "<E1>",
      "<E2>",
      "<E3>",
      "<E4>",
      "<E5>",
      "<11>",
      "<100>",
    ]);
    expect(sentence("en", five, { count: "6", n: 6 })).toBe("<6>");
  });

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

  it("refuses one key for both the figure and the count, and names the real cause", () => {
    const same: Sentence = {
      en: { text: "{#views|views}", numerals: { views: ["E1", "E2", "E3", "E4"] } },
      sk: { text: "" },
      hu: { text: "" },
    };
    const cause = /two values under two names, the formatted figure and the count/;
    expect(() => sentence("en", same, { views: 3 })).toThrow(cause);
    expect(() => sentence("en", same, { views: "3" })).toThrow(cause);
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

describe("a counted word inside a counted word", () => {
  const NESTED: Sentence = {
    en: {
      text: "{outer|n}",
      words: {
        outer: { one: "O-one", other: "O-other {inner|m}" },
        inner: { one: "I-one", other: "I-other" },
      },
    },
    sk: { text: "" },
    hu: { text: "" },
  };

  it("is chosen by its own count once the outer word is chosen", () => {
    expect(sentence("en", NESTED, { n: 1, m: 5 })).toBe("O-one");
    expect(sentence("en", NESTED, { n: 3, m: 1 })).toBe("O-other I-one");
    expect(sentence("en", NESTED, { n: 3, m: 5 })).toBe("O-other I-other");
  });

  it("refuses a word that counts itself for ever", () => {
    const loop: Sentence = {
      en: { text: "{loop|n}", words: { loop: { one: "{loop|n}", other: "{loop|n}" } } },
      sk: { text: "" },
      hu: { text: "" },
    };
    expect(() => sentence("en", loop, { n: 1 })).toThrow(/more than three deep/);
  });
});

/*
 * The Hungarian "-s" suffix after a number: the last digit decides, and where
 * it is a nought the digit before it. Endings are read on the three-digit
 * codes the catalogue writes; the tens stand alone.
 */
describe("hungarianNumberSuffix, and {az:name-s}", () => {
  it("takes the suffix of every ending from nought to nine", () => {
    expect(
      [
        "A-100",
        "A-101",
        "A-102",
        "A-103",
        "A-104",
        "A-105",
        "A-106",
        "A-107",
        "A-108",
        "A-109",
      ].map(hungarianNumberSuffix),
    ).toEqual(["-as", "-es", "-es", "-as", "-es", "-ös", "-os", "-es", "-as", "-es"]);
  });

  it("takes the suffix of every ten, from ten to a hundred", () => {
    expect(
      ["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"].map(hungarianNumberSuffix),
    ).toEqual(["-es", "-as", "-as", "-es", "-es", "-as", "-es", "-as", "-es", "-as"]);
  });

  it("writes the article, the code and its suffix at once, on the real codes", () => {
    const code: Sentence = {
      en: { text: "" },
      sk: { text: "" },
      hu: { text: "<{az:top-s}> <{Az:top-s}> <{top-s}> <{top}>" },
    };
    expect(
      ["A-101", "A-103", "A-105", "A-106", "B-302"].map((top) => sentence("hu", code, { top })),
    ).toEqual([
      "<az A-101-es> <Az A-101-es> <A-101-es> <A-101>",
      "<az A-103-as> <Az A-103-as> <A-103-as> <A-103>",
      "<az A-105-ös> <Az A-105-ös> <A-105-ös> <A-105>",
      "<az A-106-os> <Az A-106-os> <A-106-os> <A-106>",
      "<a B-302-es> <A B-302-es> <B-302-es> <B-302>",
    ]);
  });

  it("takes -ás on a nought standing alone", () => {
    expect(hungarianNumberSuffix("0")).toBe("-ás");
  });

  it("refuses a value that does not end in a number", () => {
    expect(() => hungarianNumberSuffix("Penthouse")).toThrow(/does not end in a number/);
  });
});

/*
 * The Hungarian "-val/-vel" and accusative suffixes (BEKOTES1), as Máté
 * approved them on the P2-17 question sheet, 2026-10-01, questions 1 and 2.
 * Every expected form is written out here from the sheet, never computed.
 */
describe("hungarianInstrumental and hungarianAccusative, and {name-val} {name-t}", () => {
  const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const TENS = ["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"];

  it("takes the approved -val/-vel of every digit", () => {
    expect(DIGITS.map(hungarianInstrumental)).toEqual([
      "0-val",
      "1-gyel",
      "2-vel",
      "3-mal",
      "4-gyel",
      "5-tel",
      "6-tal",
      "7-tel",
      "8-cal",
      "9-cel",
    ]);
  });

  it("takes the approved -val/-vel of every ten, to a hundred", () => {
    expect(TENS.map(hungarianInstrumental)).toEqual([
      "10-zel",
      "20-szal",
      "30-cal",
      "40-nel",
      "50-nel",
      "60-nal",
      "70-nel",
      "80-nal",
      "90-nel",
      "100-zal",
    ]);
  });

  it("takes the approved accusative of every digit", () => {
    expect(DIGITS.map(hungarianAccusative)).toEqual([
      "0-t",
      "1-et",
      "2-t",
      "3-at",
      "4-et",
      "5-öt",
      "6-ot",
      "7-et",
      "8-at",
      "9-et",
    ]);
  });

  it("takes the approved accusative of every ten, to a hundred", () => {
    expect(TENS.map(hungarianAccusative)).toEqual([
      "10-et",
      "20-at",
      "30-at",
      "40-et",
      "50-et",
      "60-at",
      "70-et",
      "80-at",
      "90-et",
      "100-at",
    ]);
  });

  it("reads a longer number by its last non-nought place, as the sheet's own examples", () => {
    /* "16-tal kevesebb" and "74-et" stand on the sheet word for word. */
    expect(hungarianInstrumental("16")).toBe("16-tal");
    expect(hungarianAccusative("74")).toBe("74-et");
    expect(hungarianAccusative("39")).toBe("39-et");
    expect(hungarianInstrumental("12")).toBe("12-vel");
    expect(hungarianInstrumental("19")).toBe("19-cel");
  });

  it("steps back a place where the number ends in a nought, and two places on a round hundred", () => {
    expect(hungarianInstrumental("230")).toBe("230-cal");
    expect(hungarianAccusative("160")).toBe("160-at");
    expect(hungarianInstrumental("300")).toBe("300-zal");
    expect(hungarianAccusative("200")).toBe("200-at");
  });

  it("writes both through a sentence", () => {
    const shortfall: Sentence = {
      en: { text: "" },
      sk: { text: "" },
      hu: { text: "{short-val} kevesebb; {total} találkozóból {timed-t}" },
    };
    expect(sentence("hu", shortfall, { short: "16", total: "74", timed: "74" })).toBe(
      "16-tal kevesebb; 74 találkozóból 74-et",
    );
  });

  it("refuses a value that does not end in a number", () => {
    expect(() => hungarianInstrumental("Penthouse")).toThrow(/does not end in a number/);
    expect(() => hungarianAccusative("Penthouse")).toThrow(/does not end in a number/);
  });
});
