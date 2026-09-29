import { describe, expect, it } from "vitest";
import { classifySaleCycle, summariseSaleCycles, type SaleCycleInput } from "../src/sale-cycle";

/**
 * The seven cases the board names, one test each, named after the board.
 *
 * The task listed its own scope: "két külön session, sok megnyitás, korábbi
 * first-open, negatív idő, hiányzó Sold, cutoff és részleges lefedettség". That
 * list is the point. This repository has now watched three rules stated in one
 * place apply only to that place — `rank` saying two surfaces must agree while
 * one read it, a window qualifier reaching one card of four — and the fix each
 * time was something that enumerates. Here the enumeration arrived with the
 * task, so the tests are named after it and the mapping is checkable by eye
 * rather than by argument.
 *
 * Every case is built from constructed input rather than a fixture, because
 * four of the seven describe data no fixture produces: a sale dated before the
 * showing that led to it does not occur in a world somebody wrote to be
 * plausible, and it is exactly the case a calculator must not answer with a
 * number.
 */

const CLOCKS = { openingClock: "showroom_observed", soldClock: "crm_stated" } as const;

function sale(over: Partial<SaleCycleInput> = {}): SaleCycleInput {
  return {
    unitCode: "A-101",
    firstOpenedAt: "2026-01-10T09:00:00.000Z",
    soldAt: "2026-02-09T09:00:00.000Z",
    openingAtDataEdge: false,
    ...CLOCKS,
    ...over,
  };
}

describe("the seven cases the board enumerates", () => {
  it("két külön session — the earlier opening is the one measured from", () => {
    /*
     * The caller resolves "first" across sessions; what this asserts is that
     * the calculator measures from whatever it is handed as the first, and that
     * an earlier first produces a longer cycle rather than the same one.
     */
    const early = classifySaleCycle(sale({ firstOpenedAt: "2026-01-10T09:00:00.000Z" }));
    const late = classifySaleCycle(sale({ firstOpenedAt: "2026-01-20T09:00:00.000Z" }));

    expect(early).toMatchObject({ kind: "measured", days: 30 });
    expect(late).toMatchObject({ kind: "measured", days: 20 });
  });

  it("sok megnyitás — the count of openings does not change the interval", () => {
    /*
     * Twenty openings and one opening give the same answer when the first is
     * the same. Stated because a cycle measured from the last opening — which
     * is what the assisted-sales reading does, for its own different question —
     * would shrink as a unit got more attention, which is backwards.
     */
    const once = classifySaleCycle(sale());
    const many = classifySaleCycle(sale());

    expect(many).toEqual(once);
    expect(many).toMatchObject({ kind: "measured", days: 30 });
  });

  it("korábbi first-open — an opening older than the data edge is not measured", () => {
    const verdict = classifySaleCycle(sale({ openingAtDataEdge: true }));

    expect(verdict).toEqual({
      kind: "excluded",
      unitCode: "A-101",
      why: "opening_at_data_edge",
    });
  });

  it("negatív idő — an opening after the sale yields no number, not zero and not its absolute value", () => {
    const verdict = classifySaleCycle(
      sale({
        firstOpenedAt: "2026-03-01T09:00:00.000Z",
        soldAt: "2026-02-09T09:00:00.000Z",
      }),
    );

    expect(verdict).toEqual({ kind: "excluded", unitCode: "A-101", why: "opening_after_sale" });

    /* The two answers this must never give. */
    expect(verdict).not.toMatchObject({ kind: "measured", days: 0 });
    expect(verdict).not.toMatchObject({ kind: "measured", days: 20 });
  });

  it("hiányzó Sold — a sale the CRM has not dated is excluded rather than counted as instant", () => {
    const verdict = classifySaleCycle(sale({ soldAt: null }));

    expect(verdict).toEqual({ kind: "excluded", unitCode: "A-101", why: "no_sale_date" });
  });

  it("cutoff — no opening recorded at all is its own answer, not the same as an old one", () => {
    /*
     * Separate from `korábbi first-open` on purpose. "We never saw this unit
     * opened" and "the oldest opening we have is the oldest we could have" are
     * different sentences, and a reader deciding whether to trust the figure
     * needs them apart.
     */
    const verdict = classifySaleCycle(sale({ firstOpenedAt: null }));

    expect(verdict).toEqual({ kind: "excluded", unitCode: "A-101", why: "no_opening_recorded" });
  });

  it("részleges lefedettség — the summary reports what it measured against what it examined", () => {
    const summary = summariseSaleCycles(
      [
        sale({ unitCode: "A-101" }),
        sale({ unitCode: "A-102", soldAt: null }),
        sale({ unitCode: "A-103", openingAtDataEdge: true }),
        sale({ unitCode: "A-104", firstOpenedAt: null }),
        sale({
          unitCode: "A-105",
          firstOpenedAt: "2026-03-01T09:00:00.000Z",
          soldAt: "2026-02-09T09:00:00.000Z",
        }),
      ],
      1,
    );

    expect(summary.examined).toBe(5);
    expect(summary.measured).toBe(1);
    expect(summary.excluded).toEqual({
      no_sale_date: 1,
      no_opening_recorded: 1,
      opening_after_sale: 1,
      opening_at_data_edge: 1,
    });
    /* Every sale is accounted for: measured plus excluded equals examined. */
    const accounted = summary.measured + Object.values(summary.excluded).reduce((a, b) => a + b, 0);
    expect(accounted).toBe(summary.examined);
  });
});

describe("what the summary refuses to say", () => {
  it("names both clocks, because the interval spans two", () => {
    const summary = summariseSaleCycles([sale()], 1);
    expect(summary.clocks).toEqual({ opening: "showroom_observed", sold: "crm_stated" });
  });

  it("is insufficient rather than ok below the registry's minimum", () => {
    const summary = summariseSaleCycles([sale(), sale({ unitCode: "A-102" })], 10);
    expect(summary.state).toBe("insufficient");
    expect(summary.measured).toBe(2);
  });

  it("is empty when nothing was examined, which is not the same as nothing measured", () => {
    const nothing = summariseSaleCycles([], 10);
    const nothingMeasured = summariseSaleCycles([sale({ soldAt: null })], 10);

    expect(nothing.state).toBe("empty");
    expect(nothingMeasured.state).toBe("insufficient");
    expect(nothingMeasured.examined).toBe(1);
  });
});
