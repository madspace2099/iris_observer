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
  /* Whether this server has a control plane: the page draws forms only where one is. */
  plane: false,
}));

const service = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  saveRealpadPricelist: vi.fn(),
  sync: vi.fn(),
  importCsv: vi.fn(),
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
  controlPlane: async () =>
    state.plane ? { ok: true, admin: {} } : { ok: false, absence: { kind: "not_enabled" } },
}));

const { connectMonday, connectRealpad, uploadFlatsCsv } =
  await import("../src/app/settings/crm/actions");
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

/* What MADSPACE stored, and what the page draws back into the form. */
const MONDAY = {
  boardId: "77",
  columns: { code: "name", status: "status" },
  statusMap: { Prodáno: "sold", Rezervováno: "reserved" },
};
const CSV = { columns: { code: "Kód", status: "Stav" }, statusMap: { Prodáno: "sold" } };

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

beforeEach(() => {
  /* The demonstration directory, as the local recording runs it. */
  process.env["OBSERVER_DEMO_ACCOUNTS"] = "1";
  state.accountId = "acct_clara";
  state.twin = null;
  state.plane = false;
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
  service.saveRealpadPricelist.mockResolvedValue({ ok: true });
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

  it("refuses an agency's admin the CRM of a project its developer owns", async () => {
    /* Tomáš is the admin of Meridian Sales, which sells ISTER TOWER for Alpha Estates. */
    state.accountId = "acct_tomas";
    state.twin = "uuid-twin";
    const answer = await connectRealpad(
      IDLE,
      form({ ...REALPAD, tenant: "alpha", project: "ister-tower" }),
    );
    expect(answer).toEqual({
      ok: false,
      message:
        "This project's CRM belongs to Alpha Estates, and only its admin connects it. Nothing was saved.",
    });
    expect(service.save).not.toHaveBeenCalled();
    expect(service.saveRealpadPricelist).not.toHaveBeenCalled();
  });

  it("lets the developer's own admin connect it", async () => {
    state.accountId = "acct_petra";
    state.twin = "uuid-twin";
    const answer = await connectRealpad(
      IDLE,
      form({ ...REALPAD, tenant: "alpha", project: "ister-tower" }),
    );
    expect(answer.ok).toBe(true);
    expect(service.saveRealpadPricelist).toHaveBeenCalledTimes(1);
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
    /* The pricelist pair only: the service keeps a Data Takeout pair stored beside it. */
    expect(service.saveRealpadPricelist).toHaveBeenCalledWith(
      "uuid-twin",
      {
        includeHidden: true,
        stageMap: { "7": "reservation" },
        developerId: 12,
        projectId: 34,
        screenId: 56,
      },
      { login: "shark-pricelist", password: PASSWORD },
      true,
    );
    expect(service.save).not.toHaveBeenCalled();
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
    expect(service.saveRealpadPricelist).not.toHaveBeenCalled();
  });

  it("keeps Monday's stored status words when the form is sent back as drawn, token only rotated", async () => {
    state.twin = "uuid-twin";
    service.list.mockResolvedValue([{ kind: "monday", configured: true, config: MONDAY }]);
    await connectMonday(
      IDLE,
      form({
        tenant: "shark",
        project: "shark-residence",
        token: "observer-test-token-not-real",
        boardId: "77",
        columns: "code=name\nstatus=status",
        statusMap: "Prodáno=sold\nRezervováno=reserved",
      }),
    );
    expect(service.save.mock.calls[0]?.[2]).toEqual(MONDAY);
  });

  it("keeps the flats sheet's status words, and says which words the upload met unmapped", async () => {
    state.twin = "uuid-twin";
    service.list.mockResolvedValue([{ kind: "csv", configured: true, config: CSV }]);
    service.importCsv.mockResolvedValue({
      ok: true,
      rejected: [],
      outcome: {
        ok: true,
        fetched: 2,
        changes: [{ kind: "changed" }],
        unknownStatuses: ["Volné"],
      },
    });
    const data = form({
      tenant: "shark",
      project: "shark-residence",
      columns: "code=Kód\nstatus=Stav",
      statusMap: "Prodáno=sold",
    });
    data.set("file", new File(["Kód,Stav\nA-1,Prodáno\nA-2,Volné\n"], "flats.csv"));
    const answer = await uploadFlatsCsv(IDLE, data);
    expect(service.save.mock.calls[0]?.[2]).toEqual(CSV);
    expect(answer.message).toBe(
      "Read 2 flats: 0 added, 1 changed, 0 withdrawn. 1 status word(s) are not mapped yet: Volné. Until they are, those flats read as unknown and none of them is dated as a sale.",
    );
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
    expect(html).toContain(
      "deal stages, and the date the CRM states for each reservation and purchase",
    );
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

  it("draws the developer's admin the forms, filled with the stored maps", async () => {
    state.accountId = "acct_petra";
    state.twin = "uuid-twin";
    state.plane = true;
    /* A test key, so the token forms are drawn; never a real one. */
    process.env["OBSERVER_CREDENTIAL_KEY"] = "ab".repeat(32);
    service.list.mockResolvedValue([
      { kind: "monday", configured: true, enabled: false, config: MONDAY, lastSync: null },
      {
        kind: "csv",
        configured: true,
        enabled: false,
        config: { ...CSV, stageMap: { Smlouva: "purchase" } },
        lastSync: null,
      },
    ]);
    const html = await render();
    expect(html).toContain('type="password"');
    expect(html).toContain("Prodáno=sold\nRezervováno=reserved");
    expect(html).toContain("code=Kód\nstatus=Stav");
    expect(html).toContain("Smlouva=purchase");
  });

  it("shows an agency's admin the developer's CRM, and no form", async () => {
    state.accountId = "acct_tomas";
    state.twin = "uuid-twin";
    state.plane = true;
    process.env["OBSERVER_CREDENTIAL_KEY"] = "ab".repeat(32);
    const html = await render();
    expect(html).toContain("ISTER TOWER");
    expect(html).toContain(
      "This project&#x27;s CRM belongs to Alpha Estates: its admin connects it, and Meridian Sales reads what it holds here.",
    );
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('type="file"');
  });

  it("states when the CRM last read in the project's zone, and names the zone", async () => {
    state.accountId = "acct_petra";
    state.twin = "uuid-twin";
    state.plane = true;
    service.list.mockResolvedValue([
      {
        kind: "csv",
        configured: true,
        enabled: false,
        config: CSV,
        lastSync: { at: "2026-10-20T06:00:00.000Z", outcome: "ok", fetched: 3, detail: "" },
      },
    ]);
    /* ISTER TOWER keeps Bratislava's clock: 06:00 UTC is 08:00 there, in summer time. */
    expect(await render()).toMatch(/Flats last read <time[^>]*>20 Oct 2026, 08:00 CEST<\/time>/);
  });
});
