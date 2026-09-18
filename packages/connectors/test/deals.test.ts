import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ProjectIdSchema, TenantIdSchema } from "@observer/contracts";
import type { HttpRequest, HttpResponse } from "../src/http";
import {
  csvDeals,
  dealEventId,
  lomnioDeal,
  lomnioFetchDeals,
  memoryDealStore,
  mondayDeal,
  mondayFetchDeals,
  runDealSync,
  subjectKey,
} from "../src/deals";

/**
 * The deal adapters and the sync loop.
 *
 * What must hold: a buyer becomes a keyed hash before a deal exists, email
 * first and phone second, and the hash never contains the value; the three
 * adapters produce the same shape; a re-sync of an unchanged source yields
 * no new fact and a moved stage yields exactly one, with the same id on
 * every run; and a refused source is a refusal, not an empty snapshot.
 */

const PEPPER = "test-pepper-not-a-secret";
const NOW = () => new Date("2026-09-07T10:00:00.000Z");
const SCOPE = {
  tenantId: TenantIdSchema.parse("tnt_aabbccdd11"),
  projectId: ProjectIdSchema.parse("prj_istertower1"),
};
const STAGES = { new: "lead", meeting: "meeting", offer: "offer", won: "purchase" } as const;

describe("subjectKey", () => {
  it("hashes the email first, the phone second, and nothing when neither is stated", () => {
    const byMail = subjectKey(" Anna@Example.COM ", "+420 777 111 222", PEPPER);
    expect(byMail).toBe(
      createHmac("sha256", PEPPER).update("email:anna@example.com").digest("hex"),
    );
    expect(subjectKey("anna@example.com", null, PEPPER)).toBe(byMail);
    const byPhone = subjectKey(null, "+420 777-111-222", PEPPER);
    expect(byPhone).toBe(createHmac("sha256", PEPPER).update("phone:+420777111222").digest("hex"));
    expect(subjectKey(null, "12", PEPPER)).toBeNull();
    expect(subjectKey("", "", PEPPER)).toBeNull();
    expect(byMail).not.toContain("anna");
    expect(subjectKey("anna@example.com", null, "another-pepper")).not.toBe(byMail);
    expect(() => subjectKey("anna@example.com", null, "")).toThrow(TypeError);
  });
});

describe("csvDeals", () => {
  const config = {
    columns: {
      externalId: "Deal",
      stage: "Stage",
      unitCode: "Unit",
      email: "E-mail",
      phone: "Phone",
      stageEnteredAt: "Since",
    },
    stageMap: STAGES,
  };

  it("reads a sheet into deals, hashing the person on the way in", () => {
    const sheet =
      "Deal;Stage;Unit;E-mail;Phone;Since\n" +
      "D-1;meeting;A-101;anna@example.com;;2026-09-01T09:00:00Z\n" +
      "D-2;rezervace;;;+420 777 111 222;\n" +
      ";offer;A-102;;;\n" +
      "D-1;won;A-101;;;\n";
    const out = csvDeals(sheet, config, PEPPER);
    expect(out.deals.map((d) => [d.externalId, d.stage, d.stageRaw, d.unitCode])).toEqual([
      ["D-1", "meeting", "meeting", "A-101"],
      ["D-2", null, "rezervace", null],
    ]);
    expect(out.deals[0]?.subjectKey).toBe(subjectKey("anna@example.com", null, PEPPER));
    expect(out.deals[1]?.subjectKey).toBe(subjectKey(null, "+420777111222", PEPPER));
    expect(out.deals[0]?.stageEnteredAt).toBe("2026-09-01T09:00:00Z");
    expect(out.rejected).toEqual([
      { line: 4, reason: "no deal id" },
      { line: 5, reason: "duplicate deal id D-1" },
    ]);
    expect(JSON.stringify(out)).not.toContain("anna@example.com");
    expect(JSON.stringify(out)).not.toContain("777");
  });
});

describe("lomnioDeal", () => {
  it("maps a lead by its stage code, keeping the CRM's own flags", () => {
    const deal = lomnioDeal(
      {
        id: 41,
        external_id: null,
        stage: {
          id: 3,
          code: "offer",
          name: "Nabídka",
          is_won: false,
          entered_at: "2026-09-05T12:00:00Z",
        },
        is_won: false,
        is_lost: false,
        customer: { email: "b@example.com", phone: "777", phone_e164: "+420777000000" },
        unit: { code: "B-201" },
        created_at: "2026-08-30T08:00:00Z",
        updated_at: "2026-09-05T12:00:00Z",
      },
      { stageMap: STAGES },
      PEPPER,
    );
    expect(deal).toEqual({
      externalId: "41",
      unitCode: "B-201",
      subjectKey: subjectKey("b@example.com", null, PEPPER),
      stage: "offer",
      stageRaw: "offer",
      stageEnteredAt: "2026-09-05T12:00:00Z",
      openedAt: "2026-08-30T08:00:00Z",
      updatedAt: "2026-09-05T12:00:00Z",
      won: false,
      lost: false,
    });
    expect(lomnioDeal({ id: 1, stage: null }, { stageMap: STAGES }, PEPPER)).toBeNull();
  });
});

describe("lomnioFetchDeals", () => {
  it("walks every page with the bearer token and refuses on 401", async () => {
    const seen: HttpRequest[] = [];
    const pages: Record<string, HttpResponse> = {
      "1": {
        status: 200,
        headers: {},
        text: JSON.stringify({
          data: [{ id: 1, stage: { code: "new" }, customer: { email: "a@x.io" } }],
          links: { next: "next" },
          meta: { current_page: 1, last_page: 2 },
        }),
      },
      "2": {
        status: 200,
        headers: {},
        text: JSON.stringify({
          data: [{ id: 2, stage: { code: "won" }, is_won: true }],
          links: { next: null },
          meta: { current_page: 2, last_page: 2 },
        }),
      },
    };
    const out = await lomnioFetchDeals(
      { token: "tok" },
      { stageMap: STAGES },
      SCOPE,
      {
        now: NOW,
        http: async (request) => {
          seen.push(request);
          const page = new URL(request.url).searchParams.get("page") ?? "1";
          return pages[page] as HttpResponse;
        },
      },
      PEPPER,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(seen.map((r) => r.headers["authorization"])).toEqual(["Bearer tok", "Bearer tok"]);
    expect(out.snapshot.connector).toBe("lomnio");
    expect(out.snapshot.deals.map((d) => [d.externalId, d.stage, d.won])).toEqual([
      ["1", "lead", null],
      ["2", "purchase", true],
    ]);
    expect(JSON.stringify(out)).not.toContain("a@x.io");

    const refused = await lomnioFetchDeals(
      { token: "bad" },
      { stageMap: STAGES },
      SCOPE,
      {
        now: NOW,
        http: async () => ({ status: 401, headers: {}, text: "{}" }),
      },
      PEPPER,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe("unauthorised");
  });
});

describe("mondayDeal and mondayFetchDeals", () => {
  const config = {
    boardId: "77",
    columns: { externalId: "id", stage: "status", unitCode: "text_1", email: "email" },
    stageMap: STAGES,
  };

  it("reads a deals board by the client's column ids", async () => {
    const item = {
      id: "9001",
      name: "Anna",
      column_values: [
        { id: "status", text: "Meeting" },
        { id: "text_1", text: "A-101" },
        { id: "email", text: "anna@example.com" },
      ],
    };
    expect(mondayDeal(item, config, PEPPER)).toMatchObject({
      externalId: "9001",
      unitCode: "A-101",
      stage: "meeting",
      stageRaw: "Meeting",
      subjectKey: subjectKey("anna@example.com", null, PEPPER),
    });
    const out = await mondayFetchDeals(
      { token: "tok" },
      config,
      SCOPE,
      {
        now: NOW,
        http: async () => ({
          status: 200,
          headers: {},
          text: JSON.stringify({
            data: { boards: [{ items_page: { cursor: null, items: [item] } }] },
          }),
        }),
      },
      PEPPER,
    );
    expect(out.ok && out.snapshot.deals.length).toBe(1);
    expect(JSON.stringify(out)).not.toContain("anna@example.com");
  });
});

describe("runDealSync", () => {
  const scope = { ...SCOPE, connector: "lomnio" as const };
  const snapshot = (deals: Parameters<typeof lomnioDeal>[0][]) => async () =>
    lomnioFetchDeals(
      { token: "t" },
      { stageMap: STAGES },
      SCOPE,
      {
        now: NOW,
        http: async () => ({
          status: 200,
          headers: {},
          text: JSON.stringify({ data: deals, links: { next: null }, meta: { last_page: 1 } }),
        }),
      },
      PEPPER,
    );

  it("records one fact per move, the same fact once, and names unmapped words", async () => {
    const store = memoryDealStore();
    const first = await runDealSync(
      snapshot([
        { id: 1, stage: { code: "new" } },
        { id: 2, stage: { code: "meeting" } },
      ]),
      store,
      scope,
    );
    expect(first.ok && first.changes.map((c) => c.kind)).toEqual(["opened", "opened"]);

    const again = await runDealSync(
      snapshot([
        { id: 1, stage: { code: "new" } },
        { id: 2, stage: { code: "meeting" } },
      ]),
      store,
      scope,
    );
    expect(again.ok && again.changes).toEqual([]);
    expect(store.facts).toHaveLength(2);

    const moved = await runDealSync(
      snapshot([
        { id: 1, stage: { code: "meeting" } },
        { id: 2, stage: { code: "prehlidka" } },
      ]),
      store,
      scope,
    );
    expect(moved.ok && moved.changes.map((c) => [c.externalId, c.kind, c.to, c.toRaw])).toEqual([
      ["1", "stage_changed", "meeting", "meeting"],
      ["2", "stage_changed", null, "prehlidka"],
    ]);
    expect(moved.ok && moved.unmappedStages).toEqual(["prehlidka"]);
    expect(store.facts).toHaveLength(4);

    /* The same move, seen again: the same id, and no fifth fact. */
    const replay = await runDealSync(
      snapshot([
        { id: 1, stage: { code: "meeting" } },
        { id: 2, stage: { code: "prehlidka" } },
      ]),
      store,
      scope,
    );
    expect(replay.ok && replay.changes).toEqual([]);
    const ids = store.facts.map((f) => f.eventId);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(id).toMatch(/^[a-f0-9]{64}$/);
    const change = store.facts[2];
    if (change !== undefined) expect(dealEventId(scope, change)).toBe(change.eventId);
  });

  it("passes a refusal through untouched", async () => {
    const store = memoryDealStore();
    const out = await runDealSync(
      async () => ({
        ok: false,
        reason: "rate_limited",
        retryAfterSeconds: 30,
        detail: "slow down",
      }),
      store,
      scope,
    );
    expect(out).toEqual({
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: 30,
      detail: "slow down",
    });
    expect(store.facts).toEqual([]);
  });
});
