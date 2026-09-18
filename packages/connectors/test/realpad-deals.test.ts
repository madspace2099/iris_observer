import { describe, expect, it } from "vitest";
import { ProjectIdSchema, TenantIdSchema } from "@observer/contracts";
import { memoryDealStore, runDealSync } from "../src/deals";
import type { HttpRequest, HttpResponse } from "../src/http";
import {
  realpadDeal,
  realpadDealsFromWorkbook,
  realpadFetchDeals,
  type RealpadDealsConfig,
} from "../src/realpad-deals";
import { workbook } from "./support/workbook";

/**
 * REALPAD's business cases through Data Takeout.
 *
 * The header ids in these fixtures are placeholders a person would have read
 * off a real export — the adapter is told them, it never knows them. What is
 * asserted: the request is the documented one (one project, stable header
 * ids, the newer workbook format); WON and LOST are REALPAD's meanings and
 * override any table; a Lifecycle id goes through the tenant's table or is
 * carried raw; a refused export is a refusal with nothing from the body; and
 * the sync loop produces one fact per move with the same id on every run.
 */

const PEPPER = "test-pepper-not-a-secret";
const NOW = () => new Date("2026-09-07T10:00:00.000Z");
const SCOPE = {
  tenantId: TenantIdSchema.parse("tnt_aabbccdd11"),
  projectId: ProjectIdSchema.parse("prj_istertower1"),
};

/** Placeholder header ids. A real export names its own; these stand in for what a person types. */
const CONFIG: RealpadDealsConfig = {
  projectId: 3356887,
  columns: {
    externalId: "deal_id",
    stage: "lifecycle_id",
    unitCode: "main_unit_id",
    status: "status_id",
  },
  stageMap: { "11": "lead", "12": "meeting", "14": "offer" },
};

const HEADER = ["deal_id", "status_id", "lifecycle_id", "main_unit_id", "customer_id"];

describe("realpadDeal", () => {
  const lookup = (row: Record<string, string>) => (id: string) => row[id] ?? null;

  it("maps a Lifecycle id through the tenant's table and carries an unknown one raw", () => {
    expect(
      realpadDeal(
        lookup({ deal_id: "1", status_id: "1", lifecycle_id: "12", main_unit_id: "A-101" }),
        CONFIG,
        PEPPER,
      ),
    ).toMatchObject({
      externalId: "1",
      unitCode: "A-101",
      stage: "meeting",
      stageRaw: "12",
      won: false,
      lost: false,
      subjectKey: null,
    });
    expect(
      realpadDeal(lookup({ deal_id: "2", status_id: "4", lifecycle_id: "99" }), CONFIG, PEPPER),
    ).toMatchObject({ stage: null, stageRaw: "99", won: false, lost: false });
  });

  it("takes WON and LOST from the Status, whatever the Lifecycle or the table says", () => {
    expect(
      realpadDeal(lookup({ deal_id: "3", status_id: "3", lifecycle_id: "12" }), CONFIG, PEPPER),
    ).toMatchObject({ stage: "purchase", stageRaw: "WON", won: true, lost: false });
    expect(
      realpadDeal(lookup({ deal_id: "4", status_id: "2", lifecycle_id: "12" }), CONFIG, PEPPER),
    ).toMatchObject({ stage: "lost", stageRaw: "LOST", won: false, lost: true });
  });

  it("uses the Status word itself when no Lifecycle column is named", () => {
    /* The stage column names a header the export does not carry. */
    const noLifecycle = {
      ...CONFIG,
      columns: { externalId: "deal_id", status: "status_id", stage: "absent" },
    };
    expect(
      realpadDeal(lookup({ deal_id: "5", status_id: "1" }), noLifecycle, PEPPER),
    ).toMatchObject({
      stage: null,
      stageRaw: "ACTIVE",
    });
    expect(
      realpadDeal(
        lookup({ deal_id: "5", status_id: "4" }),
        { ...noLifecycle, stageMap: { SLEEPING: "reservation" } },
        PEPPER,
      ),
    ).toMatchObject({ stage: "reservation", stageRaw: "SLEEPING" });
  });

  it("knows nothing about won or lost without a Status column", () => {
    const config = { ...CONFIG, columns: { externalId: "deal_id", stage: "lifecycle_id" } };
    expect(realpadDeal(lookup({ deal_id: "6", lifecycle_id: "11" }), config, PEPPER)).toMatchObject(
      {
        stage: "lead",
        won: null,
        lost: null,
      },
    );
  });

  it("refuses a row with no deal id or no word at all", () => {
    expect(realpadDeal(lookup({ status_id: "1", lifecycle_id: "12" }), CONFIG, PEPPER)).toEqual({
      reason: "no deal id",
    });
    expect(realpadDeal(lookup({ deal_id: "7" }), CONFIG, PEPPER)).toEqual({ reason: "no stage" });
  });

  it("hashes a person only if a column holding one is named, and keeps no value", () => {
    const config = { ...CONFIG, columns: { ...CONFIG.columns, email: "customer_email" } };
    const deal = realpadDeal(
      lookup({
        deal_id: "8",
        status_id: "1",
        lifecycle_id: "11",
        customer_email: "anna@example.com",
      }),
      config,
      PEPPER,
    );
    expect(JSON.stringify(deal)).not.toContain("anna@example.com");
    expect("subjectKey" in deal && deal.subjectKey).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("realpadDealsFromWorkbook", () => {
  it("reads the header ids from the first row and every Deal after it", () => {
    const bytes = workbook([
      HEADER,
      ["1001", "1", "12", "A-101", "500"],
      ["1002", "3", "14", "B-202", "501"],
      ["", "", "", "", ""],
      ["1001", "1", "12", "A-101", "500"],
      ["", "1", "12", "C-1", "502"],
    ]);
    const out = realpadDealsFromWorkbook(bytes, CONFIG, PEPPER);
    expect(out?.deals.map((d) => [d.externalId, d.stage, d.stageRaw, d.unitCode])).toEqual([
      ["1001", "meeting", "12", "A-101"],
      ["1002", "purchase", "WON", "B-202"],
    ]);
    expect(out?.rejected).toEqual([
      { line: 5, reason: "duplicate deal id 1001" },
      { line: 6, reason: "no deal id" },
    ]);
    /* The customer id column is not named, so it is not read. */
    expect(JSON.stringify(out)).not.toContain("500");
  });

  it("is null for bytes that are not a workbook, and empty for a workbook with no rows", () => {
    expect(realpadDealsFromWorkbook(Buffer.from("<html>"), CONFIG, PEPPER)).toBeNull();
    expect(realpadDealsFromWorkbook(workbook([]), CONFIG, PEPPER)).toEqual({
      deals: [],
      rejected: [],
    });
  });
});

describe("realpadFetchDeals", () => {
  const credential = { login: "project-acme-takeout", password: "s3cret" };

  it("asks for one project, stable header ids and the newer format, as a file", async () => {
    const requests: HttpRequest[] = [];
    const out = await realpadFetchDeals(
      credential,
      CONFIG,
      SCOPE,
      {
        now: NOW,
        http: async (request) => {
          requests.push(request);
          return {
            status: 200,
            headers: {
              "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
            text: "",
            bytes: workbook([HEADER, ["1001", "1", "12", "A-101", "500"]]),
          };
        },
      },
      PEPPER,
    );
    const request = requests[0];
    expect(request?.url).toBe("https://cms.realpad.eu/ws/v10/list-excel-business-cases");
    expect(request?.method).toBe("POST");
    expect(request?.binary).toBe(true);
    expect(Object.fromEntries(new URLSearchParams(request?.body ?? ""))).toEqual({
      login: "project-acme-takeout",
      password: "s3cret",
      projectids: "3356887",
      headermode: "ids",
      xlsx: "1",
    });
    expect(out.ok && out.snapshot).toMatchObject({
      connector: "realpad",
      fetchedAt: "2026-09-07T10:00:00.000+00:00",
      deals: [{ externalId: "1001", stage: "meeting" }],
    });
  });

  it.each<[string, HttpResponse, string, number | null]>([
    [
      "a wrong or banned credential",
      { status: 401, headers: {}, text: "bad login project-acme-takeout" },
      "unauthorised",
      null,
    ],
    [
      "the cooldown",
      { status: 429, headers: { "retry-after": "300" }, text: "try later" },
      "rate_limited",
      300,
    ],
    ["an answer without a file", { status: 200, headers: {}, text: "<html/>" }, "malformed", null],
    [
      "a file that is not a workbook",
      { status: 200, headers: {}, text: "", bytes: Buffer.from("<html/>") },
      "malformed",
      null,
    ],
  ])("refuses on %s with nothing from the body", async (_label, response, reason, retry) => {
    const out = await realpadFetchDeals(
      credential,
      CONFIG,
      SCOPE,
      { now: NOW, http: async () => response },
      PEPPER,
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe(reason);
    expect(out.retryAfterSeconds).toBe(retry);
    expect(JSON.stringify(out)).not.toContain("project-acme-takeout");
    expect(JSON.stringify(out)).not.toContain("try later");
  });
});

describe("through the sync loop", () => {
  it("records one fact per move and the same fact once, with stable ids", async () => {
    const store = memoryDealStore();
    const scope = { ...SCOPE, connector: "realpad" as const };
    const fetching = (rows: string[][]) => async () =>
      realpadFetchDeals(
        { login: "l", password: "p" },
        CONFIG,
        SCOPE,
        {
          now: NOW,
          http: async () => ({
            status: 200,
            headers: {},
            text: "",
            bytes: workbook([HEADER, ...rows]),
          }),
        },
        PEPPER,
      );
    const first = await runDealSync(
      fetching([
        ["1", "1", "11", "A-1", ""],
        ["2", "1", "12", "A-2", ""],
      ]),
      store,
      scope,
    );
    expect(first.ok && first.changes.map((c) => [c.externalId, c.kind, c.to])).toEqual([
      ["1", "opened", "lead"],
      ["2", "opened", "meeting"],
    ]);
    const again = await runDealSync(
      fetching([
        ["1", "1", "11", "A-1", ""],
        ["2", "1", "12", "A-2", ""],
      ]),
      store,
      scope,
    );
    expect(again.ok && again.changes).toEqual([]);
    const moved = await runDealSync(fetching([["1", "3", "11", "A-1", ""]]), store, scope);
    expect(moved.ok && moved.changes.map((c) => [c.externalId, c.kind, c.to, c.toRaw])).toEqual([
      ["1", "stage_changed", "purchase", "WON"],
      ["2", "withdrawn", null, null],
    ]);
    const ids = store.facts.map((f) => f.eventId);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(id).toMatch(/^[a-f0-9]{64}$/);
  });
});
