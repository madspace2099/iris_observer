import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Viewer } from "@observer/readmodels";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";

import { maySetSalesWindow, parseSalesWindow } from "../src/lib/project-plan/access";
import type * as StoreModule from "../src/lib/project-plan/store";

/**
 * WHO SETS THE SALES WINDOW, AND WHERE IT GOES (ADR-0055).
 *
 * Through the real server action, the real accounts and the real composed
 * repository, with a real file store in a temporary directory. Only the
 * session (who is signed in), the cache and whether this server keeps a store
 * at all are stood in for.
 */

const state = vi.hoisted(() => ({
  accountId: "acct_clara" as string | null,
  dir: "",
  plane: true,
  revalidated: [] as string[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3400" }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path);
  },
}));
vi.mock("../src/lib/session", async () => {
  const accounts = await import("../src/lib/accounts");
  const account = () => (state.accountId === null ? null : accounts.accountById(state.accountId));
  return {
    SESSION_COOKIE: "observer_session",
    currentAccount: async () => account(),
    currentViewer: async () => {
      const found = account();
      return found === null ? null : accounts.viewerForAccount(found);
    },
  };
});
vi.mock("../src/lib/project-plan/store", async (importOriginal) => {
  const actual = await importOriginal<typeof StoreModule>();
  const store = () => (state.plane ? actual.fileSalesWindowStore(state.dir) : null);
  return {
    ...actual,
    salesWindowStore: store,
    liveSalesWindowSource: {
      windowFor: async (id: string) => (await store()?.read(id)) ?? null,
    },
  };
});

process.env["OBSERVER_DEMO_ACCOUNTS"] = "1";

const { saveSalesWindow } = await import("../src/lib/project-plan/actions");
const { repository } = await import("../src/lib/repository");
const { SalesPlanBlock } = await import("../src/components/project-plan/SalesPlanBlock");
const accounts = await import("../src/lib/accounts");
const store = await vi.importActual<typeof StoreModule>("../src/lib/project-plan/store");

const SHARK = "prj_sharkres001";
const IDLE = { ok: null, message: null } as const;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const shark = (startsOn: string, sellOutBy: string) =>
  form({ tenant: "shark", project: "shark-residence", startsOn, sellOutBy });

const fileOf = (projectId: string) => store.salesWindowPath(state.dir, projectId);

async function plan(accountId: string, tenantSlug = "shark", projectSlug = "shark-residence") {
  const account = accounts.accountById(accountId);
  if (account === null) throw new Error(accountId);
  const viewer = await accounts.viewerForAccount(account);
  return (
    await repository.getProjectCharts({
      viewer,
      tenantSlug,
      projectSlug,
      period: "quarter_to_date",
      language: DEFAULT_LANGUAGE,
    })
  ).plan;
}

beforeEach(() => {
  state.dir = mkdtempSync(join(tmpdir(), "plan-"));
  state.plane = true;
  state.accountId = "acct_clara";
  state.revalidated = [];
});
afterEach(() => rmSync(state.dir, { recursive: true, force: true }));

describe("the right", () => {
  const company = (name: string, role: "admin" | "member") => ({ name, role });
  const tenant = { name: "Shark Developments" };

  it("is the tenant's company admin's, and nobody else's", () => {
    expect(maySetSalesWindow("developer", company("Shark Developments", "admin"), tenant)).toBe(
      true,
    );
    expect(maySetSalesWindow("developer", company("Shark Developments", "member"), tenant)).toBe(
      false,
    );
    expect(maySetSalesWindow("agency_manager", company("Shark Sales", "admin"), tenant)).toBe(
      false,
    );
    // MADSPACE runs the platform; it never sets a customer's plan, whatever a name says.
    expect(
      maySetSalesWindow("madspace_admin", company("Shark Developments", "admin"), tenant),
    ).toBe(false);
  });
});

describe("two dates", () => {
  it("are calendar days, the second after the first", () => {
    expect(parseSalesWindow(" 2026-01-12 ", "2027-06-30")).toEqual({
      startsOn: "2026-01-12",
      sellOutBy: "2027-06-30",
    });
    expect(parseSalesWindow("2026-01-12", "")).toMatch(/Give both dates/);
    expect(parseSalesWindow("2026-01-12", "2027-02-30")).toMatch(/calendar day/);
    expect(parseSalesWindow("12/01/2026", "2027-06-30")).toMatch(/calendar day/);
    expect(parseSalesWindow("2027-06-30", "2027-06-30")).toMatch(/must come after/);
    expect(parseSalesWindow("1999-12-31", "2027-06-30")).toMatch(/between 2000 and 2100/);
    expect(parseSalesWindow(undefined, 3)).toMatch(/Give both dates/);
  });
});

describe("saving the window", () => {
  it("keeps Clara's dates and draws the plan from them", async () => {
    const answer = await saveSalesWindow(IDLE, shark("2026-01-12", "2026-12-31"));
    expect(answer).toEqual({
      ok: true,
      message: "Saved: selling from 12 Jan 2026, sold out by 31 Dec 2026.",
    });
    expect(existsSync(fileOf(SHARK))).toBe(true);
    expect(state.revalidated).toEqual(["/shark/shark-residence/project"]);

    // 36 unsold over the 129 days to 31 Dec (4.238 months) = 8.494 → "8.5".
    const after = await plan("acct_clara");
    expect(after.window?.sellOutByDisplay).toBe("31 Dec 2026");
    expect(after.verdictText).toBe("Behind: needs 8.5 a month, selling 4.7");
    // Everyone holding the project reads the same plan.
    expect((await plan("acct_daniel")).verdictText).toBe(after.verdictText);
  });

  it("without a saved window, reads the project's own configuration", async () => {
    expect((await plan("acct_clara")).window?.sellOutByDisplay).toBe("30 Jun 2027");
  });

  it.each([
    ["acct_daniel", /Only the admin of Shark Developments sets/],
    ["acct_nora", /Only the admin of Shark Developments sets/],
    ["acct_lena", /Only the admin of Shark Developments sets/],
    ["acct_petra", /not one your account holds/],
  ])("refuses %s, and keeps nothing", async (accountId, said) => {
    state.accountId = accountId;
    const answer = await saveSalesWindow(IDLE, shark("2026-01-12", "2026-12-31"));
    expect(answer.ok).toBe(false);
    expect(answer.message).toMatch(said);
    expect(answer.message).toMatch(/Nothing was saved\./);
    expect(existsSync(fileOf(SHARK))).toBe(false);
    expect(state.revalidated).toEqual([]);
  });

  it("refuses MADSPACE, and keeps nothing", async () => {
    state.accountId = "acct_madspace";
    const answer = await saveSalesWindow(IDLE, shark("2026-01-12", "2026-12-31"));
    expect(answer.ok).toBe(false);
    expect(existsSync(fileOf(SHARK))).toBe(false);
  });

  it("refuses a reader who is not signed in", async () => {
    state.accountId = null;
    expect(await saveSalesWindow(IDLE, shark("2026-01-12", "2026-12-31"))).toEqual({
      ok: false,
      message: "Sign in first.",
    });
  });

  it("refuses in words where this server keeps no dates", async () => {
    state.plane = false;
    const answer = await saveSalesWindow(IDLE, shark("2026-01-12", "2026-12-31"));
    expect(answer).toEqual({ ok: false, message: store.NO_PLAN_STORE });
  });

  it("refuses dates the form would not take", async () => {
    const answer = await saveSalesWindow(IDLE, shark("2027-06-30", "2026-01-12"));
    expect(answer).toEqual({
      ok: false,
      message: "The sell-out date must come after the sales start. Nothing was saved.",
    });
    expect(existsSync(fileOf(SHARK))).toBe(false);
  });

  it("ignores a file a hand has broken, and the configuration stands", async () => {
    mkdirSync(dirname(fileOf(SHARK)), { recursive: true });
    writeFileSync(
      fileOf(SHARK),
      JSON.stringify({ startsOn: "2027-01-01", sellOutBy: "2026-01-01" }),
    );
    expect((await plan("acct_clara")).window?.sellOutByDisplay).toBe("30 Jun 2027");
    writeFileSync(fileOf(SHARK), "{ not json");
    expect((await plan("acct_clara")).window?.sellOutByDisplay).toBe("30 Jun 2027");
  });
});

describe("the block", () => {
  async function block(accountId: string, tenantSlug: string, projectSlug: string, crm = true) {
    state.accountId = accountId;
    const account = accounts.accountById(accountId);
    if (account === null) throw new Error(accountId);
    const viewer: Viewer = await accounts.viewerForAccount(account);
    const { tenant } = await repository.resolveProject(viewer, tenantSlug, projectSlug);
    const element = await SalesPlanBlock({
      plan: await plan(accountId, tenantSlug, projectSlug),
      role: viewer.role,
      tenant,
      tenantSlug,
      projectSlug,
      crmConnected: crm,
    });
    return renderToStaticMarkup(element as ReactElement);
  }

  it("offers Clara the dates, and nobody else", async () => {
    const clara = await block("acct_clara", "shark", "shark-residence");
    expect(clara).toContain("Change the dates");
    expect(clara).toContain("On pace: needs 3.5 a month, selling 4.7");
    expect(clara).toContain("14 sales dated in the last 90 days");
    expect(clara).toContain("30 Jun 2027");
    expect(clara).toContain("At this pace, sold out in <b>Apr 2027</b>");

    const daniel = await block("acct_daniel", "shark", "shark-residence");
    expect(daniel).not.toContain("Change the dates");
    expect(daniel).not.toContain("<form");
  });

  it("says who sets the date where none is set, and draws no window", async () => {
    const tomas = await block("acct_tomas", "alpha", "northgate");
    expect(tomas).toContain("No sell-out date set");
    expect(tomas).toContain("The admin of Alpha Estates sets the sell-out date.");
    expect(tomas).not.toContain("iris-plan-track");
    expect(tomas).not.toContain('<button type="button" class="iris-action"');

    const petra = await block("acct_petra", "alpha", "northgate");
    expect(petra).toContain("Set the sell-out date");
  });

  it("tells the admin why there is no control where this server keeps no dates", async () => {
    state.plane = false;
    const clara = await block("acct_clara", "shark", "shark-residence");
    expect(clara).not.toContain("Change the dates");
    expect(clara).toContain("kept only on a local demonstration server");
  });

  it("puts the i beside the title, and never a zero for a split the CRM cannot give", async () => {
    const riverside = await block("acct_petra", "alpha", "riverside", false);
    expect(riverside).toContain('aria-label="About sold against the plan"');
    expect(riverside).toContain("Unavailable: the CRM is not connected");
    expect(riverside).toContain("<dt>Flats</dt><dd>36</dd>");
    expect(riverside).not.toContain('data-part="sold"');
    expect(riverside).not.toContain("iris-plan-stock");
    expect(riverside).not.toContain("Source:");
  });
});
