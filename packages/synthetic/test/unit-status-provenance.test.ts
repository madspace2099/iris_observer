import { describe, expect, it } from "vitest";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";
import type { OverviewQuery, Viewer } from "@observer/readmodels";

import { DEFAULT_LANGUAGE } from "@observer/readmodels";
/**
 * A catalogue status claims what it is: a stated fact, from the catalogue.
 *
 * The unit funnel's reserved and sold stages are the one place a system of
 * record speaks about the unit itself, and the stage said so — `verified`, "the
 * unit catalogue is a system of record about this unit", "stated by the unit
 * catalogue". The tier word beside it was `attributed_conversion`, a conversion
 * assigned under a rule, which no rule had done; and the chips were the
 * showroom's and the CRM's, neither of which is the catalogue. Right
 * provenance, wrong label: a different class from a source labelled as
 * another, so a guard of its own.
 *
 * Read through the port on Northgate's A-402, which meetings opened in the
 * period. The labels are the STAGE's — verification, tier, sources — and stand
 * whatever the status metric says, so an available unit answers as well as a
 * sold one; a sold unit (A-505) is opened in no meeting and has no page here,
 * which is how this guard first went red. One measured assertion per test, so
 * a mutation is read by which one fails.
 */

const UNIT = "A-402";

const NORTHGATE: OverviewQuery = {
  viewer: VIEWERS.developer as Viewer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  period: "year_to_date",
  language: DEFAULT_LANGUAGE,
};

const repo = new SyntheticObserverRepository();

describe("the catalogue's status stages", () => {
  it("still say the catalogue stands behind them", async () => {
    const view = await repo.getUnitDetail(NORTHGATE, UNIT);
    expect(view.funnel.find((s) => s.id === "purchase")?.verification).toBe("verified");
  });

  it("claim only the record", async () => {
    const view = await repo.getUnitDetail(NORTHGATE, UNIT);
    expect(
      view.funnel.find((s) => s.id === "purchase")?.tier,
      "a stated status was presented as a conversion attributed under a rule",
    ).toBe("observed_sequence");
  });

  it("wear no source chip the vocabulary cannot make true", async () => {
    const view = await repo.getUnitDetail(NORTHGATE, UNIT);
    expect(
      view.funnel.find((s) => s.id === "reservation")?.sources,
      "a catalogue status was credited to the showroom and the CRM",
    ).toEqual([]);
  });
});
