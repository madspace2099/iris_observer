import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NotFoundError, NotPermittedError, type Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";

import { maySeeSurface } from "../src/lib/routes";
import {
  decideAccess,
  deniesAnythingUnder,
  planForTenant,
  requiredPlan,
} from "../src/lib/entitlements";
import { entitled } from "../src/lib/entitled-repository";
import {
  ADDRESS_CELLS,
  FIXTURE_REGISTRY,
  MATRIX_PLANS,
  MATRIX_ROLES,
  NOT_PLANS,
  PLAN_CELLS,
  SURFACE_CELLS,
  MATRIX_VIEWER_KEYS,
  UNREACHABLE_STATES,
} from "../../../test-support/access-matrix";

/**
 * THE ACCESS MATRIX, DRIVEN THROUGH THE REAL FUNCTIONS.
 *
 * Three gates refuse in three vocabularies with two opposite defaults, and
 * until now no test in this repository had crossed them: the role gate is
 * exercised against real viewers with no plan in sight, the plan gate against
 * literal strings with no viewer at all. Every cell below names an input to a
 * function that ships and the answer it must give.
 *
 * The fixture is a table of expectations in `test-support/`. It generates no
 * data, and the last describe block proves it cannot be reached from the
 * application at all — which is what "never a production fallback" has to mean
 * if it is to mean anything.
 */

const repo = () => new SyntheticObserverRepository();

/**
 * A viewer holding nothing at all, derived HERE rather than declared in the
 * fixture or added to VIEWERS: the synthetic world has six committed capacities
 * and should not grow a seventh for a test.
 */
const viewerWithNoGrants = (): Viewer => ({
  ...(VIEWERS.salesAgentIster as Viewer),
  tenantIds: [],
  projectIds: [],
});

describe("the role gate", () => {
  it.each(SURFACE_CELLS.map((c) => [`${c.role} × ${c.key}`, c] as const))("%s", (_name, cell) => {
    expect(maySeeSurface(cell.role, cell.key), cell.note).toBe(cell.allowed);
  });

  it("names only viewer keys the synthetic world actually declares", () => {
    // The fixture names them as strings so it can import nothing. This is where
    // a key that stopped existing has to fail.
    for (const key of MATRIX_VIEWER_KEYS) expect(VIEWERS[key], key).toBeDefined();
    expect(Object.keys(VIEWERS).sort()).toEqual([...MATRIX_VIEWER_KEYS].sort());
  });

  it("covers every role at least once", () => {
    // A matrix that silently stopped exercising a role would still be green.
    const seen = new Set(SURFACE_CELLS.map((c) => c.role));
    expect([...seen].sort()).toEqual([...MATRIX_ROLES].sort());
  });
});

describe("the plan gate", () => {
  it.each(PLAN_CELLS.map((c) => [`${String(c.plan)} × ${c.key} → ${c.expect}`, c] as const))(
    "%s",
    (_name, cell) => {
      const decision = decideAccess(cell.plan, cell.key, FIXTURE_REGISTRY);
      if (cell.expect === "allowed") {
        expect(decision, cell.note).toEqual({ allowed: true, effectivePlan: cell.plan });
        return;
      }
      expect(decision, cell.note).toEqual({ allowed: false, reason: cell.expect });
    },
  );

  it.each(NOT_PLANS.map((p) => [JSON.stringify(p) ?? "undefined", p] as const))(
    "refuses everything to a plan it does not recognise: %s",
    (_name, plan) => {
      // Not upgrade_required. An unrecognised plan is not a weak plan.
      for (const key of ["metric.unit.active_dwell", "metric.exec.revenue", "surface.units"]) {
        expect(decideAccess(plan, key, FIXTURE_REGISTRY), key).toEqual({
          allowed: false,
          reason: "forbidden",
        });
      }
    },
  );

  it("refuses a prototype name, which it once allowed", () => {
    /*
     * The defect this matrix found. `registry["toString"]` is a function on
     * every plain object, so a bare index let five key names past a gate whose
     * whole purpose is to fail closed. Production never built such a key, which
     * is exactly the reasoning this repository refuses elsewhere.
     */
    for (const key of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(requiredPlan(key, FIXTURE_REGISTRY), key).toBeNull();
      expect(decideAccess("MAX", key, FIXTURE_REGISTRY), key).toEqual({
        allowed: false,
        reason: "forbidden",
      });
    }
    // And the same hole in the tenant table: a prototype name is not a plan.
    expect(planForTenant("constructor")).toBe("FREE");
    expect(planForTenant("__proto__")).toBe("FREE");
  });

  it("crosses every role with every plan, which nothing did before", () => {
    /*
     * The gates are independent by design: `planForTenant` takes a tenant id
     * and never a role. This asserts that independence rather than assuming it
     * — a plan must not change what a role may open, and a role must not
     * change what a plan has paid for.
     */
    let crossed = 0;
    for (const role of MATRIX_ROLES) {
      for (const plan of MATRIX_PLANS) {
        crossed += 1;
        expect(maySeeSurface(role, "units"), `${role} × ${plan}`).toBe(true);
        expect(
          decideAccess(plan, "metric.exec.revenue", FIXTURE_REGISTRY),
          `${role} × ${plan}`,
        ).toEqual(
          plan === "FREE"
            ? { allowed: false, reason: "upgrade_required" }
            : { allowed: true, effectivePlan: plan },
        );
      }
    }
    expect(crossed).toBe(MATRIX_ROLES.length * MATRIX_PLANS.length);
  });
});

describe("the address gate", () => {
  it.each(
    ADDRESS_CELLS.map(
      (c) => [`${c.viewerKey} → ${c.tenantSlug}/${c.projectSlug} → ${c.error}`, c] as const,
    ),
  )("%s", async (_name, cell) => {
    const viewer = VIEWERS[cell.viewerKey] as Viewer;
    const call = repo().getHome({
      viewer,
      tenantSlug: cell.tenantSlug,
      projectSlug: cell.projectSlug,
      period: "quarter_to_date",
    });
    if (cell.error === "none") {
      await expect(call, cell.note).resolves.toBeDefined();
      return;
    }
    const expected = cell.error === "NotPermittedError" ? NotPermittedError : NotFoundError;
    await expect(call, cell.note).rejects.toBeInstanceOf(expected);
  });

  it("refuses a viewer holding nothing, whichever address they type", async () => {
    // Derived rather than declared: the synthetic world has no zero-grant
    // viewer and should not grow one for a test.
    const nobody = viewerWithNoGrants();
    for (const [tenantSlug, projectSlug] of [
      ["alpha", "northgate"],
      ["beta", "kingsford"],
    ] as const) {
      await expect(
        repo().getHome({ viewer: nobody, tenantSlug, projectSlug, period: "quarter_to_date" }),
        `${tenantSlug}/${projectSlug}`,
      ).rejects.toBeInstanceOf(NotPermittedError);
    }
  });
});

describe("the gates compose, and the middle one actually removes data", () => {
  it("redacts a priced figure for a granted reader on a granted project", async () => {
    /*
     * The crossing that matters: the address gate ALLOWS, the role gate
     * ALLOWS, and the plan gate still takes the figure out. Driven through the
     * real wrapper with the fixture registry, because the shipped registry
     * prices everything at FREE and an existing test asserts it stays that way.
     */
    const query = {
      viewer: VIEWERS.developer as Viewer,
      tenantSlug: "alpha",
      projectSlug: "northgate",
      period: "quarter_to_date",
    } as const;

    expect(maySeeSurface("developer", "project")).toBe(true);
    const open = await repo().getExecutiveOverview(query);
    const gated = await entitled(repo(), FIXTURE_REGISTRY).getExecutiveOverview(query);

    const exec = (v: unknown): { metricId: string; display: unknown }[] => {
      const out: { metricId: string; display: unknown }[] = [];
      const walk = (x: unknown, seen = new Set<unknown>()) => {
        if (typeof x !== "object" || x === null || seen.has(x)) return;
        seen.add(x);
        const r = x as Record<string, unknown>;
        if (typeof r["metricId"] === "string" && r["metricId"].startsWith("exec.")) {
          out.push({ metricId: r["metricId"], display: r["display"] });
        }
        for (const child of Object.values(r)) walk(child, seen);
      };
      walk(v);
      return out;
    };

    const before = exec(open);
    expect(before.length, "the fixture must carry executive figures to refuse").toBeGreaterThan(0);
    for (const m of exec(gated)) {
      expect(m.display, m.metricId).not.toBe(
        before.find((b) => b.metricId === m.metricId)?.display,
      );
    }
  });

  it("leaves the response alone when the plan reaches everything", async () => {
    // The shipped configuration. `deniesAnythingUnder` answers false, so the
    // walk never runs and nothing is rebuilt.
    expect(deniesAnythingUnder("FREE", "metric")).toBe(false);
    for (const plan of MATRIX_PLANS) {
      expect(deniesAnythingUnder(plan, "metric"), plan).toBe(false);
    }
  });
});

describe("the fixture is not a data layer and cannot be reached from the application", () => {
  const APP_SRC = resolve(import.meta.dirname, "../src");

  function sourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  it("is imported by no application file", () => {
    /*
     * The whole of "never a production fallback" in one assertion. There is no
     * path from the application to this table, so there is no condition — a
     * missing source, a failed fetch, a thrown adapter — under which the
     * product could fall back to it.
     */
    const offenders = sourceFiles(APP_SRC).filter((path) =>
      /test-support|access-matrix/.test(readFileSync(path, "utf8")),
    );
    expect(offenders.map((f) => relative(APP_SRC, f))).toEqual([]);
  });

  it("lives outside every tsconfig that builds the application", () => {
    const appConfig = readFileSync(resolve(import.meta.dirname, "../tsconfig.json"), "utf8");
    // `apps/web/tsconfig.json` compiles `src/**` and nothing else, so a file in
    // `test-support/` is not part of the application's compilation at all.
    expect(appConfig).toContain('"src/**/*.ts"');
    expect(appConfig).not.toContain("test-support");
  });

  it("generates no data: it names inputs and expected answers, nothing else", () => {
    const fixture = readFileSync(
      resolve(import.meta.dirname, "../../../test-support/access-matrix.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    // ADR-0007 and CLAUDE.md non-negotiable 2. No generator, no session, no
    // unit, no figure — and no second viewer factory beside VIEWERS.
    for (const forbidden of ["Math.random", "new Date(", "sessionId", "unitCode", "display:"]) {
      expect(fixture, forbidden).not.toContain(forbidden);
    }
  });
});

describe("what this matrix cannot cover, said out loud", () => {
  it("records each unreachable state as a missing feature rather than a missing test", () => {
    /*
     * The P1-03 distinction, applied here. A state that EXISTS and is untested
     * is a gap in this matrix. A state that does not exist is a gap in the
     * product, and writing a test for it would mean inventing the feature
     * first. Silence would report the second as if it were the first.
     */
    expect(UNREACHABLE_STATES.length).toBeGreaterThan(0);
    for (const state of UNREACHABLE_STATES) {
      expect(state.why.length, state.state).toBeGreaterThan(80);
      expect(state.evidence.length, state.state).toBeGreaterThan(20);
    }
    // The one the v3 plan asks for by name.
    expect(UNREACHABLE_STATES.map((s) => s.state)).toContain("trial expiry");
  });

  it("still finds no trial anywhere in the product", () => {
    // The evidence behind that entry, re-run rather than quoted.
    const hits = [
      resolve(import.meta.dirname, "../src"),
      resolve(import.meta.dirname, "../../../packages"),
    ]
      .flatMap((root) => {
        const walk = (d: string): string[] =>
          readdirSync(d).flatMap((n) => {
            const p = join(d, n);
            if (n === "node_modules" || n === "design-lab") return [];
            return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
          });
        return walk(root);
      })
      .filter((p) => /\btrial\b/i.test(readFileSync(p, "utf8")));
    expect(hits.map((h) => h.split(/[\\/]/).slice(-2).join("/"))).toEqual([]);
  });
});
