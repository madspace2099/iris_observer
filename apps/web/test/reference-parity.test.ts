import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIMARY_NAV, SECONDARY_NAV, SURFACES } from "../src/lib/routes";

/**
 * THE ORIGINAL OBSERVER IS THE PRODUCT, AND THESE SAY SO.
 *
 * A three-page `Overview – Units – Insights` demo was built alongside this
 * application and, for a while, sat next to it in the same repository looking
 * like a competing version of it. It was not: the product is the `(app)` tree —
 * Briefing, Sales Flow, Project, Sales Agents and the surfaces beneath them —
 * and the demo has been removed.
 *
 * These checks hold that outcome. They are written against the reference
 * snapshot the frontend was verified from (commit 3515402, the tree in
 * `iris_observer-main.zip`), so a future change that reintroduces the generic
 * information architecture, drops a reference route, or promotes a lab route
 * into the navigation fails here rather than in a review.
 */

const appDir = resolve(import.meta.dirname, "../src/app");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Every route the application serves, as Next resolves it. */
const routes = walk(appDir)
  .filter((f) => f.endsWith("page.tsx"))
  .map((f) =>
    f
      .slice(appDir.length)
      .replace(/\\/g, "/")
      .replace(/\/page\.tsx$/, "")
      .replace(/\/\([^)]+\)/g, ""),
  )
  .map((r) => (r === "" ? "/" : r));

/**
 * The reference route inventory, verified byte-for-byte against the snapshot.
 *
 * Not a wish list: every entry was present in the archive and every one of them
 * was exercised in a browser during the parity milestone.
 */
const REFERENCE_ROUTES: readonly string[] = [
  "/",
  "/sign-in",
  /*
   * ADDED AFTER THE REFERENCE, deliberately and with approval.
   *
   * The account layer arrived in M0.1: a reader signs in, lands here, and opens
   * a project. The reference had no such route because it had no account layer
   * — a profile picker minted the session and the root redirect chose a project
   * on the reader's behalf. Both are gone.
   */
  "/projects",
  "/madspace",
  "/lab",
  "/lab/sign-in",
  "/lab/overview-a",
  "/lab/overview-b",
  "/[tenantSlug]/[projectSlug]/showroom",
  "/[tenantSlug]/[projectSlug]/flow",
  "/[tenantSlug]/[projectSlug]/project",
  "/[tenantSlug]/[projectSlug]/agents",
  "/[tenantSlug]/[projectSlug]/presentation",
  "/[tenantSlug]/[projectSlug]/units",
  "/[tenantSlug]/[projectSlug]/storytelling",
  "/[tenantSlug]/[projectSlug]/meetings",
  "/[tenantSlug]/[projectSlug]/meetings/[meetingId]",
  "/[tenantSlug]/[projectSlug]/audience",
  "/[tenantSlug]/[projectSlug]/people",
  "/[tenantSlug]/[projectSlug]/overview",
];

describe("every route the reference served is still served", () => {
  it.each(REFERENCE_ROUTES)("serves %s", (route) => {
    expect(routes).toContain(route);
  });

  it("serves nothing the reference did not, beyond declared API handlers", () => {
    /*
     * A page route that is not in the reference is either a deliberate later
     * surface or the generic demo creeping back. There are none, and this is
     * what keeps it that way.
     */
    expect([...routes].sort()).toEqual([...REFERENCE_ROUTES].sort());
  });
});

describe("the generic three-page demo is not part of the application", () => {
  it("serves no /observer route", () => {
    expect(routes.filter((r) => r.startsWith("/observer"))).toEqual([]);
  });

  it("declares no /observer surface", () => {
    expect(SURFACES.filter((s) => s.route.startsWith("/observer"))).toEqual([]);
  });

  it("holds no observer-demo module", () => {
    const src = resolve(import.meta.dirname, "../src");
    const offenders = walk(src).filter((f) => f.replace(/\\/g, "/").includes("/observer-demo/"));
    expect(offenders).toEqual([]);
  });

  it("has no Overview-Units-Insights navigation", () => {
    /*
     * The demo's information architecture, named exactly. A navigation with
     * these three as its primary rows is the generic dashboard, not Observer.
     */
    const keys = PRIMARY_NAV.map((n) => n.key);
    const generic = ["overview", "units", "insights"];
    expect(generic.every((g) => keys.includes(g))).toBe(false);
    expect(keys).not.toContain("insights");
  });
});

describe("the navigation matches the reference", () => {
  it("keeps the four primary sections, in order", () => {
    expect(PRIMARY_NAV.map((n) => n.key)).toEqual(["showroom", "flow", "project", "agents"]);
    expect(PRIMARY_NAV.map((n) => n.label)).toEqual([
      "Briefing",
      "Sales Flow",
      "Project",
      "Sales Agents",
    ]);
  });

  it("keeps the four detail surfaces beneath them, in order", () => {
    expect(SECONDARY_NAV.map((n) => n.key)).toEqual([
      "presentation",
      "units",
      "storytelling",
      "meetings",
    ]);
    expect(SECONDARY_NAV.map((n) => n.label)).toEqual([
      "Presentation DNA",
      "Unit Attention",
      "Storytelling",
      "Meetings",
    ]);
  });
});

describe("hidden and lab routes keep the visibility the reference gave them", () => {
  const navKeys = new Set([...PRIMARY_NAV.map((n) => n.key), ...SECONDARY_NAV.map((n) => n.key)]);

  it.each(["/lab", "/lab/sign-in", "/lab/overview-a", "/lab/overview-b"])(
    "leaves %s out of the navigation",
    (route) => {
      expect(routes).toContain(route);
      const key = route.split("/").pop() ?? "";
      expect(navKeys.has(key)).toBe(false);
    },
  );

  it("leaves MADSPACE administration out of the customer navigation", () => {
    expect(routes).toContain("/madspace");
    expect(navKeys.has("madspace")).toBe(false);
    expect(SURFACES.find((s) => s.route === "/madspace")?.requiresRole).toEqual(["madspace_admin"]);
  });

  it.each(["audience", "people", "overview"])(
    "keeps %s reachable from a view rather than from a nav row",
    (key) => {
      expect(routes).toContain(`/[tenantSlug]/[projectSlug]/${key}`);
      expect(navKeys.has(key)).toBe(false);
    },
  );
});

describe("Ask Observer keeps the structure the reference shipped", () => {
  const read = (relative: string): string =>
    readFileSync(resolve(import.meta.dirname, "..", relative), "utf8");

  it("keeps the rail, the orb, the prompt, the suggestions and the answer sheet", () => {
    const rail = read("src/showroom/observer/ObserverRail.tsx");
    expect(rail).toMatch(/Orb/);
    expect(rail).toMatch(/suggestionsFor/);
    expect(rail).toMatch(/useObserver/);
    const console_ = read("src/showroom/observer/ObserverConsole.tsx");
    expect(console_).toMatch(/Ask Observer about this project/);
  });

  it("keeps the keyboard shortcut that opens it", () => {
    const rail = read("src/showroom/observer/ObserverRail.tsx");
    expect(rail).toMatch(/metaKey|ctrlKey/);
    expect(rail).toMatch(/"k"|'k'/);
  });

  it("keeps an answer built from measured facts, evidence and limitations", () => {
    const answer = read("src/showroom/observer/Answer.tsx");
    for (const part of ["fact", "evidence", "limit"]) {
      expect(answer.toLowerCase(), part).toContain(part);
    }
  });

  it("is not a chat timeline", () => {
    /*
     * The later intelligence milestone may change how an answer is produced.
     * It may not turn this into a conversation: the answer sheet is the
     * accepted anatomy, and multi-turn memory is explicitly out of scope until
     * that work is authorised.
     */
    const answer = read("src/showroom/observer/Answer.tsx");
    expect(answer).not.toMatch(/messages\.map|chatHistory|conversationTurns/);
  });
});

describe("the demonstration data is deterministic and self-contained", () => {
  it("needs no external data source to render a surface", () => {
    /*
     * Every surface reads the repository port, and the synthetic repository
     * answers it. A screen that reached for Supabase, a CRM or an HTTP endpoint
     * would not render in a local review at all.
     */
    const repository = readFileSync(
      resolve(import.meta.dirname, "../src/lib/repository.ts"),
      "utf8",
    );
    expect(repository).toContain("@observer/synthetic");
    expect(repository).not.toMatch(/https?:\/\/(?!localhost)/);
  });
});
