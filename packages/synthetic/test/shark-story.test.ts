import { describe, expect, it } from "vitest";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import { DEFAULT_LANGUAGE, type OverviewQuery, type Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src";
import { syntheticDeals } from "../src/deals";
import { catalogueFor } from "../src/pulse";
import { sessionsForProject } from "../src/showroom/sessions";
import { TODAY } from "../src/world";

/**
 * SHARK RESIDENCE TELLS ITS STORY, AND KEEPS TELLING IT.
 *
 * The demonstration project exists to be recorded: five presenters whose habits
 * show up in what their meetings came to, and a CRM whose flats agree with the
 * catalogue. A change to a seed, a weight or a pin that quietly flattens the
 * spread, or sells a flat twice, fails here rather than on camera.
 */

const SHARK: OverviewQuery = {
  viewer: VIEWERS.developerShark as Viewer,
  tenantSlug: "shark",
  projectSlug: "shark-residence",
  period: "quarter_to_date",
  language: DEFAULT_LANGUAGE,
};
const PROGRESSED = new Set(["purchase", "reservation", "interested", "follow_up_needed"]);

const repo = new SyntheticObserverRepository();

async function shares(): Promise<Map<string, { meetings: number; share: number }>> {
  const flow = await repo.getSalesFlow(SHARK);
  return new Map(
    flow.rings.map((r) => {
      const progressed = r.slices
        .filter((s) => PROGRESSED.has(s.outcome))
        .reduce((n, s) => n + s.count, 0);
      return [r.name, { meetings: r.meetings, share: progressed / r.decidedMeetings }];
    }),
  );
}

describe("Shark Residence's presenters", () => {
  it("each clear the reporting minimum in the quarter", async () => {
    const byName = await shares();
    expect(byName.size).toBe(5);
    for (const [name, a] of byName)
      expect(a.meetings, name).toBeGreaterThanOrEqual(AGENT_MIN_SAMPLE);
  });

  it("spread from the storyteller and the closer down to the rusher", async () => {
    const byName = await shares();
    const at = (n: string) => byName.get(n)?.share ?? Number.NaN;
    expect(at("Lena Fischer")).toBeGreaterThan(0.7);
    expect(at("Marek Dvořák")).toBeGreaterThan(0.65);
    expect(at("Oliver Grant")).toBeLessThan(0.3);
    for (const middle of ["Zsófia Bárány", "Iva Horváth"]) {
      expect(at(middle)).toBeLessThan(at("Marek Dvořák"));
      expect(at(middle)).toBeGreaterThan(at("Oliver Grant"));
    }
  });

  it("put the rusher in Sales Flow's finding", async () => {
    const flow = await repo.getSalesFlow(SHARK);
    expect(JSON.stringify(flow.findings)).toContain("Oliver Grant:");
  });
});

describe("Shark Residence's agent colours", () => {
  it("give each of the five presenters their own seat colour, in seat order", async () => {
    /*
     * The old four-step ramp gave Iva, fifth, Lena's colour; the kit's own order
     * gave Oliver and Iva its two near-identical cyans, 3 and 5. Either fails here.
     */
    const charts = await repo.getAgentCharts(SHARK);
    expect(charts.radar.profiles.map((p) => p.tone)).toEqual([
      "var(--d-series-1)",
      "var(--d-series-2)",
      "var(--d-series-4)",
      "var(--d-series-6)",
      "var(--d-series-5)",
    ]);
  });

  it("draw all five on the feature-use lines in the quarter, in the radar's colours", async () => {
    const charts = await repo.getAgentCharts(SHARK);
    const drawn = charts.featureUsage.profiles.filter((p) => !p.belowMinimum);
    expect(drawn.map((p) => p.tone)).toEqual(charts.radar.profiles.map((p) => p.tone));
  });

  it("name everyone not drawn in the last 28 days, where only Marek clears the floor", async () => {
    const charts = await repo.getAgentCharts({ ...SHARK, period: "last_28_days" });
    for (const name of ["Lena Fischer", "Oliver Grant", "Zsófia Bárány", "Iva Horváth"]) {
      expect(charts.radar.summary, name).toMatch(
        new RegExp(`Not drawn, under 20 meetings:.*${name}`),
      );
    }
  });
});

describe("Shark Residence's demonstration CRM", () => {
  const deals = syntheticDeals(sessionsForProject("prj_sharkres001"), TODAY).deals;
  const holds = deals.filter((d) => d.stage === "purchase" || d.stage === "reservation");

  it("holds no flat twice", () => {
    const codes = holds.map((d) => d.unitCode).filter((c) => c !== null);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("signs every reservation three weeks on, so none has stood longer", () => {
    const reservations = holds.filter((d) => d.stage === "reservation");
    expect(reservations.length).toBeGreaterThan(0);
    for (const d of reservations)
      expect(Date.parse(TODAY) - Date.parse(d.stageEnteredAt ?? ""), d.externalId).toBeLessThan(
        21 * 86_400_000,
      );
  });

  it("agrees with the catalogue about every flat it sold", () => {
    const status = new Map(catalogueFor("prj_sharkres001").map((u) => [u.code, u.status]));
    const purchased = holds.filter((d) => d.stage === "purchase" && d.unitCode !== null);
    expect(purchased.length).toBeGreaterThan(10);
    for (const d of purchased)
      expect(status.get(d.unitCode as string), d.unitCode ?? "").toBe("sold");
  });
});

describe("Shark Residence's stock", () => {
  it("places all four room segments on the attention × conversion frame", async () => {
    const view = await repo.getProjectView(SHARK, null);
    expect(view.scatter.points.map((p) => p.id).sort()).toEqual([
      "rooms-1",
      "rooms-2",
      "rooms-3",
      "rooms-4",
    ]);
  });
});
