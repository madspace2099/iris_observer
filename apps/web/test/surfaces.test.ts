import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIMARY_NAV, SECONDARY_NAV, SURFACES } from "../src/lib/routes";

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
    // The opening screen plus the three views it opens onto. Everything else —
    // Presentation DNA, Unit Attention, Storytelling, Meeting Replay — is a
    // drill-down reached from one of them, not a competing tab.
    expect(PRIMARY_NAV.map((n) => n.key)).toEqual(["showroom", "flow", "project", "agents"]);
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
    const linked = new Set<string>([
      ...PRIMARY_NAV.map((n) => n.key),
      ...SECONDARY_NAV.map((n) => n.key),
    ]);

    // Reached from within another surface rather than from a navigation row.
    const reachedFromAView = new Set([
      "audience", // the Project view's "Build an audience from this"
      "overview", // the demoted CRM-led surface, kept for comparison (ADR-0023)
      "people", // opened from a meeting, never listed on its own
      "[meetingId]", // a row in the meetings list
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

describe("no component reads fixtures directly", () => {
  it("imports the synthetic package only from the composition root", () => {
    // ADR-0007. A component that imports fixtures cannot be repointed at the
    // database later, and the demo and the product start to diverge.
    const offenders = sourceFiles
      .concat(walk(resolve(import.meta.dirname, "../src/components")))
      .concat(walk(resolve(import.meta.dirname, "../src/lib")))
      .filter((file) => readFileSync(file, "utf8").includes("@observer/synthetic"))
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
    expect(read("src/app/(app)/[tenantSlug]/[projectSlug]/layout.tsx")).toContain('id="main"');
    expect(read("src/app/madspace/page.tsx")).toContain('id="main"');
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
    const nav = read("src/components/PrimaryNav.tsx");
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
