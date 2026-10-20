import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { observerAdmin, type ObserverDb } from "@observer/sources";

/**
 * THE ONBOARDING WIZARD'S ONE PRESS (ADR-0044).
 *
 * `onboardAction` writes a developer, a project, its settings, a source and an
 * activation code. The order it does that in is the whole contract: nothing is
 * written until every field, the operator and both peppers have passed, and a
 * domain another project holds is refused before `createProject` raises on it.
 * The real `observerAdmin` runs over a fake port, so the service's own
 * validation and the real code mint are in the loop; the port records every
 * call it receives.
 */

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const SOURCE = "33333333-3333-4333-8333-333333333333";

const calls: string[] = [];
const WRITES = ["tenantCreate", "projectCreate", "settings", "sourceCreate", "activationIssue"];
const wrote = () => calls.filter((call) => WRITES.includes(call));

let tenants: { slug: string; tenant_id: string; name: string }[] = [];
let projects: { slug: string | null }[] = [];
let credential: { created_at: string } | null = null;

const db = {
  tenantsForAccount: vi.fn(async () => (calls.push("tenants"), tenants)),
  tenantCreate: vi.fn(async () => (calls.push("tenantCreate"), TENANT)),
  projectsForAccount: vi.fn(async () => (calls.push("projects"), projects)),
  projectCreate: vi.fn(async () => (calls.push("projectCreate"), PROJECT)),
  projectSettingsSet: vi.fn(async () => (calls.push("settings"), true)),
  sourceCreate: vi.fn(async () => (calls.push("sourceCreate"), SOURCE)),
  activationIssue: vi.fn(async () => (calls.push("activationIssue"), true)),
  credentialStatus: vi.fn(async () => credential),
};
const deps = { db: db as unknown as ObserverDb, env: process.env, now: () => new Date() };

let role = "madspace_admin";

vi.mock("../src/lib/session", () => ({
  currentViewer: () => Promise.resolve({ userId: "u_ops", displayName: "Ops", role }),
}));
vi.mock("../src/lib/sources/control-plane", () => ({
  CONTROL_PLANE_ACCOUNT: "acct_test",
  controlPlane: () => Promise.resolve({ ok: true, admin: observerAdmin(deps) }),
}));
vi.mock("../src/lib/sources/deps", () => ({
  observerDepsAsync: () => Promise.resolve(deps),
}));
vi.mock("../src/lib/directory/live", () => ({ forgetDirectoryMemo: vi.fn() }));
vi.mock("../src/lib/repository", () => ({
  isSyntheticTenantSlug: (slug: string) => slug === "shark",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { onboardAction } = await import("../src/lib/madspace/create-actions");
const { activationClaimedAction } = await import("../src/lib/madspace/source-actions");

const INPUT = {
  client: "Client-482",
  projectName: "Riverside Gardens",
  projectSlug: "riverside-gardens",
  currency: "eur",
  locale: "sk-SK",
  timeZone: "Europe/Bratislava",
  sourceLabel: "Main PC",
  environment: "demo",
};

beforeEach(() => {
  calls.length = 0;
  tenants = [];
  projects = [];
  credential = null;
  role = "madspace_admin";
  vi.clearAllMocks();
  /* Demo-only values in a test process; the harness relaxes the distinct-character rule. */
  vi.stubEnv("OBSERVER_ACTIVATION_CODE_PEPPER", "b".repeat(64));
  vi.stubEnv("OBSERVER_SOURCE_TOKEN_PEPPER", "c".repeat(64));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("onboarding a client", () => {
  it("reads, then writes developer, project, settings, source and code, in that order", async () => {
    const answer = await onboardAction(INPUT);

    expect(calls).toEqual([
      "tenants",
      "projects",
      "tenantCreate",
      "projectCreate",
      "settings",
      "sourceCreate",
      "activationIssue",
    ]);
    if (!answer.ok) throw new Error(answer.problem);
    expect(answer.code).toMatch(/^obs\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{40,}$/);
    expect(answer).toMatchObject({
      projectId: PROJECT,
      sourceId: SOURCE,
      tenantSlug: "client-482",
      projectSlug: "riverside-gardens",
    });
    const lifetime = (Date.parse(answer.expiresAt) - Date.parse(answer.issuedAt)) / 1000;
    expect(Math.abs(lifetime - 900)).toBeLessThan(5);
    expect(db.projectSettingsSet).toHaveBeenCalledWith(
      expect.objectContaining({
        project: PROJECT,
        tenant: TENANT,
        slug: "riverside-gardens",
        currency: "EUR",
      }),
    );
    expect(db.activationIssue).toHaveBeenCalledWith(
      expect.objectContaining({ source: SOURCE, purpose: "activation" }),
    );
  });

  it("reuses the developer that already holds the client ID", async () => {
    tenants = [{ slug: "client-482", tenant_id: TENANT, name: "Client 482" }];
    const answer = await onboardAction(INPUT);
    expect(answer.ok).toBe(true);
    expect(calls).not.toContain("tenantCreate");
    expect(db.projectSettingsSet).toHaveBeenCalledWith(expect.objectContaining({ tenant: TENANT }));
  });

  it.each([
    ["client", "", 1],
    ["client", "not a slug!", 1],
    ["client", "madspace", 1],
    ["client", "shark", 1],
    ["projectName", " ", 2],
    ["projectSlug", "-edge", 2],
    ["currency", "", 2],
    ["currency", "XYZ", 2],
    ["locale", "not a locale at all", 2],
    ["timeZone", "Mars/Olympus_Mons", 2],
    ["sourceLabel", "", 3],
    ["environment", "", 3],
    ["environment", "lab", 3],
  ] as const)(
    "refuses %s %j at step %i before anything is read or written",
    async (key, value, step) => {
      const answer = await onboardAction({ ...INPUT, [key]: value });
      expect(answer).toMatchObject({ ok: false, step });
      expect(calls).toEqual([]);
    },
  );

  it("refuses a missing pepper before the first read or write, and names it", async () => {
    vi.stubEnv("OBSERVER_SOURCE_TOKEN_PEPPER", "");
    const answer = await onboardAction(INPUT);
    expect(answer).toMatchObject({ ok: false, step: 3 });
    if (answer.ok) return;
    expect(answer.problem).toContain("OBSERVER_SOURCE_TOKEN_PEPPER");
    expect(answer.problem).not.toContain("c".repeat(32));
    expect(calls).toEqual([]);
  });

  it("refuses two peppers that are the same value", async () => {
    vi.stubEnv("OBSERVER_SOURCE_TOKEN_PEPPER", "b".repeat(64));
    const answer = await onboardAction(INPUT);
    expect(answer).toMatchObject({ ok: false, step: 3 });
    expect(wrote()).toEqual([]);
  });

  it("refuses a domain another project holds before createProject, and before the developer", async () => {
    projects = [{ slug: "riverside-gardens" }];
    const answer = await onboardAction(INPUT);
    expect(answer).toMatchObject({ ok: false, step: 2 });
    expect(wrote()).toEqual([]);
  });

  it("answers the race on the domain in words, and stops there", async () => {
    db.projectCreate.mockImplementationOnce(async () => {
      calls.push("projectCreate");
      throw new Error('duplicate key value violates unique constraint "projects_slug"');
    });
    const answer = await onboardAction(INPUT);
    expect(answer).toMatchObject({ ok: false, step: 2 });
    if (!answer.ok) expect(answer.problem).not.toContain("duplicate key");
    expect(calls).not.toContain("sourceCreate");
  });

  it("refuses anyone who is not a MADSPACE administrator, touching nothing", async () => {
    role = "developer_exec";
    const answer = await onboardAction(INPUT);
    expect(answer.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("the wizard's activation poll", () => {
  const issuedAt = "2026-10-19T10:00:00.000Z";

  it("says activated only for a credential minted at or after the code", async () => {
    expect(await activationClaimedAction(SOURCE, issuedAt)).toEqual({ ok: true, activated: false });
    credential = { created_at: "2026-10-19T09:59:59.000Z" };
    expect(await activationClaimedAction(SOURCE, issuedAt)).toEqual({ ok: true, activated: false });
    credential = { created_at: "2026-10-19T10:03:12.000Z" };
    expect(await activationClaimedAction(SOURCE, issuedAt)).toEqual({ ok: true, activated: true });
  });

  it("refuses a caller who is not a MADSPACE administrator", async () => {
    role = "developer_exec";
    expect((await activationClaimedAction(SOURCE, issuedAt)).ok).toBe(false);
    expect(db.credentialStatus).not.toHaveBeenCalled();
  });
});
