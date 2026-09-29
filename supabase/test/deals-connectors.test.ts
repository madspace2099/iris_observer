import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ProjectIdSchema, TenantIdSchema, type CrmDeal } from "@observer/contracts";
import {
  dbDealStore,
  dealEventId,
  lomnioFetchDeals,
  memoryDealStore,
  recordDealSyncOutcome,
  runDealSync,
  sqlDealsDb,
} from "@observer/connectors";

import {
  applyMigrations,
  closeSuiteDatabases,
  closeTestDatabases,
  openDatabase,
} from "./support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE DEALS STORE, EXECUTED.
 *
 * The migration is run verbatim against a real Postgres, then asked what a
 * reviewer would: is a fact written once however often it is delivered, is
 * the fact log append-only, does a project resolve only through its own
 * account, can a row ever hold a person, and can a browser role reach any
 * of it.
 */

const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260907100000_observer_catalogue_and_connectors.sql",
  "20260907180000_observer_deals.sql",
];

const ACCOUNT_A = "acct_alpha";
const ACCOUNT_B = "acct_beta";
const PEPPER = "test-pepper-not-a-secret";
const NOW = () => new Date("2026-09-07T10:00:00.000Z");
const KEY = "a".repeat(64);

let db: PGlite;
let projectA: string;
let projectB: string;

beforeAll(async () => {
  db = await openDatabase("suite", "hosted");
  await applyMigrations(db, FILES);
  projectA = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
    ACCOUNT_A,
    "Ister Tower",
    "ister-tower",
  ]);
  projectB = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
    ACCOUNT_B,
    "Kingsford Yard",
    "kingsford",
  ]);
});

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  const row = result.rows[0];
  if (row === undefined) throw new Error(`no row from: ${sql}`);
  return Object.values(row)[0] as T;
}

const port = () => sqlDealsDb((sql, params) => db.query(sql, [...params]));

const SCOPE = {
  tenantId: TenantIdSchema.parse("tnt_aabbccdd11"),
  projectId: ProjectIdSchema.parse("prj_istertower1"),
  connector: "lomnio" as const,
};

function deal(externalId: string, over: Partial<CrmDeal> = {}): CrmDeal {
  return {
    externalId,
    unitCode: "A-101",
    subjectKey: KEY,
    stage: "meeting",
    stageRaw: "meeting",
    stageEnteredAt: null,
    openedAt: "2026-09-01T09:00:00.000+00:00",
    updatedAt: null,
    won: null,
    lost: null,
    ...over,
  };
}

const fetching = (leads: { id: number; stage: { code: string } }[]) => async () =>
  lomnioFetchDeals(
    { token: "t" },
    { stageMap: { new: "lead", meeting: "meeting", offer: "offer", won: "purchase" } },
    SCOPE,
    {
      now: NOW,
      http: async () => ({
        status: 200,
        headers: {},
        text: JSON.stringify({ data: leads, links: { next: null }, meta: { last_page: 1 } }),
      }),
    },
    PEPPER,
  );

describe("the fact log", () => {
  it("writes a fact once however often the same move is delivered", async () => {
    const store = dbDealStore(port(), ACCOUNT_A, projectA);
    const first = await runDealSync(
      fetching([
        { id: 1, stage: { code: "new" } },
        { id: 2, stage: { code: "meeting" } },
      ]),
      store,
      SCOPE,
    );
    expect(first.ok && first.changes.map((c) => c.kind)).toEqual(["opened", "opened"]);

    /* The very same snapshot, applied again straight at the façade. */
    if (!first.ok) throw new Error("refused");
    const replay = await port().dealsApply(
      ACCOUNT_A,
      projectA,
      "lomnio",
      "2026-09-07T10:00:01.000+00:00",
      first.changes.map((c) => deal(c.externalId, { stageRaw: c.toRaw ?? "x", stage: c.to })),
      first.changes,
    );
    expect(replay).toEqual({ opened: 0, changed: 0, withdrawn: 0 });
    expect(await one<number>(`select count(*)::int from observer.deal_stage_changes`)).toBe(2);

    const moved = await runDealSync(fetching([{ id: 1, stage: { code: "offer" } }]), store, SCOPE);
    expect(moved.ok && moved.changes.map((c) => [c.externalId, c.kind, c.to])).toEqual([
      ["1", "stage_changed", "offer"],
      ["2", "withdrawn", null],
    ]);
    /* Every fact here shares one fetch instant (the clock is fixed), so the order among them is not a promise. */
    const changes = await port().dealChanges(ACCOUNT_A, projectA, 10);
    expect(
      changes
        .map((c) => [c.external_id, c.kind, c.from_stage, c.to_stage])
        .sort((a, b) => String(a).localeCompare(String(b))),
    ).toEqual([
      ["1", "opened", null, "lead"],
      ["1", "stage_changed", "lead", "offer"],
      ["2", "opened", null, "meeting"],
      ["2", "withdrawn", "meeting", null],
    ]);
    for (const c of changes) expect(c.event_id).toMatch(/^[a-f0-9]{64}$/);
    const current = await port().dealsCurrent(ACCOUNT_A, projectA, "lomnio");
    expect(current.map((r) => r.external_id)).toEqual(["1"]);
  });

  it("refuses to rewrite or erase history", async () => {
    await expect(
      db.query(`update observer.deal_stage_changes set to_stage = 'purchase'`),
    ).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from observer.deal_stage_changes`)).rejects.toThrow(
      /append-only/,
    );
  });

  it("refuses a row that carries a person", async () => {
    await expect(
      db.query(
        `insert into observer.deals_current (project_id, account_id, connector, external_id, deal, fetched_at)
         values ($1, $2, 'csv', 'x', $3::jsonb, now())`,
        [projectA, ACCOUNT_A, JSON.stringify({ externalId: "x", email: "a@b.c" })],
      ),
    ).rejects.toThrow(/no_person/);
  });

  it("writes nothing for a project the account does not own", async () => {
    const change = {
      kind: "opened" as const,
      externalId: "z",
      unitCode: null,
      subjectKey: null,
      from: null,
      fromRaw: null,
      to: "lead" as const,
      toRaw: "new",
      at: "2026-09-07T10:00:00.000+00:00",
      observedAt: "2026-09-07T10:00:00.000+00:00",
    };
    const written = await port().dealsApply(
      ACCOUNT_A,
      projectB,
      "lomnio",
      "2026-09-07T10:00:00.000+00:00",
      [deal("z")],
      [{ ...change, eventId: dealEventId(SCOPE, change) }],
    );
    expect(written).toBeNull();
    expect(await port().dealsCurrent(ACCOUNT_B, projectB, "lomnio")).toEqual([]);
  });

  it("agrees with the in-memory store about what a sync produces", async () => {
    const memory = memoryDealStore();
    const fromMemory = await runDealSync(fetching([{ id: 7, stage: { code: "won" } }]), memory, {
      ...SCOPE,
      connector: "monday",
    });
    const fromDb = await runDealSync(
      fetching([{ id: 7, stage: { code: "won" } }]),
      dbDealStore(port(), ACCOUNT_A, projectA),
      { ...SCOPE, connector: "monday" },
    );
    expect(fromDb.ok && fromDb.changes).toEqual(fromMemory.ok && fromMemory.changes);
  });
});

describe("sync attempts", () => {
  it("records refused attempts too, and reports the last one per connector", async () => {
    await recordDealSyncOutcome(port(), ACCOUNT_A, projectA, "lomnio", {
      ok: false,
      reason: "unauthorised",
      retryAfterSeconds: null,
      detail: "The token was refused.",
    });
    await recordDealSyncOutcome(port(), ACCOUNT_A, projectA, "lomnio", {
      ok: true,
      connector: "lomnio",
      fetched: 3,
      changes: [],
      unmappedStages: ["prehlidka"],
      fetchedAt: "2026-09-07T10:05:00.000+00:00",
    });
    const last = await port().dealSyncLast(ACCOUNT_A, projectA);
    expect(last.map((r) => [r.connector, r.outcome, r.fetched, r.unmapped_stages])).toEqual([
      ["lomnio", "ok", 3, ["prehlidka"]],
    ]);
    expect(await port().dealSyncLast(ACCOUNT_B, projectB)).toEqual([]);
  });
});

describe("who can reach it", () => {
  const facades = [
    "public.observer_deals_apply(text, uuid, text, timestamptz, jsonb, jsonb)",
    "public.observer_deals_current(text, uuid, text)",
    "public.observer_deal_changes(text, uuid, integer)",
    "public.observer_deal_sync_record(text, uuid, text, text, integer, integer, integer, integer, jsonb, integer, text)",
    "public.observer_deal_sync_last(text, uuid)",
  ];

  it("lets only service_role execute the façades", async () => {
    for (const facade of facades) {
      expect(
        await one<boolean>(`select has_function_privilege('anon', $1, 'execute')`, [facade]),
        facade,
      ).toBe(false);
      expect(
        await one<boolean>(`select has_function_privilege('authenticated', $1, 'execute')`, [
          facade,
        ]),
        facade,
      ).toBe(false);
      expect(
        await one<boolean>(`select has_function_privilege('service_role', $1, 'execute')`, [
          facade,
        ]),
        facade,
      ).toBe(true);
    }
    for (const table of ["deals_current", "deal_stage_changes", "deal_syncs"]) {
      expect(
        await one<boolean>(`select has_table_privilege('service_role', $1, 'select')`, [
          `observer.${table}`,
        ]),
        table,
      ).toBe(false);
    }
  });
});
