import { describe, expect, it } from "vitest";
import { sentence, slovakZForm } from "@observer/readmodels";
import { AGENT_REPORT_WORDS, REPORT_COVERAGE_CAPTION } from "@/components/report/words";

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

/* Sheet 2, question 3: the name in the nominative, as a label, above the floor. */
describe("an agent's report captions in Slovak, above the floor (sheet 2, question 3)", () => {
  const sk = AGENT_REPORT_WORDS.sk;
  const name = "Akhilesh Undev";

  it("writes item 22, the running order", () => {
    expect(sk.presentationCaption(name, false, 22, 20)).toBe(
      "Akhilesh Undev: Poradie sekcií ukazuje, na ktorom mieste sa každá z nich v priemere objavuje počas stretnutí. Nejde o priebeh konkrétneho stretnutia. Pri každej sekcii je medián času stráveného v nej, jej podiel na meranom čase prezentácií a medián tímu na porovnanie; samotný čas sekcie by nemal mierku.",
    );
  });

  it("writes item 24, the apartment sizes", () => {
    expect(sk.buyersCaption(name, false, 22, 20)).toBe(
      "Akhilesh Undev: Každý riadok predstavuje konkrétnu veľkosť bytu: podiel stretnutí, na ktorých otvorili aspoň 1 byt tejto veľkosti, a rovnaký podiel zo všetkých stretnutí na projekte v danom období. Podiely v riadkoch sa nesčítajú na 100 % a nejde o skladbu bytov: stretnutie, na ktorom ukázali 1-izbový byt aj 4-izbový penthouse, sa započíta do oboch riadkov.",
    );
  });

  it("writes item 25 at 22 meetings", () => {
    expect(sk.outcomeCaption(name, false, 22, 20)).toBe(
      "Akhilesh Undev: Takto sa skončili stretnutia v danom období: všetkých 22 stretnutí je rozdelených podľa výsledku zaznamenaného na ich konci. Menovateľom je 22 stretnutí. Tie, pri ktorých výsledok nezaznamenali, majú vlastný riadok; nezaraďujú sa do riadka, ktorý naznačuje, že sa niečo stalo.",
    );
  });

  it("writes item 25 at 1 meeting, a form only a direct call reaches while the floor is 20", () => {
    expect(sk.outcomeCaption(name, false, 1, 20)).toBe(
      "Akhilesh Undev: Takto sa skončilo 1 stretnutie v danom období: je zaradené podľa výsledku zaznamenaného na jeho konci. Menovateľom je 1 stretnutie. Ak výsledok nezaznamenali, stretnutie má vlastný riadok; nezaraďuje sa do riadka, ktorý naznačuje, že sa niečo stalo.",
    );
  });

  it("writes item 25 at 3 meetings, likewise", () => {
    expect(sk.outcomeCaption(name, false, 3, 20)).toBe(
      "Akhilesh Undev: Takto sa skončili stretnutia v danom období: všetky 3 stretnutia sú rozdelené podľa výsledku zaznamenaného na ich konci. Menovateľom sú 3 stretnutia. Tie, pri ktorých výsledok nezaznamenali, majú vlastný riadok; nezaraďujú sa do riadka, ktorý naznačuje, že sa niečo stalo.",
    );
  });
});
