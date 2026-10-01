import { describe, expect, it } from "vitest";
import { sentence, slovakZForm } from "@observer/readmodels";
import { REPORT_COVERAGE_CAPTION } from "@/components/report/words";

/**
 * THE APPROVED P2-17 TEXTS THE REPORT PAGE WRITES ITSELF (BEKOTES1).
 *
 * Every expected string is copied from Máté's approval sheets, 2026-10-01,
 * never built by the code under test. The page passes the same values as here
 * (`report/page.tsx`).
 */

const coverage = (timed: number, total: number) =>
  sentence("hu", REPORT_COVERAGE_CAPTION, {
    timed: String(timed),
    total: String(total),
    from: slovakZForm(total),
  });

describe("the team's timed coverage, in Hungarian (sheet 2, question 2)", () => {
  it("writes item 4: 74 of 74", () => {
    expect(coverage(74, 74)).toBe(
      "Szakaszonként látszik, mire fordítja a csapat a bemutatók idejét, és mennyi az egyes szakaszokban töltött idő mediánja. Az arányokat a mérhető időből számolják: 74 találkozóból 74-et rögzítettek időadatokkal, minden lépésnél.",
    );
  });

  it("writes item 10: 39 of 39", () => {
    expect(coverage(39, 39)).toBe(
      "Szakaszonként látszik, mire fordítja a csapat a bemutatók idejét, és mennyi az egyes szakaszokban töltött idő mediánja. Az arányokat a mérhető időből számolják: 39 találkozóból 39-et rögzítettek időadatokkal, minden lépésnél.",
    );
  });
});
