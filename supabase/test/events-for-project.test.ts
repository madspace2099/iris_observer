import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  applyMigrations,
  closeSuiteDatabases,
  closeTestDatabases,
  openDatabase,
} from "./support/pglite";

/**
 * THE DOOR THE DASHBOARD READS EVENTS THROUGH, ASKED OF POSTGRES ITSELF.
 *
 * `observer_events_for_project` returns what a showroom recorded about real
 * meetings: which units, which agent, which pseudonymous visitor. It is a
 * `security definer` function in `public`, which is the schema PostgREST serves,
 * so the only thing between a browser holding the anon key and that data is the
 * grant. The adapter test proves the function answers; this proves who may ask.
 *
 * It also holds the migration to the promise its own header makes: it can be
 * applied over itself, and over its first draft, because the local control plane
 * re-applies every migration on every start and a desk that ran the draft must
 * still start.
 */

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

const BEFORE = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
];
const MIGRATION = "20260917100000_observer_events_for_project.sql";
const DOOR = "public.observer_events_for_project(text, uuid, text, integer)";

let db: PGlite;

async function one<T>(query: string, params: readonly unknown[] = []): Promise<T | undefined> {
  const result = await db.query<{ value: T }>(query, [...params]);
  return result.rows[0]?.value;
}

beforeAll(async () => {
  db = await openDatabase("suite", "hosted");
  await applyMigrations(db, [...BEFORE, MIGRATION]);
});

describe("who may read a project's events", () => {
  it("refuses both browser roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      expect(
        await one<boolean>(`select has_function_privilege($1, $2, 'execute') as value`, [
          role,
          DOOR,
        ]),
        role,
      ).toBe(false);
    }
  });

  it("refuses PUBLIC, which is what a role nobody thought of inherits", async () => {
    expect(
      await one<boolean>(`select has_function_privilege('public', $1, 'execute') as value`, [DOOR]),
    ).toBe(false);
  });

  it("admits the service role, and only through the function", async () => {
    expect(
      await one<boolean>(`select has_function_privilege('service_role', $1, 'execute') as value`, [
        DOOR,
      ]),
    ).toBe(true);
    expect(
      await one<boolean>(
        `select has_table_privilege('service_role', 'observer.analytics_events', 'select') as value`,
      ),
      "the table itself stays closed; the facade is the door",
    ).toBe(false);
  });

  it("runs as the ingestion owner with an empty search path", async () => {
    const row = await db.query<{ owner: string; definer: boolean; config: string[] | null }>(
      `select r.rolname as owner, p.prosecdef as definer, p.proconfig as config
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         join pg_roles r on r.oid = p.proowner
        where n.nspname = 'public' and p.proname = 'observer_events_for_project'`,
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]?.owner).toBe("observer_ingest_owner");
    expect(row.rows[0]?.definer).toBe(true);
    expect(row.rows[0]?.config ?? []).toContain('search_path=""');
  });
});

describe("the migration can be applied again", () => {
  /*
   * Through the window, as on the host: the file recreates its façade and hands it to the ingest
   * owner, which needs CREATE on `public` at that moment. With the window closed the host
   * refuses; `docs/18-deployment.md` says open, apply, close, check — every time.
   */
  it("over itself, as the local control plane does on every start", async () => {
    await expect(applyMigrations(db, [MIGRATION])).resolves.toBeUndefined();
    await expect(applyMigrations(db, [MIGRATION])).resolves.toBeUndefined();
    expect(
      await one<boolean>(`select has_function_privilege('anon', $1, 'execute') as value`, [DOOR]),
      "and the grants are re-stated each time, not left to the dropped function",
    ).toBe(false);
  });

  it("over its first draft, whose return type `create or replace` could not have changed", async () => {
    const draft = await openDatabase("test", "hosted");
    await applyMigrations(draft, BEFORE);
    /* The draft's shape: same arguments, thirteen columns, no cursor. */
    await draft.exec(`
      create function public.observer_events_for_project(
        p_account text, p_project uuid, p_since text, p_limit integer
      ) returns table (event_id uuid)
      language sql security definer set search_path = ''
      as $$ select e.event_id from observer.analytics_events e limit 0 $$;
    `);
    await expect(applyMigrations(draft, [MIGRATION])).resolves.toBeUndefined();
    const columns = await draft.query<{ value: string }>(
      `select pg_get_function_result(p.oid) as value
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'observer_events_for_project'`,
    );
    expect(columns.rows[0]?.value).toContain("page_cursor text");
  });
});
