import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { NotPermittedError, type Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";
import { ROLES } from "@observer/metrics";
import { SURFACES, maySeeSurface } from "../src/lib/routes";

/**
 * WHO MAY OPEN A SCREEN, AND WHOSE PROJECT IT IS. TWO QUESTIONS, TWO ANSWERS.
 *
 * `SURFACES` declares a role list per route and `requireSurface` enforces it
 * inside the page — "a hidden link is not access control", as every call site
 * says. The project and tenant in the URL are a different question with a
 * different enforcement point: the repository resolves them against the
 * viewer's own grants and refuses, and the project layout renders forbidden
 * and missing identically so that refusing does not itself disclose.
 *
 * Both were already true almost everywhere. `/meetings/[meetingId]` is the
 * route where the first one was not: the page quoted its own three-role list
 * in a docblock and never checked it, so a developer who typed the address got
 * the replay — while the *report* of the same meeting refused them through the
 * identical call one file away, and the *brief* half refused them in the
 * repository under ADR-0018. One route, three surfaces, two of them guarded.
 *
 * So the first guard below is structural rather than anecdotal. It does not
 * pin the routes that exist today; it states the rule a new restricted route
 * has to satisfy, and the second one states the rule a wrongly-keyed call
 * breaks. `requireSurface` matches by LAST PATH SEGMENT and **fails open** on
 * a key it does not find — `requireSurface(viewer, "meetings", …)` on the
 * detail route would match the register one level up, whose list is all four
 * roles, and quietly permit everybody.
 */

const APP = resolve(import.meta.dirname, "../src/app");
const PROJECT_PREFIX = "/[tenantSlug]/[projectSlug]/";

/** Source with its comments removed, so a docblock cannot satisfy a guard. */
function executable(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The page file a project route is served from.
 *
 * Project routes live under the `(app)` route group, which is a directory on
 * disk and not a path segment — the one mapping detail this has to know.
 */
function pageFileFor(route: string): string {
  return join(APP, "(app)", ...route.split("/").filter(Boolean), "page.tsx");
}

/** The key `requireSurface` matches on: the route's own last segment. */
function surfaceKey(route: string): string {
  return route.split("/").pop() ?? "";
}

const projectSurfaces = SURFACES.filter((s) => s.route.startsWith(PROJECT_PREFIX));

describe("a restricted project surface checks the role it declares", () => {
  it("has a page for every project surface it will go on to inspect", () => {
    const missing = projectSurfaces.filter((s) => !existsSync(pageFileFor(s.route)));
    expect(missing.map((s) => s.route)).toEqual([]);
  });

  it("enforces the role list rather than only declaring it", () => {
    /*
     * Only the surfaces that actually restrict something. A route open to all
     * four roles has nothing for this check to be about, and demanding the
     * call there would be ceremony rather than a control.
     */
    const restricted = projectSurfaces.filter(
      (s) => s.requiresRole.length > 0 && s.requiresRole.length < ROLES.length,
    );
    expect(restricted.length).toBeGreaterThan(0);

    const unguarded: string[] = [];
    for (const surface of restricted) {
      const source = executable(readFileSync(pageFileFor(surface.route), "utf8"));
      /*
       * A page that only forwards is exempt, and only that. `/people` is a
       * permanent redirect kept for old bookmarks (ADR-0033); it reads
       * nothing, renders nothing, and its destination runs its own check.
       */
      if (source.includes("permanentRedirect(")) continue;
      if (!source.includes(`requireSurface(viewer, "${surfaceKey(surface.route)}"`)) {
        unguarded.push(surface.route);
      }
    }
    expect(unguarded).toEqual([]);
  });

  it("never lets a page guard a surface other than its own", () => {
    /*
     * The fail-open matcher, made impossible to trip by accident. A page that
     * passes a key belonging to a different route is worse than one that
     * passes none: it looks guarded in review and enforces somebody else's,
     * usually wider, role list.
     */
    const wrong: string[] = [];
    for (const surface of projectSurfaces) {
      const source = executable(readFileSync(pageFileFor(surface.route), "utf8"));
      for (const [, key] of source.matchAll(/requireSurface\(viewer,\s*"([^"]+)"/g)) {
        if (key !== surfaceKey(surface.route)) wrong.push(`${surface.route} guards "${key}"`);
      }
    }
    /*
     * `/report` carries the only legitimate foreign keys and they are not an
     * exception to the rule: with `?meeting=` that page RENDERS the meeting
     * surface, and with `?agent=` the agent's, so it asks each surface's own
     * question before it does. They are listed rather than filtered out, so
     * the day the page stops doing that — or starts guarding a third — this
     * line fails.
     */
    expect(wrong).toEqual([
      `${PROJECT_PREFIX}report guards "[meetingId]"`,
      `${PROJECT_PREFIX}report guards "[agentId]"`,
    ]);
  });
});

describe("the meeting replay answers to its own role list", () => {
  it("admits the three roles it names, and no others", () => {
    const declared = SURFACES.find((s) => s.route === `${PROJECT_PREFIX}meetings/[meetingId]`);
    expect(declared?.requiresRole).toEqual(["sales_agent", "agency_manager", "madspace_admin"]);

    for (const role of ROLES) {
      expect(maySeeSurface(role, "[meetingId]"), role).toBe(role !== "developer");
    }
    // And the register one level up is the wider list the wrong key would find.
    for (const role of ROLES) {
      expect(maySeeSurface(role, "meetings"), role).toBe(true);
    }
  });

  it("refuses the same role in prose that it refuses on the screen", async () => {
    /*
     * `explain_meeting_journey` reconstructs exactly what the replay renders.
     * A developer who cannot open the page could otherwise ask for it in
     * words, which is the inconsistency `tools.ts` warns about arriving from
     * the other direction.
     */
    const { TOOLS } = await import("../src/lib/ai/tools");
    const tool = TOOLS.find((t) => t.name === "explain_meeting_journey");
    expect(tool).toBeDefined();

    const context = {
      tenantSlug: "alpha",
      projectSlug: "northgate",
      period: "quarter_to_date",
    } as const;
    const agent = VIEWERS.salesAgent as Viewer;

    /*
     * A meeting that has actually run, taken from the register rather than
     * typed in: the replay exists only for those, and an id pinned by hand
     * would make this test fail the day the fixtures move for an unrelated
     * reason.
     */
    const register = await new SyntheticObserverRepository().listMeetings({
      viewer: agent,
      ...context,
    });
    const meetingId = register[0]?.meetingId;
    expect(meetingId).toBeDefined();
    const args = { meetingId: meetingId as string };

    await expect(
      tool?.run({ ...context, viewer: VIEWERS.developer as Viewer }, args as never),
    ).rejects.toBeInstanceOf(NotPermittedError);

    // The refusal is about the role, not about the tool being broken.
    await expect(tool?.run({ ...context, viewer: agent }, args as never)).resolves.toBeDefined();
  });
});

describe("the tenant and project in the URL are checked against the viewer's grants", () => {
  const repo = new SyntheticObserverRepository();
  const petra = VIEWERS.developer as Viewer; // alpha: northgate, riverside, ister-tower
  const tomas = VIEWERS.agencyManager as Viewer; // northgate, ister-tower, kingsford

  it("refuses a project the viewer does not hold, under a tenant they do", async () => {
    // Tomáš holds tenant `alpha` and several of its projects. Riverside is not
    // one of them, so holding the tenant must not carry the project with it.
    await expect(
      repo.getHome({ viewer: tomas, tenantSlug: "alpha", projectSlug: "riverside" }),
    ).rejects.toBeInstanceOf(NotPermittedError);
  });

  it("refuses a tenant the viewer does not hold at all", async () => {
    await expect(
      repo.getHome({ viewer: petra, tenantSlug: "beta", projectSlug: "kingsford" }),
    ).rejects.toBeInstanceOf(NotPermittedError);
  });

  it("refuses a real project addressed through the wrong tenant", async () => {
    // The slug pair is checked as a pair. Kingsford is real and Tomáš holds
    // it; `alpha/kingsford` is not the address it lives at.
    await expect(
      repo.getHome({ viewer: tomas, tenantSlug: "alpha", projectSlug: "kingsford" }),
    ).rejects.toThrow();
  });

  it("still opens the projects the viewer does hold", async () => {
    // A refusal test that cannot pass for the wrong reason: the same call
    // shape, on a granted pair, returns.
    const home = await repo.getHome({
      viewer: petra,
      tenantSlug: "alpha",
      projectSlug: "northgate",
    });
    expect(home).toBeDefined();
  });
});

describe("no route carries a person or a secret in its address", () => {
  function routeFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) return routeFiles(path);
      return /^(page|route|layout)\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("names no dynamic segment after a person or a credential", () => {
    /*
     * Path segments are the part of a URL that reaches proxies, browser
     * history and server logs whatever anybody does later. The product's own
     * segments are slugs and opaque ids — `[unitCode]`, `[agentId]`,
     * `[meetingId]`, `[threadId]` — and this fails the day one is named after
     * the thing the restricted contacts table exists to keep out of them.
     */
    const forbidden = /\[(.*(name|email|phone|token|secret|password|apiKey).*)\]/i;
    const offenders = routeFiles(APP)
      .map((f) => relative(APP, f))
      .filter((f) => forbidden.test(f.split(sep).join("/")));
    expect(offenders).toEqual([]);
  });

  it("puts no personal field or credential in a query string", () => {
    const forbidden = /[?&](name|email|phone|token|secret|password|api_?key)=/i;
    const offenders: string[] = [];
    for (const path of routeFiles(APP)) {
      const source = executable(readFileSync(path, "utf8"));
      if (forbidden.test(source)) offenders.push(relative(APP, path));
    }
    expect(offenders).toEqual([]);
  });
});
