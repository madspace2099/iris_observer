import { describe, expect, it } from "vitest";
import { LANGUAGES, sentence, slovakZForm } from "@observer/readmodels";

import {
  REPORT_BLANK_SECTIONS,
  REPORT_COVERAGE_CAPTION,
  REPORT_LEFT_OUT_SECTIONS,
  REPORT_WORDS,
} from "@/components/report/words";

/**
 * THE REPORT PAGE'S OWN WORDS, IN EACH LANGUAGE (P2-17).
 *
 * The tables are typed alike, so a word missing in one language does not
 * compile; what the types cannot see is a word left empty, and a Slovak "z"
 * written before a number that takes "zo". Every expected sentence is written
 * out here.
 */
describe("the report page's words", () => {
  it("are written, every one, in every language", () => {
    for (const language of LANGUAGES) {
      const empty = Object.entries(REPORT_WORDS[language]).filter(
        ([, value]) => typeof value === "string" && value.trim().length === 0,
      );
      expect(empty, language).toEqual([]);
    }
  });

  it("read the Slovak 'z' or 'zo' from the total it stands before", () => {
    const blank = (total: number) =>
      sentence("sk", REPORT_BLANK_SECTIONS, {
        count: "1",
        total: String(total),
        from: slovakZForm(total),
        n: 1,
      });
    expect(blank(7)).toBe("1 zo 7 sekcií by bola prázdna a každá uvádza prečo.");
    expect(blank(8)).toBe("1 z 8 sekcií by bola prázdna a každá uvádza prečo.");
    expect(
      sentence("sk", REPORT_LEFT_OUT_SECTIONS, {
        count: "2",
        total: "4",
        from: slovakZForm(4),
        n: 2,
      }),
    ).toBe("2 zo 4 boli vynechané na žiadosť čitateľa.");
    expect(
      sentence("sk", REPORT_COVERAGE_CAPTION, {
        timed: "60",
        total: "74",
        from: slovakZForm(74),
      }),
    ).toContain("zmerať: 60 zo 74 stretnutí");
  });
});
