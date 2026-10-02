import { describe, expect, it } from "vitest";

import { measure, type Dump, type SheetItem } from "../../../scripts/p217/compare";

/**
 * THE P2-17 COMPARER'S CAPITALS (DONTESEK1, 2026-10-02).
 *
 * Máté approved the Hungarian date `aug. 24.`; the report's kicker shows it as
 * `AUG. 24.` through `text-transform: uppercase`, and the dump reads innerText.
 * The comparer calls such a line IDENTICAL-UPPERCASED and counts it approved;
 * any other difference stays a difference. Every expected text below is
 * written out by hand, never derived with the function under test.
 */
const PAGE = "tomas /alpha/northgate/report?meeting=mtg_ng0132";

function dump(text: string, lang: string): Dump {
  return { [PAGE]: { url: PAGE, status: 200, lang, text } };
}

function item(en: string, sk: string, hu: string): SheetItem {
  return { n: 76, page: PAGE, en, sk, hu };
}

const EN = "NORTHGATE RESIDENCES · MEETING SUMMARY · 24 AUG · 15:39";

describe("a line the page shows in capitals", () => {
  it("is identical-uppercased when the page shows the approved text in capitals", () => {
    const verdict = measure(
      item(EN, "x", "Northgate · A találkozó összefoglalója · aug. 24. · 15:39"),
      "hu",
      dump(EN, "en"),
      dump("NORTHGATE · A TALÁLKOZÓ ÖSSZEFOGLALÓJA · AUG. 24. · 15:39", "hu"),
    );
    expect(verdict).toMatchObject({ state: "differs", uppercaseOnly: true, nbspOnly: false });
  });

  it("capitalises Slovak letters with their marks", () => {
    const verdict = measure(
      item(EN, "Ťažké otvorenie · 24. 8.", "x"),
      "sk",
      dump(EN, "en"),
      dump("ŤAŽKÉ OTVORENIE · 24. 8.", "sk"),
    );
    expect(verdict).toMatchObject({ state: "differs", uppercaseOnly: true });
  });

  it("is a difference when one letter differs besides the capitals", () => {
    const verdict = measure(
      item(EN, "x", "A találkozó összefoglalója · aug. 24."),
      "hu",
      dump(EN, "en"),
      dump("A TALÁLKOZÓ ÖSSZEFOGLALÓJA · AUG. 25.", "hu"),
    );
    expect(verdict).toMatchObject({ state: "differs", uppercaseOnly: false });
  });

  it("is a difference when the page writes the capitals into the text itself and the approved text is already capitals", () => {
    const verdict = measure(
      item(EN, "x", "AUG. 24."),
      "hu",
      dump(EN, "en"),
      dump("aug. 24.", "hu"),
    );
    expect(verdict).toMatchObject({ state: "differs", uppercaseOnly: false });
  });

  it("stays identical when the page shows the approved text as it is", () => {
    const verdict = measure(
      item(EN, "x", "A találkozó összefoglalója · aug. 24."),
      "hu",
      dump(EN, "en"),
      dump("A találkozó összefoglalója · aug. 24.", "hu"),
    );
    expect(verdict).toEqual({
      state: "identical",
      rendered: "A találkozó összefoglalója · aug. 24.",
    });
  });
});
