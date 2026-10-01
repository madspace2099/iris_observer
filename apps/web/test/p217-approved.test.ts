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

/*
 * Sheet 1, items 37 to 39, below the floor: at 4 meetings word for word as
 * approved; at 1 and from 5 with the phrases Máté gave for those counts
 * (sheet 2, question 4) set into the same sentence.
 */
describe("an agent's report captions in Slovak, below the floor (sheet 2, question 4)", () => {
  const sk = AGENT_REPORT_WORDS.sk;
  const name = "Meno nie je k dispozícii · observer-review-harness";

  it("writes item 37 at 4 meetings, as approved", () => {
    expect(sk.presentationCaption(name, true, 4, 20)).toBe(
      "Meno nie je k dispozícii · observer-review-harness: pri každej sekcii je uvedené, na ktorom mieste býva v priemere naprieč stretnutiami a aký je medián času stráveného v nej. Nejde o priebeh konkrétneho stretnutia. Podiel na meranom čase makléra ani medián tímu sa vedľa jednotlivých sekcií neuvádzajú. Pri 4 stretnutiach chýba do hranice 20 ešte 16; podiel by sa dal čítať ako hodnotenie a porovnanie s tímom ako úsudok o práci makléra, hoci vzorka je na oboje príliš malá.",
    );
  });

  it("writes item 37's count at 1, 3 and 5 meetings in the forms given", () => {
    const at = (n: number) => sk.presentationCaption(name, true, n, 20);
    expect(at(1)).toContain(" Pri 1 stretnutí chýba do hranice 20 ešte 19; ");
    expect(at(3)).toContain(" Pri 3 stretnutiach chýba do hranice 20 ešte 17; ");
    expect(at(5)).toContain(" Pri 5 stretnutiach chýba do hranice 20 ešte 15; ");
  });

  it("writes item 38 at 4 meetings, as approved", () => {
    expect(sk.buyersCaption(name, true, 4, 20)).toBe(
      "Meno nie je k dispozícii · observer-review-harness: tie stretnutia tohto makléra, na ktorých otvorili aspoň 1 byt danej veľkosti. Ak na tom istom stretnutí ukázali 1-izbový byt aj 4-izbový penthouse, započíta sa do oboch skupín. Súčet týchto počtov preto nie je počtom stretnutí. Vedľa počtov nie je podiel za celý projekt: pri 4 stretnutiach, teda 16 pod hranicou 20, by porovnanie naznačovalo hodnotenie práce makléra na základe príliš malej vzorky.",
    );
  });

  it("writes item 38's parenthesis at 1 and at 5 meetings in the forms given", () => {
    expect(sk.buyersCaption(name, true, 1, 20)).toContain(
      ": pri 1 stretnutí, keď do hranice 20 chýba 19, by porovnanie",
    );
    expect(sk.buyersCaption(name, true, 5, 20)).toContain(
      ": pri 5 stretnutiach, keď do hranice 20 chýba 15, by porovnanie",
    );
  });

  it("writes item 39 at 4 meetings, as approved", () => {
    expect(sk.outcomeCaption(name, true, 4, 20)).toBe(
      "Meno nie je k dispozícii · observer-review-harness: všetky stretnutia tohto makléra v danom období sú rozdelené podľa výsledku zaznamenaného na ich konci. Menovateľom sú 4 stretnutia. Tie bez zaznamenaného výsledku majú vlastný riadok; nezaraďujú sa do riadka, ktorý naznačuje, že sa niečo stalo. Vedľa počtov nie sú podiely: pri 4 stretnutiach chýba do hranice 20 ešte 16, takže z takto vypočítanej miery nemožno vychádzať pri rozhodovaní. Pri každom počte už je uvedený menovateľ, z ktorého sa podiel počíta.",
    );
  });

  it("writes item 39's denominator and count at 1, 3 and 5 meetings in the forms given", () => {
    const at = (n: number) => sk.outcomeCaption(name, true, n, 20);
    expect(at(1)).toContain(" Menovateľom je 1 stretnutie. ");
    expect(at(1)).toContain(": pri 1 stretnutí chýba do hranice 20 ešte 19, ");
    expect(at(3)).toContain(" Menovateľom sú 3 stretnutia. ");
    expect(at(5)).toContain(" Menovateľom je 5 stretnutí. ");
    expect(at(5)).toContain(": pri 5 stretnutiach chýba do hranice 20 ešte 15, ");
  });
});
