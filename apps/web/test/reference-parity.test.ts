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
  /*
   * ADDED AFTER THE REFERENCE, deliberately and with approval.
   *
   * Account settings — the reader's own OpenAI connection (ADR-0030). Not a
   * project route and takes no tenant: the credential belongs to the account
   * and is used across every project that account may open.
   */
  "/settings/ai",
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

/**
 * Routes this repository has added since the reference, each one on purpose.
 *
 * The assertion below used to say the application serves the reference set and
 * nothing else, on the true observation that there were no extra routes yet.
 * There are now, and the guarantee worth keeping is not "no new routes" — it is
 * "no route arrives without somebody writing it down". So a new surface is
 * declared here, with its reason, and an undeclared one still fails exactly as
 * the generic demo creeping back would.
 */
const ADDED_SINCE_REFERENCE: readonly string[] = [
  /*
   * The MADSPACE operations surface. Not customer product: it answers whether
   * an installation is activated, connected and delivering, and it is gated to
   * `madspace_admin` in `SURFACES` and again in each page.
   */
  "/madspace/projects",
  "/madspace/projects/new",
  "/madspace/projects/[projectId]",
  "/madspace/projects/[projectId]/sources/new",
  "/madspace/sources/[sourceId]",
  "/madspace/diagnostics",

  /*
   * Ask IRIS — the approved design's flagship, at a real URL and under review.
   * It renders the new shell against the real read model without disturbing the
   * surfaces above, which is what lets both exist while the design is judged.
   */
  "/iris/[tenantSlug]/[projectSlug]",

  /*
   * The design lab, which exists to be deleted. Three candidate compositions
   * for five screens; when a direction is chosen the winner moves into the real
   * screens and these two routes go with the branch.
   */
  "/design-lab",
  "/design-lab/[screen]/[variant]",

  /*
   * THE ASK IRIS ROLLOUT (ADR-0033).
   *
   * The user chose a new information architecture in conversation and the
   * doctrine's source hierarchy puts that above the documents. These are the
   * routes it needs. Each is a thin placeholder today: the route exists so a
   * composition has somewhere to land, and so the navigation above it is not
   * pointing at a 404 while it is written.
   */

  /*
   * The bare project URL. It was a 404 on every project — a layout with no
   * page — and the approved design's own first navigation item pointed at
   * it. It redirects to the home segment, carrying the period across.
   */
  "/[tenantSlug]/[projectSlug]",

  /*
   * Ask IRIS itself, the landing surface. Not a chatbot and not an insight
   * card: it is where a project now opens, and the briefing it replaced is
   * one of the things it names rather than a competing tab.
   */
  "/[tenantSlug]/[projectSlug]/ask",
  /*
   * A question worth asking is worth returning to, so the answers keep
   * addresses: the list of them, and one of them. Evidence that can only be
   * reached by asking again is evidence nobody can show a colleague.
   */
  "/[tenantSlug]/[projectSlug]/ask/history",
  "/[tenantSlug]/[projectSlug]/ask/[threadId]",

  /*
   * One unit and one agent, promoted from query parameters on the register
   * and the roster to routes of their own, for the same reason: a single
   * subject that cannot be linked to cannot be discussed.
   */
  "/[tenantSlug]/[projectSlug]/units/[unitCode]",
  "/[tenantSlug]/[projectSlug]/agents/[agentId]",

  /*
   * Features — the fourth face of Project, and the successor to Storytelling
   * under the name of what it actually measures. `/storytelling` is NOT
   * removed: it permanently redirects here, so the reference route above is
   * still served and every old link still lands somewhere real.
   */
  "/[tenantSlug]/[projectSlug]/features",
  /*
   * Attention — the list Ask IRIS produces when it is asked which apartments
   * need attention, given an address so the answer can be sent rather than
   * re-asked. Reached by name from Ask IRIS; deliberately not a nav item.
   */
  "/[tenantSlug]/[projectSlug]/attention",

  /*
   * The stress sibling of the lab, and deliberately a separate route rather
   * than a flag on the one above. The review route performs one real read and
   * is where every screenshot comes from; this one renders an in-memory estate
   * of twelve projects and fifty installations so a layout can be asserted at a
   * size the real estate cannot yet reach. Keeping them apart means there is no
   * switch on the review route that could be left on, and no chance of a
   * reviewer holding an image of data that does not exist.
   */
  /*
   * The Observer review index, beside the lab it is named after but reviewing a
   * different thing: the customer product, not the control plane. Development
   * only, and linked from nowhere in the product.
   */
  "/design-lab/observer",

  "/design-lab/stress/[screen]/[variant]",
];

describe("every route the reference served is still served", () => {
  it.each(REFERENCE_ROUTES)("serves %s", (route) => {
    expect(routes).toContain(route);
  });

  it("serves nothing undeclared, beyond declared API handlers", () => {
    /*
     * A page route that is in neither list is either an accident or the generic
     * demo creeping back. Both fail here, and the failure names the file: the
     * fix is to add it to `ADDED_SINCE_REFERENCE` with the reason it exists, or
     * to delete it.
     */
    const declared = [...REFERENCE_ROUTES, ...ADDED_SINCE_REFERENCE].sort();
    expect([...routes].sort()).toEqual(declared);
  });

  it("declares no route twice, and none it does not serve", () => {
    /*
     * The companion property. Without it the list above could accumulate names
     * of routes that were deleted, or the same route in both lists, and go on
     * passing — a route inventory that is wrong in the quiet direction.
     */
    const declared = [...REFERENCE_ROUTES, ...ADDED_SINCE_REFERENCE];
    expect(declared.filter((r, i) => declared.indexOf(r) !== i)).toEqual([]);
    expect(ADDED_SINCE_REFERENCE.filter((r) => !routes.includes(r))).toEqual([]);
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

describe("the way in is account, then projects, then Observer", () => {
  /*
   * THE FLOW, PINNED.
   *
   * A reader signs in, lands on the projects their account was granted, and
   * opens one. There is no profile-selection step in that sequence, and the
   * component that used to provide one is confined to the design laboratory.
   * Each of these fails if somebody puts it back.
   */

  const appFiles = walk(appDir).filter((f) => f.endsWith(".tsx"));
  const outsideLab = appFiles.filter((f) => !f.replace(/\\/g, "/").includes("/lab/"));

  it("renders the profile picker from exactly one route, and that route is the laboratory", () => {
    const importers = appFiles
      .filter((f) => readFileSync(f, "utf8").includes("ProfilePicker"))
      .map((f) => f.slice(appDir.length).replace(/\\/g, "/"));
    expect(importers).toEqual(["/lab/sign-in/page.tsx"]);
  });

  it("keeps the picker out of every product route", () => {
    const offenders = outsideLab
      .filter((f) => readFileSync(f, "utf8").includes("ProfilePicker"))
      .map((f) => f.slice(appDir.length).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });

  it("declares that laboratory route internal and MADSPACE-only", () => {
    const lab = SURFACES.find((surface) => surface.route === "/lab/sign-in");
    expect(lab?.audience).toBe("internal");
    expect(lab?.requiresRole).toEqual(["madspace_admin"]);
  });

  it("serves a credential form at the sign-in, not a list of people", () => {
    const signIn = readFileSync(join(appDir, "sign-in", "page.tsx"), "utf8");
    expect(signIn).toContain('type="email"');
    expect(signIn).toContain('type="password"');
    expect(signIn).toContain("authenticate(");
    expect(signIn).not.toContain("ProfilePicker");
  });

  it("sends an authenticated reader to the projects, never to a project it picks for them", () => {
    /*
     * The bare root has no path to resolve a landing from, so it still always
     * sends a signed-in reader to the project selector; that half of the
     * behaviour is unchanged. Sign-in itself now resolves a landing path
     * (`resolveLandingPath` — the last project the reader was in, or the one
     * project they hold), and hardcoding neither literal decides on their
     * behalf: the check is that sign-in defers to that resolver rather than
     * that it always names "/projects" — that string still appears, but only
     * as `resolveLandingPath`'s own fallback for an account that holds several
     * projects and has none remembered.
     */
    const root = readFileSync(join(appDir, "page.tsx"), "utf8");
    expect(root).toContain("/projects");
    expect(root).not.toMatch(/showroom|northgate|tenantSlug/);

    const signIn = readFileSync(join(appDir, "sign-in", "page.tsx"), "utf8");
    expect(signIn).toContain("resolveLandingPath");
    expect(signIn).not.toMatch(/redirect\(dynamicRoute\(\s*"\/projects"\s*\)\)/);
  });

  it("describes the flow with no step between the account and the projects", () => {
    /*
     * The milestone was once reported as "account, then SUB" + "PROFILE, then
     * Observer", which was never the flow that was built. The term is banned
     * rather than corrected, so the wrong description cannot come back in a
     * comment, a label or a heading.
     *
     * Assembled from two halves so this rule does not match itself; the file
     * that owns a ban is the one file allowed to name what it bans.
     */
    const banned = new RegExp("sub" + "-?" + "profile", "i");
    const src = resolve(import.meta.dirname, "../src");
    const roots = [src, resolve(import.meta.dirname, ".")];
    const offenders = roots
      .flatMap((root) => walk(root))
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".css"))
      .filter((f) => f !== import.meta.filename)
      .filter((f) => banned.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(resolve(import.meta.dirname, "..").length));
    expect(offenders).toEqual([]);
  });
});

describe("the navigation matches the reference", () => {
  it("keeps the four primary sections, in order", () => {
    /*
     * THE FIRST SECTION CHANGED, ON PURPOSE, AND THIS RECORDS WHY.
     *
     * This suite exists to make the reference architecture hard to lose by
     * accident. It was never meant to make it impossible to change on
     * purpose — so the list moved and the assertion moved with it, still a
     * deep equality against a literal, still failing on any drift.
     *
     * The change: `Briefing` is replaced by `ASK IRIS`. The user chose this
     * information architecture in conversation; the `iris-observer-product`
     * source hierarchy (§0) puts a decision made in conversation above this
     * skill, above the ADRs and above the product documents, and ADR-0033
     * records it so the conversation is not the only place it survives.
     *
     * It is a replacement rather than a rename: the landing surface is now a
     * question rather than a summary. The briefing is still served, still
     * declared, and reached by name from Ask IRIS — `surfaces.test.ts` holds
     * that link in place, which is what stops this from being a deletion.
     */
    expect(PRIMARY_NAV.map((n) => n.key)).toEqual(["ask", "flow", "project", "agents"]);
    expect(PRIMARY_NAV.map((n) => n.label)).toEqual([
      "ASK IRIS",
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
