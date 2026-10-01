import { describe, expect, it } from "vitest";
import { sentence } from "@observer/readmodels";
import { DEAL_STATED_SENTENCE, SLOVAK_SOURCE_AFTER_PODLA } from "../src/deals";
import { suppressionNoteFor } from "../src/showroom/views3";

/**
 * THE APPROVED P2-17 TEXTS, AT THE FUNCTION THAT WRITES THEM (BEKOTES1).
 *
 * Every string expected here is copied from Máté's approval sheets
 * (`p217-1-bekezdesek.md`, and his answers on `p217-2-kerdesek.md`,
 * 2026-10-01), never built by the code under test. A branch the synthetic world
 * renders is also proven on the page (`e2e/p217-approved.spec.ts`); a branch it
 * cannot render — one meeting, a presenter no directory names, a connector the
 * demonstration does not use — is proven here alone.
 */

describe("the shortfall below the floor, in Hungarian (sheet 2, question 1)", () => {
  it("writes item 5 for a named presenter: 19 meetings, 1 short", () => {
    expect(suppressionNoteFor(19, "sk-SK", "sentence", "hu")).toBe(
      "Ebben az időszakban 19 találkozója volt, 1-gyel kevesebb az értékeléshez szükséges 20-nál. A számok láthatók, de rangsort és trendet nem állapítanak meg.",
    );
  });

  it("writes item 13 for a presenter no directory names, in the roster", () => {
    expect(
      suppressionNoteFor(4, "sk-SK", "sentence", "hu", { unnamed: true, where: "roster" }),
    ).toBe(
      "Ebben az időszakban ennek az értékesítőnek 4 találkozója volt, 16-tal kevesebb az értékeléshez szükséges 20-nál. A számok láthatók, de rangsort és trendet nem állapítanak meg.",
    );
  });

  it("writes item 36 for a presenter no directory names, on their own page", () => {
    expect(
      suppressionNoteFor(4, "sk-SK", "sentence", "hu", { unnamed: true, where: "detail" }),
    ).toBe(
      "Ebben az időszakban 4 találkozója volt az értékesítőnek, 16-tal kevesebb az értékeléshez szükséges 20-nál. A számok láthatók, de rangsort és trendet nem állapítanak meg.",
    );
  });
});

/* Sheet 2, question 5: who stated the deals, after Slovak "Podľa", and the count's three forms. */
describe("item 8's opening sentence in Slovak (sheet 2, question 5)", () => {
  const stated = (connector: keyof typeof SLOVAK_SOURCE_AFTER_PODLA, n: number) =>
    sentence("sk", DEAL_STATED_SENTENCE, {
      count: n,
      connector: "",
      Connector: "",
      source: SLOVAK_SOURCE_AFTER_PODLA[connector],
    });

  it("names each connector as given", () => {
    expect(
      (["synthetic", "csv", "realpad", "monday", "lomnio"] as const).map((c) => stated(c, 60)),
    ).toEqual([
      "Podľa demonštračného CRM je aktuálne evidovaných 60 obchodov.",
      "Podľa tabuľky obchodov je aktuálne evidovaných 60 obchodov.",
      "Podľa systému REALPAD je aktuálne evidovaných 60 obchodov.",
      "Podľa systému Monday je aktuálne evidovaných 60 obchodov.",
      "Podľa systému Lomnio je aktuálne evidovaných 60 obchodov.",
    ]);
  });

  it("writes the count's one, few and many forms as given", () => {
    expect([1, 3, 5].map((n) => stated("synthetic", n))).toEqual([
      "Podľa demonštračného CRM je aktuálne evidovaný 1 obchod.",
      "Podľa demonštračného CRM sú aktuálne evidované 3 obchody.",
      "Podľa demonštračného CRM je aktuálne evidovaných 5 obchodov.",
    ]);
  });
});
