import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CONNECT YOUR CRM (ADR-0049): the company admin acts, a member reads, and a
 * form appears only where a save would land.
 *
 * The session, the control plane and the connector service are stood in for:
 * the service records what it was handed, so a test can say what was saved and
 * that the password never came back in the answer.
 */

const state = vi.hoisted(() => ({
  accountId: "acct_clara",
  twin: null as string | null,
}));

const service = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  sync: vi.fn(),
  dealSummary: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3400" }),
}));
vi.mock("../src/lib/session", async () => {
  const accounts = await import("../src/lib/accounts");
  const account = () => accounts.accountById(state.accountId);
  return {
    SESSION_COOKIE: "observer_session",
    destroySession: () => undefined,
    currentAccount: async () => account(),
    currentViewer: async () => {
      const found = account();
      return found === null ? null : accounts.viewerForAccount(found);
    },
    requireAccount: async () => account(),
    requireViewer: async () => {
      const found = account();
      if (found === null) throw new Error("signed out");
      return accounts.viewerForAccount(found);
    },
  };
});
vi.mock("../src/lib/directory/rows", () => ({
  controlPlaneProjectFor: async () => state.twin,
}));
vi.mock("../src/lib/connectors/live", () => ({
  liveConnectorService: async () => service,
}));
vi.mock("../src/lib/sources/control-plane", () => ({
  CONTROL_PLANE_ACCOUNT: "acct_test",
  controlPlane: async () => ({ ok: false, absence: { kind: "not_enabled" } }),
}));

const { connectRealpad } = await import("../src/app/settings/crm/actions");
const { default: CrmSettings } = await import("../src/app/settings/crm/page");

const IDLE = { ok: null, message: null } as const;
const PASSWORD = "observer-test-not-a-real-password";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const REALPAD = {
  tenant: "shark",
  project: "shark-residence",
  login: "shark-pricelist",
  password: PASSWORD,
  developerId: "12",
  realpadProjectId: "34",
  screenId: "56",
};

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

beforeEach(() => {
  /* The demonstration directory, as the local recording runs it. */
  process.env["OBSERVER_DEMO_ACCOUNTS"] = "1";
  state.accountId = "acct_clara";
  state.twin = null;
  vi.clearAllMocks();
  service.list.mockResolvedValue([
    {
      kind: "realpad",
      configured: true,
      enabled: false,
      config: { includeHidden: true, stageMap: { "7": "reservation" } },
    },
  ]);
  service.save.mockResolvedValue({ ok: true });
  service.sync.mockResolvedValue({
    ok: true,
    outcome: {
      ok: true,
      fetched: 3,
      changes: [{ kind: "added" }, { kind: "added" }, { kind: "changed" }],
      unknownStatuses: [],
    },
  });
  service.dealSummary.mockResolvedValue(new Map());
});

describe("who may connect a CRM", () => {
  it("refuses a member, naming the admin, and saves nothing", async () => {
    state.accountId = "acct_nora";
    const answer = await connectRealpad(IDLE, form(REALPAD));
    expect(answer.ok).toBe(false);
    expect(answer.message).toContain("Only Clara Weiss, the admin of Shark Developments");
    expect(service.save).not.toHaveBeenCalled();
  });

  it("refuses a project the account does not hold", async () => {
    state.twin = "uuid-twin";
    const answer = await connectRealpad(
      IDLE,
      form({ ...REALPAD, tenant: "alpha", project: "northgate" }),
    );
    expect(answer.message).toBe("That project is not one your account holds. Nothing was saved.");
    expect(service.save).not.toHaveBeenCalled();
  });

  it("refuses a project with no control-plane twin rather than pretending to save", async () => {
    const answer = await connectRealpad(IDLE, form(REALPAD));
    expect(answer.message).toContain("no CRM connection on this server's control plane");
    expect(service.save).not.toHaveBeenCalled();
  });
});

describe("what a company admin's save does", () => {
  it("saves through the connector service, keeps the stored mapping, reads once, and answers in words", async () => {
    state.twin = "uuid-twin";
    const answer = await connectRealpad(IDLE, form(REALPAD));
    expect(service.save).toHaveBeenCalledWith(
      "uuid-twin",
      "realpad",
      {
        includeHidden: true,
        stageMap: { "7": "reservation" },
        developerId: 12,
        projectId: 34,
        screenId: 56,
      },
      { login: "shark-pricelist", password: PASSWORD, takeoutLogin: null, takeoutPassword: null },
      true,
    );
    expect(service.sync).toHaveBeenCalledWith("uuid-twin", "realpad");
    expect(answer).toEqual({
      ok: true,
      message: "Connected. Read 3 flats: 2 added, 1 changed, 0 withdrawn.",
    });
    expect(JSON.stringify(answer)).not.toContain(PASSWORD);
  });

  it("keeps the stored credential when both fields are left empty", async () => {
    state.twin = "uuid-twin";
    await connectRealpad(IDLE, form({ ...REALPAD, login: "", password: "" }));
    expect(service.save.mock.calls[0]?.[3]).toBeNull();
  });
});

describe("the page", () => {
  const render = async () =>
    renderToStaticMarkup(await CrmSettings({ searchParams: Promise.resolve({}) }));

  it("shows a demonstration project as connected, with what it reads, and no form", async () => {
    const html = await render();
    expect(html).toContain("Connect your CRM");
    expect(html).toContain("Shark Residence");
    expect(html).toContain("Demonstration CRM, connected");
    expect(html).toContain("deal stages, and the date it states for each reservation and purchase");
    for (const provider of ["Realpad", "Monday.com", "Google Sheets", "CSV upload"]) {
      expect(html).toContain(provider);
    }
    expect(html).toContain("does not read a live sheet");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('type="file"');
  });

  it("tells a member who connects it", async () => {
    state.accountId = "acct_nora";
    expect(await render()).toContain("Clara Weiss, your company&#x27;s admin, connects it");
  });
});
