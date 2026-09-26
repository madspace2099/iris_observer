import { describe, expect, it } from "vitest";
import { duration } from "../src/duration";
import { LANGUAGES, type Language } from "../src/language";

/**
 * A LENGTH OF TIME, WHOLE, IN EVERY LANGUAGE.
 *
 * English exactly as it read before the formatter was shared; Slovak and
 * Hungarian in words, the minute and the second each taking the form its own
 * figure asks for. Every expected string is written out here.
 */

const SECONDS = [0, 1, 2, 5, 45, 59, 60, 61, 105, 3600] as const;

const EXPECTED: Readonly<Record<Language, readonly string[]>> = {
  en: ["0s", "1s", "2s", "5s", "45s", "59s", "1m 00s", "1m 01s", "1m 45s", "60m 00s"],
  sk: [
    "0 sekúnd",
    "1 sekunda",
    "2 sekundy",
    "5 sekúnd",
    "45 sekúnd",
    "59 sekúnd",
    "1 minúta",
    "1 minúta 1 sekunda",
    "1 minúta 45 sekúnd",
    "60 minút",
  ],
  hu: [
    "0 másodperc",
    "1 másodperc",
    "2 másodperc",
    "5 másodperc",
    "45 másodperc",
    "59 másodperc",
    "1 perc",
    "1 perc 1 másodperc",
    "1 perc 45 másodperc",
    "60 perc",
  ],
};

describe("duration", () => {
  it.each([...LANGUAGES])("%s: 0, 1, 2, 5, 45, 59, 60, 61, 105 and 3600 seconds", (language) => {
    expect(SECONDS.map((s) => duration(s, language))).toEqual(EXPECTED[language]);
  });

  it("writes the Slovak forms the product decision names", () => {
    expect(duration(121, "sk")).toBe("2 minúty 1 sekunda");
    expect(duration(305, "sk")).toBe("5 minút 5 sekúnd");
  });

  it("rounds to a whole second before it splits, so a minute never reads 60 seconds", () => {
    expect(duration(119.5, "en")).toBe("2m 00s");
    expect(duration(119.5, "sk")).toBe("2 minúty");
    expect(duration(119.5, "hu")).toBe("2 perc");
  });
});
