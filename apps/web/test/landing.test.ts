import { beforeEach, describe, expect, it, vi } from "vitest";
import { VIEWERS } from "@observer/synthetic";

import { LAST_PROJECT_COOKIE } from "../src/lib/cookie-names";

/*
 * `landing.ts` reads the last-project cookie through `next/headers`, which
 * only resolves inside a request. Every test here stands in for one request
 * by mocking `cookies()` to return whichever cookie jar that test needs —
 * usually one entry, sometimes none, matching what `middleware.ts` would
 * actually have written.
 */
const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies }));

function jarWithLastProject(value: string | undefined) {
  cookies.mockResolvedValue({
    get: (name: string) =>
      name === LAST_PROJECT_COOKIE && value !== undefined ? { value } : undefined,
  });
}

// Imported after the mock is registered, so `landing.ts`'s own top-level
// `import { cookies } from "next/headers"` binds to the mock.
const { resolveLandingPath } = await import("../src/lib/landing");

describe("resolveLandingPath", () => {
  beforeEach(() => {
    cookies.mockReset();
  });

  it("sends a single-project account straight to that project's Ask IRIS", async () => {
    jarWithLastProject(undefined);
    // Martin Kováč holds ISTER TOWER and nothing else.
    await expect(resolveLandingPath(VIEWERS.salesAgentIster)).resolves.toBe(
      "/alpha/ister-tower/ask",
    );
  });

  it("resolves Martin Kováč to ISTER TOWER's Ask IRIS by name, not by accident", async () => {
    // The mandate's own example — pinned as its own case so a future change
    // to the single-project rule cannot pass while this one name regresses.
    jarWithLastProject(undefined);
    const path = await resolveLandingPath(VIEWERS.salesAgentIster);
    expect(path).toBe("/alpha/ister-tower/ask");
  });

  it("prefers the remembered last project over the single-project fallback", async () => {
    // Tomáš Varga (agency manager) holds three projects across two tenants —
    // nothing here could resolve to "the only one" — so a remembered,
    // still-authorised project is the only way this resolves to a project at
    // all rather than falling to /projects.
    jarWithLastProject("alpha/ister-tower");
    await expect(resolveLandingPath(VIEWERS.agencyManager)).resolves.toBe(
      "/alpha/ister-tower/ask",
    );
  });

  it("falls through a remembered project this account never held", async () => {
    // A cookie is browser state; it can outlive a revoked grant or belong to
    // someone else's earlier session on a shared machine. Re-validation must
    // refuse it exactly as it would a typo, not merely log it and continue.
    jarWithLastProject("beta/kingsford");
    // Petra Novák holds only Alpha Estates' three projects.
    await expect(resolveLandingPath(VIEWERS.developer)).resolves.toBe("/projects");
  });

  it("falls through a remembered project that never existed at all", async () => {
    jarWithLastProject("alpha/does-not-exist");
    await expect(resolveLandingPath(VIEWERS.developer)).resolves.toBe("/projects");
  });

  it("falls through a malformed cookie value with no project segment", async () => {
    jarWithLastProject("alpha");
    await expect(resolveLandingPath(VIEWERS.developer)).resolves.toBe("/projects");
  });

  it("sends a multi-project account with nothing remembered to the picker", async () => {
    jarWithLastProject(undefined);
    // Petra Novák: three projects, one tenant — genuinely a choice.
    await expect(resolveLandingPath(VIEWERS.developer)).resolves.toBe("/projects");
  });

  it("still falls to the picker for a multi-project account spanning tenants", async () => {
    jarWithLastProject(undefined);
    // Tomáš Varga: three projects across Alpha Estates and Beta Development —
    // the count has to keep counting across the tenant boundary, not reset at
    // it.
    await expect(resolveLandingPath(VIEWERS.agencyManager)).resolves.toBe("/projects");
  });
});
