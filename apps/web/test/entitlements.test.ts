import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_METRICS } from "@observer/metrics";
import { SURFACES } from "../src/lib/routes";
import {
  ACCESS_REGISTRY,
  DEFAULT_PLAN,
  PLANS,
  TENANT_PLANS,
  asPlan,
  decideAccess,
  decideAll,
  planForTenant,
  requiredPlan,
  type Plan,
} from "../src/lib/entitlements";

/**
 * THE COMMERCIAL GATE, AND THE THREE WAYS IT COULD GIVE SOMETHING AWAY.
 *
 * A plan nobody recognises. A capability nobody priced. A child view that
 * quietly undoes what its parent refused. Each one hands a paying customer's
 * feature to somebody who did not pay for it, and each one is silent — there is
 * no error, no log, no failing build, just a screen that renders.
 *
 * So these do not test that today's registry allows today's screens. They test
 * that the refusals cannot be talked out of, which is the only property that
 * stays true after the registry is filled in.
 */

const SRC = resolve(import.meta.dirname, "../src");

/** Source with its comments removed, so a docblock cannot satisfy a guard. */
function executable(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Every key a real screen or a real metric will ask about. */
const REAL_KEYS = [
  ...SURFACES.map((s) => `surface.${s.route.split("/").pop() ?? ""}`),
  ...ALL_METRICS.map((m) => `metric.${m.id}`),
];

describe("deny by default", () => {
  it("refuses everything to a plan it does not recognise", () => {
    const notPlans: unknown[] = [
      undefined,
      null,
      "",
      "max",
      "Max",
      "MAX ",
      "PREMIUM",
      "ENTERPRISE",
      0,
      3,
      true,
      ["MAX"],
      { plan: "MAX" },
    ];
    for (const value of notPlans) {
      for (const key of ["surface.units", "metric.exec.revenue", "surface", "metric"]) {
        const decision = decideAccess(value, key);
        expect(decision.allowed, `${JSON.stringify(value)} on ${key}`).toBe(false);
        /*
         * `forbidden`, never `upgrade_required`. An unrecognised plan is not a
         * weak plan, and a surface that offered an upgrade here would be
         * inviting somebody to pay their way out of a bug.
         */
        expect(decision.allowed === false && decision.reason).toBe("forbidden");
      }
    }
  });

  it("refuses a capability nobody priced, even on the strongest plan", () => {
    for (const key of ["billing", "billing.invoice", "claude", "surfaces.units", "", "."]) {
      const decision = decideAccess("MAX", key);
      expect(decision.allowed, key).toBe(false);
      expect(decision.allowed === false && decision.reason, key).toBe("forbidden");
    }
  });

  it("grants nothing for an empty list of keys", () => {
    // The most expensive kind of typo: a caller whose keys came out empty.
    expect(decideAll("MAX", [])).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("recognises exactly three plans and nothing that merely looks like one", () => {
    expect([...PLANS]).toEqual(["FREE", "PRO", "MAX"]);
    for (const plan of PLANS) expect(asPlan(plan)).toBe(plan);
    for (const near of ["free", "Pro", " MAX", "MAXX", "FREE\n"]) expect(asPlan(near)).toBeNull();
  });

  it("defaults a tenant to the base plan rather than to everything", () => {
    /*
     * FREE and not MAX. A default that admits everything means the day a
     * capability is priced, every tenant keeps it and nobody notices the gate
     * does not work.
     */
    expect(DEFAULT_PLAN).toBe("FREE");
    expect(planForTenant("tnt_nobody_configured")).toBe("FREE");
    // And the override map is a shape, not a place for a customer's name.
    expect(Object.keys(TENANT_PLANS)).toEqual([]);
  });
});

describe("a restriction adds up and never subtracts", () => {
  /*
   * The registry is small on purpose, so these hand `requiredPlan` the
   * hierarchy they need rather than depending on what happens to be priced
   * this week — and they hand it to the REAL function. A guard that
   * re-implements the rule it is guarding proves only that somebody can write
   * the rule twice.
   */
  const requiredWith = (registry: Record<string, Plan>, key: string): Plan | null =>
    requiredPlan(key, registry);

  it("takes the strongest ancestor, so a child cannot be cheaper than its parent", () => {
    // The leak this exists to prevent: a parent priced at PRO and a nested
    // view that declares FREE for one figure inside it.
    const registry: Record<string, Plan> = {
      metric: "FREE",
      "metric.exec": "PRO",
      "metric.exec.revenue": "FREE",
    };
    expect(requiredWith(registry, "metric.exec.revenue")).toBe("PRO");
    expect(requiredWith(registry, "metric.exec")).toBe("PRO");
    // A sibling family under the same root is untouched by it.
    expect(requiredWith(registry, "metric.unit.active_dwell")).toBe("FREE");
  });

  it("lets a child be dearer than its parent", () => {
    const registry: Record<string, Plan> = { metric: "FREE", "metric.exec.revenue": "MAX" };
    expect(requiredWith(registry, "metric.exec.revenue")).toBe("MAX");
    expect(requiredWith(registry, "metric.exec")).toBe("FREE");
  });

  it("inherits down to a key nobody declared, as long as an ancestor did", () => {
    // This is what stops the registry from having to list 61 metrics.
    expect(requiredPlan("metric.exec.units_sold")).toBe(DEFAULT_PLAN);
    expect(requiredPlan("surface.units")).toBe(DEFAULT_PLAN);
    // And what stops an unrelated root from inheriting anything at all.
    expect(requiredPlan("reports.scheduled")).toBeNull();
  });

  it("refuses the whole chain when any link in it refuses", () => {
    // `decideAll` reports the FIRST refusal, so a reader is told they may not
    // open the screen rather than that one figure on it needs an upgrade.
    const chain = ["surface.units", "metric.unit.active_dwell", "reports.scheduled"];
    expect(decideAll("MAX", chain)).toEqual({ allowed: false, reason: "forbidden" });
    expect(decideAll("FREE", ["surface.units", "metric.unit.active_dwell"])).toEqual({
      allowed: true,
      effectivePlan: "FREE",
    });
  });
});

describe("the registry keeps up with the product it prices", () => {
  it("resolves every declared surface and every declared metric", () => {
    /*
     * The other half of failing closed. Deny-by-default is only safe while the
     * things that really exist are reachable, so this fails the day a new
     * surface or metric lands under a root nobody declared — rather than the
     * day a customer opens it and is refused.
     */
    const unpriced = REAL_KEYS.filter((key) => requiredPlan(key) === null);
    expect(unpriced).toEqual([]);
    expect(REAL_KEYS.length).toBeGreaterThan(SURFACES.length);
  });

  it("prices nothing above the base plan yet, and says so", () => {
    // Today every root is FREE, which is why wiring this in changes no screen.
    // When that stops being true this line is the one to update deliberately.
    expect(Object.values(ACCESS_REGISTRY)).toEqual(["FREE", "FREE"]);
  });
});

describe("a plan is never something the client said", () => {
  it("reads no plan from a query string, a header, a cookie or a body", () => {
    /*
     * `plan=MAX` and `preview=MAX` are strings a reader can type, and an
     * "admin" header is a string anybody can send. The plan is resolved on the
     * server from the tenant the repository already authorised, and this is the
     * tripwire for the day somebody reaches for the quick version.
     */
    const forbidden =
      /(searchParams|headers\(\)|cookies\(\)|req(uest)?\.(headers|body)|\.get\()[^\n;]{0,80}["'`](plan|preview|tier|x-observer-plan|effectivePlan)["'`]/i;
    const offenders: string[] = [];
    for (const path of sourceFiles(SRC)) {
      const source = executable(readFileSync(path, "utf8"));
      if (forbidden.test(source)) offenders.push(relative(SRC, path));
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the resolver server-only, so no component can import it", () => {
    const source = readFileSync(join(SRC, "lib", "entitlements.ts"), "utf8");
    expect(source.startsWith('import "server-only";')).toBe(true);
  });
});
