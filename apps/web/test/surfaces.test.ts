import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIMARY_NAV, SURFACES } from "../src/lib/routes";

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
    // The four primary sections are all showroom-rooted since ADR-0023. The
    // CRM-led overview and the conversion funnel remain reachable but are no
    // longer what the product opens on.
    expect(PRIMARY_NAV.map((n) => n.key)).toEqual([
      "showroom",
      "presentation",
      "units",
      "storytelling",
    ]);
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

    // Only the composition root and the session adapter. A surface that needs
    // agents, units or meetings asks the repository port for them.
    expect(offenders.sort()).toEqual(["/src/lib/repository.ts", "/src/lib/session.ts"]);
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
    expect(read("src/app/sign-in/page.tsx")).toContain('id="main"');
  });

  it("labels the primary navigation and marks the current page", () => {
    const nav = read("src/components/PrimaryNav.tsx");
    expect(nav).toContain('aria-label="Sections"');
    expect(nav).toContain("aria-current");
  });

  it("labels the context switchers, which are icon-free but unlabelled visually", () => {
    const switcher = read("src/components/ContextSwitcher.tsx");
    expect(switcher).toContain("aria-label");
    expect(switcher).toContain('className="obs-sr"');
  });

  it("announces loading and error states to assistive technology", () => {
    expect(read("src/app/(app)/[tenantSlug]/[projectSlug]/loading.tsx")).toContain('role="status"');
    expect(read("src/app/(app)/[tenantSlug]/[projectSlug]/error.tsx")).toContain('role="alert"');
  });

  it("declares a document language", () => {
    expect(read("src/app/layout.tsx")).toContain('lang="en"');
  });
});
