import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";
import type { MetricValue, Viewer } from "@observer/readmodels";

import { entitled, NOT_IN_PLAN } from "../src/lib/entitled-repository";
import type { Plan } from "../src/lib/entitlements";

/**
 * A FIGURE A PLAN DOES NOT REACH NEVER LEAVES THE SERVER.
 *
 * Not "is not rendered", not "is hidden", not "is greyed out" — never leaves.
 * A component cannot leak what it was never given, and that is the only version
 * of this claim that survives the next component somebody adds.
 *
 * The registry prices nothing above FREE today, so these hand `entitled` a
 * registry that prices something and drive the REAL wrapper with it. A guard
 * that waits for the product to grow a premium feature before it can run is a
 * guard nobody finds out is broken.
 *
 * Two properties, and the second is the subtle one.
 *
 * **Nothing forbidden comes out.** The whole response is searched — not the
 * fields a test remembered — for the figure, its raw number, its sample size
 * and its evidence.
 *
 * **The refusal does not describe what it refused.** A redaction that read
 * differently when there was data from when there was none would answer the
 * question it exists to refuse. So the refused object is compared, field for
 * field, against the refusal of a metric with entirely different numbers
 * behind it: the two must be identical.
 */

const NORTHGATE = {
  viewer: VIEWERS.developer as Viewer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  period: "quarter_to_date",
} as const;

/** Prices the executive family above the base plan; everything else stays FREE. */
const PRICED: Readonly<Record<string, Plan>> = {
  surface: "FREE",
  metric: "FREE",
  "metric.exec": "PRO",
};

/** Every `MetricValue` anywhere in a response, however deeply it is nested. */
function metricsIn(value: unknown, found: MetricValue[] = [], seen = new Set<unknown>()) {
  if (typeof value !== "object" || value === null || seen.has(value)) return found;
  seen.add(value);
  const record = value as Record<string, unknown>;
  if (typeof record["metricId"] === "string" && typeof record["state"] === "string") {
    found.push(record as unknown as MetricValue);
  }
  for (const child of Object.values(record)) metricsIn(child, found, seen);
  return found;
}

function plain(inner = new SyntheticObserverRepository()) {
  return inner;
}

describe("a figure the plan does not reach never leaves the server", () => {
  it("takes the number, the sample and the evidence out of the response entirely", async () => {
    const open = await plain().getExecutiveOverview(NORTHGATE);
    const gated = await entitled(plain(), PRICED).getExecutiveOverview(NORTHGATE);

    const before = metricsIn(open).filter((m) => m.metricId.startsWith("exec."));
    expect(before.length, "the fixture has to have executive metrics to refuse").toBeGreaterThan(0);

    const after = metricsIn(gated).filter((m) => m.metricId.startsWith("exec."));
    expect(after).toHaveLength(before.length);
    for (const metric of after) {
      expect(metric.display, metric.metricId).toBeNull();
      expect(metric.raw, metric.metricId).toBeNull();
      expect(metric.sampleSize, metric.metricId).toBeNull();
      expect(metric.comparison, metric.metricId).toBeNull();
      expect(metric.evidence, metric.metricId).toBeNull();
      expect(metric.drillHref, metric.metricId).toBeNull();
      expect(metric.message, metric.metricId).toBe(NOT_IN_PLAN);
    }

    /*
     * And nowhere else either. The refused figures are searched for across the
     * WHOLE serialised response — a chart's data, a tooltip, a summary
     * sentence, a hidden field nobody remembered — because "we removed it from
     * the place we render it" is not the same claim.
     */
    const serialised = JSON.stringify(gated);
    for (const metric of before) {
      if (metric.display !== null && metric.display.length > 2) {
        expect(serialised, `${metric.metricId} display leaked`).not.toContain(metric.display);
      }
      if (metric.evidence !== null) {
        /*
         * The evidence ID, not its href. The href is a ROUTE — every figure on
         * this screen links to `/alpha/northgate/flow` — so asserting the
         * response does not contain it asserts something about navigation
         * rather than about this figure, and it fails for a reason that has
         * nothing to do with the gate. The id is what identifies the record.
         */
        expect(serialised, `${metric.metricId} evidence leaked`).not.toContain(
          metric.evidence.evidenceId,
        );
      }
    }
  });

  it("leaves every figure the plan does reach exactly as it was", async () => {
    // A gate that refuses more than it was asked to is a broken product, and a
    // test that only checks refusals never notices.
    const open = await plain().getExecutiveOverview(NORTHGATE);
    const gated = await entitled(plain(), PRICED).getExecutiveOverview(NORTHGATE);

    const keep = (view: unknown) => metricsIn(view).filter((m) => !m.metricId.startsWith("exec."));
    expect(keep(gated)).toEqual(keep(open));
  });

  it("takes the figure out of a verdict component quoting the same metric", async () => {
    /*
     * The second door, and the easier one to miss: a verdict component is not
     * a `MetricValue` and carries its own already-formatted `display`.
     */
    const gated = await entitled(plain(), PRICED).getExecutiveOverview(NORTHGATE);
    const priced = gated.verdict.components.filter((c) => c.metricId.startsWith("exec."));
    for (const component of priced) {
      expect(component.display, component.metricId).toBe(NOT_IN_PLAN);
      // The reasoning stays: it is the verdict's, and it names no figure.
      expect(component.rule.length, component.metricId).toBeGreaterThan(0);
    }
  });

  it("changes nothing at all when the plan reaches everything", async () => {
    // The production path today. The wrapper must be transparent, or every
    // screen in the product is now paying for a walk that removes nothing.
    const open = await plain().getExecutiveOverview(NORTHGATE);
    const gated = await entitled(plain()).getExecutiveOverview(NORTHGATE);
    expect(JSON.stringify(gated)).toBe(JSON.stringify(open));
  });
});

describe("the refusal says nothing about what it refused", () => {
  it("answers identically for two metrics with entirely different values behind them", async () => {
    const gated = await entitled(plain(), PRICED).getExecutiveOverview(NORTHGATE);
    const refused = metricsIn(gated).filter((m) => m.metricId.startsWith("exec."));
    expect(refused.length).toBeGreaterThan(1);

    /*
     * Everything except which metric was asked for must match, field for
     * field. Two metrics whose real values differ — one a currency, one a
     * count, one of them possibly empty — must produce the same refusal, or
     * the refusal is a readout of the record it is refusing.
     */
    const shape = (m: MetricValue) => ({ ...m, metricId: "", label: "" });
    const first = shape(refused[0] as MetricValue);
    for (const metric of refused.slice(1)) {
      expect(shape(metric), metric.metricId).toEqual(first);
    }
  });

  it("refuses a metric with no value behind it the same way as one with a value", async () => {
    /*
     * The disclosure this prevents, stated as a test: on a project with no CRM
     * the executive figures are `unavailable` with a reason, and on one with a
     * CRM they are real numbers. If the plan refusal passed either of those
     * through, a reader could tell whether the record exists by reading the
     * refusal. Kingsford has a thin dataset and Northgate a full one.
     */
    const thin = {
      viewer: VIEWERS.agencyManager as Viewer,
      tenantSlug: "beta",
      projectSlug: "kingsford",
      period: "quarter_to_date",
    } as const;

    const gate = entitled(plain(), PRICED);
    const full = metricsIn(await gate.getExecutiveOverview(NORTHGATE)).filter((m) =>
      m.metricId.startsWith("exec."),
    );
    const sparse = metricsIn(await gate.getExecutiveOverview(thin)).filter((m) =>
      m.metricId.startsWith("exec."),
    );

    const byId = new Map(sparse.map((m) => [m.metricId, m]));
    let compared = 0;
    for (const metric of full) {
      const other = byId.get(metric.metricId);
      if (other === undefined) continue;
      compared += 1;
      // Same metric, two projects, two different underlying realities, one
      // refusal. The state, the message and every figure field must match.
      expect({ ...other, label: "" }, metric.metricId).toEqual({ ...metric, label: "" });
    }
    expect(
      compared,
      "the two projects have to share a metric for this to mean anything",
    ).toBeGreaterThan(0);
  });
});

describe("a response whose plan it cannot work out is refused entirely", () => {
  it("redacts every figure when no resolved tenant travels with them", async () => {
    /*
     * FAIL CLOSED, and this is the case that decides whether that phrase is
     * true or just written down. A read model that carries figures but no
     * tenant is one whose plan is unknowable here, and an unknown plan reaches
     * nothing — including what FREE reaches. Guessing would make the gate
     * depend on the shape of a read model, which is the one input it must not
     * take.
     */
    const withoutTenant = {
      async getExecutiveOverview() {
        return {
          headline: [
            {
              metricId: "exec.revenue",
              label: "Revenue",
              state: "ok",
              display: "€4.2m",
              raw: 4200000,
              qualifier: null,
              sampleSize: 7,
              minimumSampleSize: 5,
              comparison: null,
              message: null,
              evidence: null,
              drillHref: "/somewhere",
              policyVersion: null,
            },
          ],
        };
      },
    } as unknown as SyntheticObserverRepository;

    const gated = (await entitled(withoutTenant).getExecutiveOverview(NORTHGATE)) as unknown;
    const serialised = JSON.stringify(gated);
    expect(serialised).not.toContain("4.2m");
    expect(serialised).not.toContain("4200000");
    expect(metricsIn(gated)[0]?.message).toBe(NOT_IN_PLAN);
    // And note the registry here is the REAL one, which prices everything at
    // FREE. Even so nothing comes out, because the refusal is about the plan
    // being unknown rather than about the price.
  });
});

describe("the gate is installed where it cannot be walked round", () => {
  it("wraps the repository in the composition root, not in a page", () => {
    /*
     * `ADR-0007` makes this file the only one that knows which repository is in
     * use, and `surfaces.test.ts` already forbids a component importing the
     * synthetic package. Together with this line, there is no path to an
     * unfiltered read model that is not a change to the composition root.
     */
    const root = readFileSync(
      resolve(import.meta.dirname, "../src/lib/repository.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(root).toMatch(/export const repository[^=]*=\s*entitled\(/);
  });

  it("keeps the wrapper server-only, so no component can import it", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/lib/entitled-repository.ts"),
      "utf8",
    );
    expect(source.startsWith('import "server-only";')).toBe(true);
  });
});
