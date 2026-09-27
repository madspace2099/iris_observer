import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS, catalogueFor } from "../src/index";

/**
 * A UNIT'S SHORTLIST FINDING OPENS THE MEETINGS IT RESTS ON.
 *
 * "A-101 was shortlisted twice with nothing recorded after it" offered "See
 * those meetings" and opened the whole meeting register, which has no filter
 * by unit. The unit's own page lists the meetings that opened it, with the
 * Shortlisted and Follow-up columns the finding is read from; the step now
 * opens that table.
 */
const repo = new SyntheticObserverRepository();
const query = {
  viewer: VIEWERS.agencyManager,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  period: "year_to_date",
  language: DEFAULT_LANGUAGE,
} as const;

describe("a unit's shortlist finding", () => {
  it("opens the unit's own table of the meetings that opened it", async () => {
    let raised = 0;
    for (const unit of catalogueFor("prj_northgate01")) {
      const detail = await repo.getUnitDetail(query, unit.code);
      const finding = detail.findings.find((f) => f.id.endsWith("-shortlist-no-follow-up"));
      if (finding === undefined) continue;
      raised += 1;
      expect(finding.nextStep?.href, unit.code).toBe(
        `/alpha/northgate/units/${encodeURIComponent(unit.code)}#meetings-that-opened-it`,
      );
    }
    expect(raised, "never raised, so nothing was measured").toBeGreaterThan(0);
  });
});
