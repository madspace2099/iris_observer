import { describe, expect, it, vi } from "vitest";

import type { ObserverDb, ProjectDirectoryRow } from "../src/db";
import {
  isComplete,
  isCurrency,
  isLocale,
  isTimeZone,
  projectDirectoryAdmin,
  RESERVED_TENANT_SLUGS,
} from "../src/directory";

/**
 * WHAT THE DIRECTORY REFUSES BEFORE THE DATABASE IS ASKED.
 *
 * The database checks shapes. Whether a currency, a locale or a time zone is one
 * the dashboard can actually format with is decided here, identically for both
 * adapters, and a refusal names the field and never the value.
 */

const ACCOUNT = "acct_estate";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const TENANT = "33333333-3333-4333-8333-333333333333";

function service(overrides: Partial<ObserverDb> = {}) {
  const db = {
    tenantCreate: vi.fn().mockResolvedValue(TENANT),
    projectSettingsSet: vi.fn().mockResolvedValue(true),
    projectViewerGrant: vi.fn().mockResolvedValue(true),
    projectViewerRevoke: vi.fn().mockResolvedValue(true),
    projectAgentNameSet: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as ObserverDb;
  return { db, admin: projectDirectoryAdmin({ db }) };
}

const settings = {
  account: ACCOUNT,
  project: PROJECT,
  tenant: TENANT,
  slug: "alder-court",
  currency: "EUR",
  locale: "sk-SK",
  timeZone: "Europe/Bratislava",
};

describe("what counts as a currency, a locale and a time zone", () => {
  it("is what the runtime can format with", () => {
    expect(isCurrency("EUR")).toBe(true);
    expect(isCurrency("eur")).toBe(false);
    expect(isCurrency("ZZZ"), "three capitals that are no currency").toBe(false);

    expect(isLocale("sk-SK")).toBe(true);
    expect(isLocale("en-GB")).toBe(true);
    expect(isLocale("not a locale")).toBe(false);

    expect(isTimeZone("Europe/Bratislava")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Europe/Atlantis")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});

describe("a developer", () => {
  it("is refused by field for a slug that is a route, malformed, or missing", async () => {
    const { db, admin } = service();
    for (const slug of [...RESERVED_TENANT_SLUGS, "Upper", "two words", "-x", ""]) {
      const result = await admin.createTenant({ account: ACCOUNT, name: "X", slug });
      expect(result, slug).toEqual({
        ok: false,
        refusal: { code: "invalid_input", field: "slug" },
      });
    }
    expect(db.tenantCreate).not.toHaveBeenCalled();
  });

  it("is created with its name trimmed", async () => {
    const { db, admin } = service();
    expect(
      await admin.createTenant({ account: ACCOUNT, name: "  Alder  ", slug: "alder" }),
    ).toEqual({ ok: true, value: TENANT });
    expect(db.tenantCreate).toHaveBeenCalledWith({
      account: ACCOUNT,
      name: "Alder",
      slug: "alder",
    });
  });
});

describe("a project's settings", () => {
  it("are refused by field, before the database, for each thing that is not valid", async () => {
    const { db, admin } = service();
    const cases: readonly (readonly [Partial<typeof settings>, string])[] = [
      [{ project: "not-a-uuid" }, "project"],
      [{ tenant: "not-a-uuid" }, "tenant"],
      [{ slug: "Alder Court" }, "slug"],
      [{ currency: "ZZZ" }, "currency"],
      [{ locale: "xx_YY!" }, "locale"],
      [{ timeZone: "Europe/Atlantis" }, "timeZone"],
    ];
    for (const [change, field] of cases) {
      expect(await admin.setProjectSettings({ ...settings, ...change }), field).toEqual({
        ok: false,
        refusal: { code: "invalid_input", field },
      });
    }
    expect(db.projectSettingsSet).not.toHaveBeenCalled();
  });

  it("answer unknown_project when the database moved nothing", async () => {
    const { admin } = service({ projectSettingsSet: vi.fn().mockResolvedValue(false) });
    expect(await admin.setProjectSettings(settings)).toEqual({
      ok: false,
      refusal: { code: "unknown_project", field: "project" },
    });
  });
});

describe("a presenter's name", () => {
  it("is trimmed, bounded, and never empty", async () => {
    const { db, admin } = service();
    const base = { account: ACCOUNT, project: PROJECT, agent: "AG-1" };
    expect((await admin.nameAgent({ ...base, name: "   " })).ok).toBe(false);
    expect((await admin.nameAgent({ ...base, name: "x".repeat(121) })).ok).toBe(false);
    expect((await admin.nameAgent({ ...base, name: " Monika Kováčová " })).ok).toBe(true);
    expect(db.projectAgentNameSet).toHaveBeenCalledTimes(1);
    expect(db.projectAgentNameSet).toHaveBeenCalledWith({ ...base, name: "Monika Kováčová" });
  });

  it("is withdrawn by a null, which is not a missing name", async () => {
    const { db, admin } = service();
    const base = { account: ACCOUNT, project: PROJECT, agent: "AG-1" };
    expect((await admin.nameAgent({ ...base, name: null })).ok).toBe(true);
    /* Null reaches the database as null: the facade reads it as the withdrawal. */
    expect(db.projectAgentNameSet).toHaveBeenCalledWith({ ...base, name: null });
  });
});

describe("a complete project", () => {
  const row: ProjectDirectoryRow = {
    project_id: PROJECT,
    name: "Alder Court",
    slug: "alder-court",
    tenant_id: TENANT,
    tenant_name: "Alder Homes",
    tenant_slug: "alder-homes",
    currency: "EUR",
    locale: "sk-SK",
    time_zone: "Europe/Bratislava",
    created_at: "2026-09-18T08:00:00Z",
  };

  it("has every field the customer side needs, and lacks none", () => {
    expect(isComplete(row)).toBe(true);
    for (const key of [
      "slug",
      "tenant_id",
      "tenant_name",
      "tenant_slug",
      "currency",
      "locale",
      "time_zone",
    ] as const) {
      expect(isComplete({ ...row, [key]: null }), key).toBe(false);
    }
  });
});
