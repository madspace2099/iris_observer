import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { VIEWERS, syntheticRepository } from "../src";

/**
 * A SOURCE LINE NAMES THE CRM ONLY WHERE A FIGURE READS ONE (ADR-0052).
 *
 * The line is words now — "deal stages from your CRM" — so a CRM named where
 * none is connected, or where nothing is read, is a false sentence. Riverside
 * has no CRM; Northgate has one.
 */
const query = (projectSlug: string) =>
  ({
    viewer: VIEWERS.developer,
    tenantSlug: "alpha",
    projectSlug,
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  }) as const;

const CRM = "CRM_OUTCOME_CONTEXT";

describe("the CRM in a source line", () => {
  it("is not named on the Briefing of a project with no CRM, and is where one is connected", async () => {
    expect((await syntheticRepository.getHome(query("riverside"))).sources).not.toContain(CRM);
    expect((await syntheticRepository.getHome(query("northgate"))).sources).toContain(CRM);
  });

  it("is not named beside the report's 'No CRM is connected'", async () => {
    const outcomes = (await syntheticRepository.getReportScope(query("riverside"))).sections.find(
      (s) => s.id === "outcomes",
    );
    expect(outcomes?.availability).toBe("unavailable");
    expect(outcomes?.sources).not.toContain(CRM);
  });

  it("is not named, nor anything else, on a unit's offer stage, which no source records", async () => {
    const units = await syntheticRepository.getUnitAttention(query("northgate"), null);
    const unit = await syntheticRepository.getUnitDetail(
      query("northgate"),
      units.rows[0]?.unitCode ?? "",
    );
    expect(unit.funnel.find((s) => s.id === "offer")?.sources).toEqual([]);
  });
});
