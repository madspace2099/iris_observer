import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";

/**
 * THE PRESENTATION COMPARISON NAMES ONLY THIS PROJECT'S PEOPLE.
 *
 * Kingsford Yard belongs to Beta Development. Its Presentation DNA said
 * "Monika Kováčová and Akhilesh Undev presented no meeting in this period":
 * the default pair was looked up in the whole synthetic roster, so two of
 * Alpha Estates' agents were named on Beta's screen. The names below are
 * Alpha's agents, written out by hand.
 */
const repo = new SyntheticObserverRepository();
const ALPHA_ONLY = ["Monika Kováčová", "Akhilesh Undev", "Ján Hruška", "Lucia Bartošová"];

const dna = (
  projectSlug: string,
  tenantSlug: string,
  left: string | null = null,
  right: string | null = null,
) =>
  repo.getPresentationIntelligence(
    {
      viewer: VIEWERS.agencyManager,
      tenantSlug,
      projectSlug,
      period: "quarter_to_date",
      language: DEFAULT_LANGUAGE,
    },
    { mode: "agents", left, right },
  );

describe("a presentation comparison on one developer's project", () => {
  it("names none of another developer's agents by default", async () => {
    const view = JSON.stringify(await dna("kingsford", "beta"));
    for (const name of ALPHA_ONLY) expect(view, name).not.toContain(name);
  });

  it("names none of them when the address asks for one by id", async () => {
    const view = JSON.stringify(await dna("kingsford", "beta", "agt_monika", "agt_akhilesh"));
    for (const name of ALPHA_ONLY) expect(view, name).not.toContain(name);
  });

  it("compares two people who present on it, and never one person with themselves", async () => {
    const view = await dna("kingsford", "beta");
    const pair = [view.comparison?.left.label, view.comparison?.right.label];
    expect(view.comparison, view.noComparison ?? "no comparison").not.toBeNull();
    expect(new Set(pair).size).toBe(2);
  });

  it("keeps the scenario's pair where it works, as on Northgate", async () => {
    const view = await dna("northgate", "alpha");
    expect([view.comparison?.left.label, view.comparison?.right.label]).toEqual([
      "Monika Kováčová",
      "Akhilesh Undev",
    ]);
  });
});
