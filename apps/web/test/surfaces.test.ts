import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIMARY_NAV, PROJECT_NAV, SECONDARY_NAV, SURFACES } from "../src/lib/routes";

const appDir = resolve(import.meta.dirname, "../src/app");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = walk(appDir).filter((f) => f.endsWith(".tsx"));

describe("surface audience", () => {
  it("declares no buyer-facing surface yet", () => {
    // ADR-0018. Nothing in Observer is buyer-facing, and the first surface
    // that is must be added here deliberately rather than by a route appearing.
    expect(SURFACES.filter((s) => s.audience === "buyer_facing")).toEqual([]);
  });

  it("keeps the pre-meeting brief off every buyer-visible surface", () => {
    const brief = SURFACES.find((s) => s.route.includes("/meetings/"));
    expect(brief?.audience).toBe("internal");
    // Only the people who run or supervise a meeting. A developer sees the
    // project's figures, not a named buyer's browsing history.
    expect(brief?.requiresRole).toEqual(["sales_agent", "agency_manager", "madspace_admin"]);
    expect(brief?.requiresRole).not.toContain("developer");
  });

  it("gives every declared surface at least one role", () => {
    for (const surface of SURFACES) {
      if (surface.route === "/sign-in") continue;
      expect(surface.requiresRole.length, surface.route).toBeGreaterThan(0);
    }
  });

  it("keeps MADSPACE administration out of the customer navigation", () => {
    /*
     * ASK IRIS REPLACED BRIEFING AS THE FIRST SECTION, AND THIS LIST MOVED.
     *
     * The user chose this information architecture in conversation. The
     * doctrine's own source hierarchy (`iris-observer-product` §0) puts a
     * decision made in conversation ABOVE this skill, above the ADRs and
     * above the product documents, so the documents follow it rather than
     * outvote it; ADR-0033 records the decision so the conversation is not
     * the only place it survives.
     *
     * Briefing did not disappear. `/showroom` is still a declared surface and
     * still served; it is reached by name from Ask IRIS ("Today's briefing")
     * rather than from a navigation row, and the reachability check below is
     * what holds that link in place.
     *
     * Still a deep equality against a literal list, and deliberately so: the
     * point of this assertion is that the navigation cannot drift, only be
     * changed on purpose.
     */
    expect(PRIMARY_NAV.map((n) => n.key)).toEqual(["ask", "flow", "project", "agents"]);
    const admin = SURFACES.find((s) => s.route === "/madspace");
    expect(admin?.requiresRole).toEqual(["madspace_admin"]);
  });

  it("has a declared surface for every page in the application", () => {
    const routes = sourceFiles
      .filter((f) => f.endsWith("page.tsx"))
      .map((f) =>
        f
          .slice(appDir.length)
          .replace(/\\/g, "/")
          .replace(/\/page\.tsx$/, "")
          .replace(/\/\([^)]+\)/g, ""),
      )
      .map((r) => (r === "" ? "/" : r));

    for (const route of routes) {
      if (route === "/") continue;
      expect(
        SURFACES.some((s) => s.route === route),
        `${route} has no entry in SURFACES — add one and state its audience`,
      ).toBe(true);
    }
  });

  /*
   * A route nothing links to is deleted, whatever the repository still holds.
   *
   * Presentation DNA, Unit Attention, Storytelling and Meeting Replay were
   * "moved behind the three views" and then linked from nowhere. The code was
   * all still there; the analysis was gone. This asserts reachability rather
   * than existence.
   */
  it("leaves no project surface unreachable", () => {
    /*
     * Every row the shell actually draws. `PROJECT_NAV` joined them in the
     * ASK IRIS rollout: it is the Project section's own tab row, drawn by
     * `Shell` whenever the reader is inside Project, and `features` is
     * reachable because it is in it.
     */
    const linked = new Set<string>([
      ...PRIMARY_NAV.map((n) => n.key),
      ...PROJECT_NAV.map((n) => n.key),
      ...SECONDARY_NAV.map((n) => n.key),
    ]);

    // Reached from within another surface rather than from a navigation row.
    const reachedFromAView = new Set([
      "audience", // the Project view's "Build an audience from this"
      "overview", // the demoted CRM-led surface, kept for comparison (ADR-0023)
      "people", // opened from a meeting, never listed on its own
      "[meetingId]", // a row in the meetings list

      /*
       * ADDED BY THE ASK IRIS ROLLOUT (ADR-0033), each with where it is
       * reached from. The first is the one that MOVED: Briefing was a
       * navigation item and is now a link on the screen that replaced it.
       */
      "showroom", // "Today's briefing", named on the Ask IRIS screen
      "attention", // "What needs attention", named on the Ask IRIS screen
      "history", // "Earlier questions", named on the Ask IRIS screen
      "[threadId]", // a row in the Ask IRIS history list
      "[unitCode]", // a row in the unit register, on Units
      "[agentId]", // a row in the roster, on Sales Agents
    ]);

    const projectRoutes = SURFACES.filter((s) => s.route.startsWith("/[tenantSlug]/[projectSlug]/"))
      .map((s) => s.route.split("/").pop() ?? "")
      .filter((key) => key !== "");

    for (const key of projectRoutes) {
      expect(
        linked.has(key) || reachedFromAView.has(key),
        `/${key} is in SURFACES but nothing navigates to it — put it in a nav row or link it from a view`,
      ).toBe(true);
    }
  });
});

/**
 * Source with its comments removed.
 *
 * THE FOURTH TIME THIS REPOSITORY HAS BEEN BURNED BY THE SAME DEFECT, and the
 * first time on this file. A guard that scans raw text finds the sentence
 * explaining the rule as readily as the code breaking it, and then fails a
 * build for a docblock.
 *
 * It happened here on `apps/web/src/components/features/vocabulary.ts`, whose
 * comment says — correctly, and about itself — that a customer surface may not
 * import the fixture package. The scan below read that as an import. The three
 * earlier occurrences are recorded in `credentials.test.ts` and
 * `worker-bound.test.ts`, which both strip first for exactly this reason.
 *
 * Duplicated per file rather than shared, which is this repository's stated
 * convention: a guard that imports its stripper is a guard whose failure mode
 * lives one directory away from the rule it protects.
 */
function executable(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("no component reads fixtures directly", () => {
  it("reads code rather than the comments that explain the rule", () => {
    /*
     * The guard above must be able to fail, and must not fail on prose. A scan
     * that matched a docblock would have quietly failed this build for a file
     * that obeys the rule it describes — which is what it did before this test
     * existed.
     */
    const prose = [
      '/* never import "@observer/synthetic" from a component */',
      "export const a = 1;",
    ].join("\n");
    const code = 'import { x } from "@observer/synthetic";';
    expect(executable(prose)).not.toContain("@observer/synthetic");
    expect(executable(code)).toContain("@observer/synthetic");
    expect(executable("// @observer/synthetic in a line comment")).not.toContain(
      "@observer/synthetic",
    );
  });

  it("imports the synthetic package only from the composition root", () => {
    // ADR-0007. A component that imports fixtures cannot be repointed at the
    // database later, and the demo and the product start to diverge.
    const offenders = sourceFiles
      .concat(walk(resolve(import.meta.dirname, "../src/components")))
      .concat(walk(resolve(import.meta.dirname, "../src/lib")))
      .filter((file) => executable(readFileSync(file, "utf8")).includes("@observer/synthetic"))
      .map((file) => file.slice(resolve(import.meta.dirname, "..").length).replace(/\\/g, "/"));

    /*
     * Only the composition root, the session adapter and the account directory.
     * The directory is where an account becomes a viewer, so it is the one
     * other place that may name the synthetic world; a surface that needs
     * agents, units or meetings asks the repository port for them.
     */
    expect(offenders.sort()).toEqual([
      "/src/lib/accounts.ts",
      "/src/lib/repository.ts",
      "/src/lib/session.ts",
    ]);
  });

  it("has no mock data module anywhere in the application", () => {
    const mocks = sourceFiles.filter((f) => /mock|fixture|dummy|sample-?data/i.test(f));
    expect(mocks).toEqual([]);
  });
});

describe("accessibility foundations", () => {
  const read = (relative: string) =>
    readFileSync(resolve(import.meta.dirname, "..", relative), "utf8");

  it("offers a skip link to the main landmark", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('className="obs-skip"');
    expect(layout).toContain('href="#main"');
  });

  it("marks the main landmark on every shell", () => {
    /*
     * THE PROJECT LANDMARK IS ON THE SHELL COMPONENT, NOT ON THE LAYOUT.
     *
     * Exactly the argument the MADSPACE line below already makes, one level
     * further out. The customer surfaces used to each be wrapped by a layout
     * that drew its own header and its own `<main>`; they now share one
     * `Shell`, and three surfaces cannot each own a landmark. So the single
     * `<main id="main">` a skip link may target moved up into the one shell
     * they share, and this reads the file that renders it.
     *
     * The layout still carries its own landmark on the refusal branch, where
     * the shell is deliberately not rendered at all — but asserting it there
     * would be asserting the exception rather than the rule.
     */
    expect(read("src/components/iris/Shell.tsx")).toContain('id="main"');
    /*
     * The MADSPACE landmark is on the LAYOUT, not the page.
     *
     * It was on `madspace/page.tsx` while administration was the only screen
     * under `/madspace`. The operations screens arrived beside it and three
     * surfaces cannot each own a header, so the shell — and with it the single
     * `<main id="main">` a skip link may target — moved up to the layout they
     * share. Asserting it on the page would now demand a second landmark inside
     * the first, which is the accessibility defect rather than the fix.
     */
    expect(read("src/app/madspace/layout.tsx")).toContain('id="main"');
    /*
     * The two portal surfaces mark their own landmark. Sign-in no longer
     * delegates its shell to the profile picker — that component renders only
     * in the laboratory now — so the landmark is asserted on the pages
     * themselves.
     */
    expect(read("src/app/sign-in/page.tsx")).toContain('id="main"');
    expect(read("src/app/projects/page.tsx")).toContain('id="main"');
  });

  it("labels the primary navigation and marks the current page", () => {
    /*
     * The nav moved into the shell, and `PrimaryNav.tsx` was deleted rather
     * than left behind: it and `DetailNav` rendered the same two rows in a
     * different vocabulary, and a component nothing imports is not a spare,
     * it is a second answer waiting to disagree with the first.
     *
     * This reads the component that actually renders the navigation now.
     */
    const nav = read("src/components/iris/Shell.tsx");
    expect(nav).toContain('aria-label="Sections"');
    expect(nav).toContain("aria-current");
  });

  it("gives every context switcher one exact accessible name", () => {
    /*
     * `aria-label` alone, not a wrapping label with hidden text.
     *
     * A `<label>` folds its own text *and* the option list into the control's
     * accessible name — "PeriodQuarter to dateLast 28 days…" — which is both
     * wrong for a screen reader and ambiguous for anything querying by name.
     */
    for (const file of [
      "src/components/ContextSwitcher.tsx",
      "src/components/PeriodSwitcher.tsx",
    ]) {
      const switcher = read(file);
      expect(switcher, `${file} must name its control`).toContain("aria-label");
      // The closing tag, not the opening one — the comment above each control
      // explains why a wrapping label is wrong, and says "<label>" doing it.
      expect(switcher, `${file} must not wrap the select in a label`).not.toContain("</label>");
    }
  });

  it("announces loading and error states to assistive technology", () => {
    expect(read("src/app/(app)/[tenantSlug]/[projectSlug]/loading.tsx")).toContain('role="status"');
    expect(read("src/app/(app)/[tenantSlug]/[projectSlug]/error.tsx")).toContain('role="alert"');
  });

  it("declares a document language", () => {
    expect(read("src/app/layout.tsx")).toContain('lang="en"');
  });
});
