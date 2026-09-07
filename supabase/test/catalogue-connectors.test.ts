import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ProjectIdSchema, TenantIdSchema, type CatalogueUnit } from "@observer/contracts";
import {
  dbCatalogueStore,
  memoryCatalogueStore,
  runCatalogueSync,
  sqlCatalogueDb,
} from "@observer/connectors";

import { closeSuiteDatabases, closeTestDatabases, openDatabase } from "./support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE CATALOGUE STORE, EXECUTED.
 *
 * The migration is run verbatim against a real Postgres, then asked the
 * questions a reviewer would: does a project resolve only through its own
 * account, is the change log genuinely append-only, does a stale credential
 * write lose to a newer one, and can a browser role reach any of it.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../migrations");
const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260907100000_observer_catalogue_and_connectors.sql",
];

const ACCOUNT_A = "acct_alpha";
const ACCOUNT_B = "acct_beta";

let db: PGlite;
let projectA: string;
let projectB: string;

beforeAll(async () => {
  db = await openDatabase("suite");
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const file of FILES) await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
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

function unit(code: string, over: Partial<CatalogueUnit> = {}): CatalogueUnit {
  return {
    code,
    externalId: `ext-${code}`,
    building: "A",
    floor: 1,
    rooms: 2,
    layout: "2+kk",
    kitchen: "kitchenette",
    unitType: "flat",
    areas: { interiorSqm: 54.2, exteriorSqm: null, grossSqm: null },
    price: { withVat: 6050000, withoutVat: 5000000, currency: "CZK" },
    orientation: ["J"],
    status: "available",
    statusRaw: "0",
    availableFrom: null,
    updatedAt: null,
    ...over,
  };
}

const port = () => sqlCatalogueDb((sql, params) => db.query(sql, [...params]));

describe("connector configuration", () => {
  it("is written through the account and read back with no credential yet", async () => {
    const written = await port().connectorConfigSet(
      ACCOUNT_A,
      projectA,
      "realpad",
      {
        developerId: 3230279,
        projectId: 3356887,
        screenId: 2,
      },
      true,
    );
    expect(written).toBe(true);

    const rows = await port().connectorConfigs(ACCOUNT_A, projectA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      connector: "realpad",
      enabled: true,
      has_credential: false,
      credential_last_four: null,
      last_sync_outcome: null,
    });
    expect(rows[0]?.config).toEqual({ developerId: 3230279, projectId: 3356887, screenId: 2 });
  });

  it("does not find another account's project, and writes nothing to it", async () => {
    const written = await port().connectorConfigSet(ACCOUNT_A, projectB, "lomnio", {}, true);
    expect(written).toBe(false);
    expect(await port().connectorConfigs(ACCOUNT_B, projectB)).toEqual([]);
  });
});

describe("connector credentials", () => {
  const sealed = (revision: number, last: string) => ({
    keyVersion: "v1",
    nonce: "bm9uY2Vub25jZW5v",
    ciphertext: "Y2lwaGVydGV4dA==",
    authTag: "dGFnAAAAAAAAAAAAAAAA",
    lastFour: last,
    revision,
  });

  it("is written forward only: a stale revision loses, a newer one wins", async () => {
    expect(
      await port().connectorCredentialSet(ACCOUNT_A, projectA, "realpad", sealed(1, "abcd")),
    ).toBe(true);
    expect(
      await port().connectorCredentialSet(ACCOUNT_A, projectA, "realpad", sealed(1, "zzzz")),
    ).toBe(false);
    expect(
      await port().connectorCredentialSet(ACCOUNT_A, projectA, "realpad", sealed(2, "efgh")),
    ).toBe(true);

    const read = await port().connectorCredentialRead(ACCOUNT_A, projectA, "realpad");
    expect(read).toMatchObject({ key_version: "v1", revision: 2 });

    const configs = await port().connectorConfigs(ACCOUNT_A, projectA);
    expect(configs[0]).toMatchObject({ has_credential: true, credential_last_four: "efgh" });
  });

  it("is invisible to another account and removable by its own", async () => {
    expect(await port().connectorCredentialRead(ACCOUNT_B, projectA, "realpad")).toBeNull();
    expect(await port().connectorCredentialRemove(ACCOUNT_B, projectA, "realpad")).toBe(false);
    expect(await port().connectorCredentialRemove(ACCOUNT_A, projectA, "realpad")).toBe(true);
    expect(await port().connectorCredentialRead(ACCOUNT_A, projectA, "realpad")).toBeNull();
  });
});

describe("the catalogue", () => {
  const scope = {
    tenantId: TenantIdSchema.parse("tnt_aabbccdd11"),
    projectId: ProjectIdSchema.parse("prj_istertower1"),
  };

  it("keeps the current snapshot and an append-only history through the sync loop", async () => {
    const store = dbCatalogueStore(port(), ACCOUNT_A, projectA);

    const first = await runCatalogueSync(
      async () => ({
        ok: true,
        snapshot: {
          ...scope,
          connector: "realpad",
          fetchedAt: "2026-09-07T10:00:00.000+00:00",
          units: [unit("A-101"), unit("A-102")],
        },
      }),
      store,
      scope,
      "realpad",
    );
    if (!first.ok) throw new Error(first.detail);
    expect(first.changes.map((c) => c.kind)).toEqual(["added", "added"]);

    const second = await runCatalogueSync(
      async () => ({
        ok: true,
        snapshot: {
          ...scope,
          connector: "realpad",
          fetchedAt: "2026-09-07T11:00:00.000+00:00",
          units: [
            unit("A-101", { status: "reserved", statusRaw: "2" }),
            unit("A-201", { floor: 2 }),
          ],
        },
      }),
      store,
      scope,
      "realpad",
    );
    if (!second.ok) throw new Error(second.detail);
    expect(second.changes.map((c) => [c.code, c.kind])).toEqual([
      ["A-101", "changed"],
      ["A-102", "withdrawn"],
      ["A-201", "added"],
    ]);

    const current = await port().catalogueCurrent(ACCOUNT_A, projectA, "realpad");
    expect(current.map((r) => r.code)).toEqual(["A-101", "A-201"]);
    expect((current[0]?.unit as CatalogueUnit).status).toBe("reserved");

    const withdrawn = await one<string | null>(
      `select withdrawn_at::text from observer.catalogue_units where project_id = $1 and code = 'A-102'`,
      [projectA],
    );
    expect(withdrawn).not.toBeNull();

    const changes = await port().catalogueChanges(ACCOUNT_A, projectA, 10);
    expect(changes).toHaveLength(5);
    expect(changes[0]).toMatchObject({ connector: "realpad", kind: "added", code: "A-201" });
    expect(changes.find((c) => c.kind === "changed")?.changed_fields).toEqual([
      "status",
      "statusRaw",
    ]);
  });

  it("refuses to rewrite or erase history", async () => {
    await expect(
      db.query(`update observer.catalogue_changes set kind = 'added' where kind = 'withdrawn'`),
    ).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from observer.catalogue_changes`)).rejects.toThrow(/append-only/);
  });

  it("writes nothing for a project the account does not own", async () => {
    const applied = await port().catalogueApply(
      ACCOUNT_B,
      projectA,
      "realpad",
      "2026-09-07T12:00:00.000+00:00",
      [unit("X-1")],
      [{ code: "X-1", kind: "added", changedFields: [], before: null, after: unit("X-1") }],
    );
    expect(applied).toBeNull();
    expect(
      (await port().catalogueCurrent(ACCOUNT_A, projectA, "realpad")).map((r) => r.code),
    ).toEqual(["A-101", "A-201"]);
  });

  it("agrees with the in-memory store about what a sync produces", async () => {
    const memory = memoryCatalogueStore();
    const fetch = async () => ({
      ok: true as const,
      snapshot: {
        ...scope,
        connector: "csv" as const,
        fetchedAt: "2026-09-07T13:00:00.000+00:00",
        units: [unit("C-1"), unit("C-2")],
      },
    });
    const viaMemory = await runCatalogueSync(fetch, memory, scope, "csv");
    const viaSql = await runCatalogueSync(
      fetch,
      dbCatalogueStore(port(), ACCOUNT_A, projectA),
      scope,
      "csv",
    );
    if (!viaMemory.ok || !viaSql.ok) throw new Error("expected reports");
    expect(viaSql.changes).toEqual(viaMemory.changes);
  });
});

describe("sync attempts", () => {
  it("records refused attempts too, and the configuration reports the last one", async () => {
    const id = await port().catalogueSyncRecord(ACCOUNT_A, projectA, "realpad", {
      outcome: "unauthorised",
      fetched: 0,
      added: 0,
      changed: 0,
      withdrawn: 0,
      unknownStatuses: [],
      retryAfterSeconds: null,
      detail: "The connector's credential was refused.",
    });
    expect(id).not.toBeNull();

    const configs = await port().connectorConfigs(ACCOUNT_A, projectA);
    expect(configs.find((c) => c.connector === "realpad")).toMatchObject({
      last_sync_outcome: "unauthorised",
      last_sync_fetched: 0,
      last_sync_detail: "The connector's credential was refused.",
    });
    expect(configs[0]?.last_sync_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("is not written for another account's project", async () => {
    expect(
      await port().catalogueSyncRecord(ACCOUNT_B, projectA, "realpad", {
        outcome: "ok",
        fetched: 1,
        added: 1,
        changed: 0,
        withdrawn: 0,
        unknownStatuses: [],
        retryAfterSeconds: null,
        detail: "",
      }),
    ).toBeNull();
  });
});

describe("who can reach it", () => {
  const facades = [
    "public.observer_connector_config_set(text, uuid, text, jsonb, boolean)",
    "public.observer_connector_configs(text, uuid)",
    "public.observer_connector_credential_set(text, uuid, text, text, text, text, text, text, bigint)",
    "public.observer_connector_credential_read(text, uuid, text)",
    "public.observer_connector_credential_remove(text, uuid, text)",
    "public.observer_catalogue_apply(text, uuid, text, timestamptz, jsonb, jsonb)",
    "public.observer_catalogue_current(text, uuid, text)",
    "public.observer_catalogue_changes(text, uuid, integer)",
    "public.observer_catalogue_sync_record(text, uuid, text, text, integer, integer, integer, integer, jsonb, integer, text)",
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
  });

  it("gives no role a privilege on any table", async () => {
    for (const table of [
      "observer.connector_configs",
      "observer.connector_credentials",
      "observer.catalogue_units",
      "observer.catalogue_changes",
      "observer.catalogue_syncs",
    ]) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        expect(
          await one<boolean>(`select has_table_privilege($1, $2, 'select')`, [role, table]),
          `${role} on ${table}`,
        ).toBe(false);
      }
      expect(
        await one<boolean>(`select relrowsecurity from pg_class where oid = $1::regclass`, [table]),
        table,
      ).toBe(true);
    }
  });
});
