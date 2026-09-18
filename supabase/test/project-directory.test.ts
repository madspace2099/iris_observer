import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { closeSuiteDatabases, closeTestDatabases, openDatabase } from "./support/pglite";

/**
 * THE PROJECT DIRECTORY, ASKED OF POSTGRES ITSELF.
 *
 * Three things here are decided by the database and by nothing above it, so
 * they are asked of the database:
 *
 *   - who may call the eleven doors, because they live in `public`, the schema
 *     PostgREST serves, and one of the tables holds people's names;
 *   - that a project's developer and address cannot be changed once set, which
 *     is a trigger and not a convention;
 *   - that the file can be applied over itself, because the local control plane
 *     applies every migration at every start.
 */

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

const MIGRATIONS = resolve(import.meta.dirname, "../migrations");
const BEFORE = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
];
const MIGRATION = "20260918100000_observer_project_directory.sql";

const DOORS = [
  "public.observer_tenant_create(text, text, text)",
  "public.observer_tenants_for_account(text)",
  "public.observer_project_settings_set(text, uuid, uuid, text, text, text, text)",
  "public.observer_project_directory(text)",
  "public.observer_project_viewer_grant(text, uuid, text, text)",
  "public.observer_project_viewer_revoke(text, uuid, text, text)",
  "public.observer_project_viewers(text, uuid)",
  "public.observer_projects_for_viewer(text, text)",
  "public.observer_project_agent_name_set(text, uuid, text, text)",
  "public.observer_project_agents(text, uuid)",
  "public.observer_source_agents_report(uuid, jsonb)",
];
const TABLES = ["observer.tenants", "observer.project_viewers", "observer.project_agents"];

const ESTATE = "acct_estate_one";
const OTHER = "acct_estate_two";

const sql = (name: string): string => readFileSync(join(MIGRATIONS, name), "utf8");

let db: PGlite;

async function one<T>(query: string, params: readonly unknown[] = []): Promise<T | undefined> {
  const result = await db.query<{ value: T }>(query, [...params]);
  return result.rows[0]?.value;
}

async function project(account: string, name: string, slug: string | null): Promise<string> {
  return (await one<string>(`select public.observer_project_create($1, $2, $3) as value`, [
    account,
    name,
    slug,
  ])) as string;
}

async function tenant(account: string, name: string, slug: string): Promise<string> {
  return (await one<string>(`select public.observer_tenant_create($1, $2, $3) as value`, [
    account,
    name,
    slug,
  ])) as string;
}

function settle(
  account: string,
  projectId: string,
  tenantId: string,
  slug: string,
  zone = "Europe/Bratislava",
): Promise<boolean | undefined> {
  return one<boolean>(
    `select public.observer_project_settings_set($1, $2, $3, $4, 'EUR', 'sk-SK', $5) as value`,
    [account, projectId, tenantId, slug, zone],
  );
}

beforeAll(async () => {
  db = await openDatabase("suite");
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const name of BEFORE) await db.exec(sql(name));
  await db.exec(sql(MIGRATION));
});

describe("who may use the directory's doors", () => {
  it("refuses both browser roles and PUBLIC on every one of them", async () => {
    for (const door of DOORS) {
      for (const role of ["anon", "authenticated", "public"]) {
        expect(
          await one<boolean>(`select has_function_privilege($1, $2, 'execute') as value`, [
            role,
            door,
          ]),
          `${role} on ${door}`,
        ).toBe(false);
      }
    }
  });

  it("admits the service role through the doors and never to the tables", async () => {
    for (const door of DOORS) {
      expect(
        await one<boolean>(
          `select has_function_privilege('service_role', $1, 'execute') as value`,
          [door],
        ),
        door,
      ).toBe(true);
    }
    for (const table of TABLES) {
      expect(
        await one<boolean>(`select has_table_privilege('service_role', $1, 'select') as value`, [
          table,
        ]),
        table,
      ).toBe(false);
    }
  });

  it("runs every door as the ingestion owner with an empty search path", async () => {
    const rows = await db.query<{
      name: string;
      owner: string;
      definer: boolean;
      config: string[];
    }>(
      `select p.proname as name, r.rolname as owner, p.prosecdef as definer, p.proconfig as config
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         join pg_roles r on r.oid = p.proowner
        where n.nspname = 'public'
          and p.proname in (${DOORS.map((d) => `'${d.slice("public.".length, d.indexOf("("))}'`).join(", ")})`,
    );
    expect(rows.rows).toHaveLength(DOORS.length);
    for (const row of rows.rows) {
      expect(row.owner, row.name).toBe("observer_ingest_owner");
      expect(row.definer, row.name).toBe(true);
      expect(row.config ?? [], row.name).toContain('search_path=""');
    }
  });

  it("has row level security on, with no policy, on all three tables", async () => {
    for (const table of TABLES) {
      const [schema, name] = table.split(".");
      expect(
        await one<boolean>(
          `select c.relrowsecurity as value from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = $1 and c.relname = $2`,
          [schema, name],
        ),
        table,
      ).toBe(true);
      expect(
        await one<number>(
          `select count(*)::int as value from pg_policies where schemaname = $1 and tablename = $2`,
          [schema, name],
        ),
        table,
      ).toBe(0);
    }
  });
});

describe("a developer's slug", () => {
  it("is refused when it is a word the application routes", async () => {
    for (const word of ["madspace", "api", "functions", "sign-in"]) {
      await expect(tenant(ESTATE, "Reserved", word), word).rejects.toThrow();
    }
  });

  it("is refused when it is not an address", async () => {
    for (const bad of ["Upper", "two words", "-leading", "trailing-", ""]) {
      await expect(tenant(ESTATE, "Bad", bad), JSON.stringify(bad)).rejects.toThrow();
    }
  });

  it("is unique across every estate, because it is the first segment of an address", async () => {
    await tenant(ESTATE, "Alder Homes", "alder-homes");
    await expect(tenant(OTHER, "Alder Homes of elsewhere", "alder-homes")).rejects.toThrow();
  });
});

describe("a project's developer and address", () => {
  it("are set once, and then only the settings may change", async () => {
    const developer = await tenant(ESTATE, "Birch Estates", "birch-estates");
    const rival = await tenant(ESTATE, "Cedar Estates", "cedar-estates");
    const id = await project(ESTATE, "Birch Court", null);

    expect(await settle(ESTATE, id, developer, "birch-court")).toBe(true);

    expect(await settle(ESTATE, id, rival, "birch-court"), "another developer").toBe(false);
    expect(await settle(ESTATE, id, developer, "birch-yard"), "another address").toBe(false);
    expect(
      await settle(ESTATE, id, developer, "birch-court", "Europe/Vienna"),
      "the same developer and address, a new time zone",
    ).toBe(true);

    const rows = await db.query<{ tenant_slug: string; slug: string; time_zone: string }>(
      `select tenant_slug, slug, time_zone from public.observer_project_directory($1)
        where project_id = $2`,
      [ESTATE, id],
    );
    expect(rows.rows[0]).toEqual({
      tenant_slug: "birch-estates",
      slug: "birch-court",
      time_zone: "Europe/Vienna",
    });
  });

  it("cannot be changed by going round the door either", async () => {
    const developer = await tenant(ESTATE, "Dogwood", "dogwood");
    const id = await project(ESTATE, "Dogwood Row", null);
    expect(await settle(ESTATE, id, developer, "dogwood-row")).toBe(true);

    await expect(
      db.query(`update observer.projects set slug = 'elsewhere' where project_id = $1`, [id]),
    ).rejects.toThrow(/keeps its address/);
    await expect(
      db.query(`update observer.projects set tenant_id = null where project_id = $1`, [id]),
    ).rejects.toThrow(/may not move between developers/);
  });

  it("refuses a developer of another estate", async () => {
    const theirs = await tenant(OTHER, "Elm of elsewhere", "elm-elsewhere");
    const id = await project(ESTATE, "Elm Walk", null);
    expect(await settle(ESTATE, id, theirs, "elm-walk")).toBe(false);
  });

  it("refuses an address that is not one, in words", async () => {
    const developer = await tenant(ESTATE, "Fir", "fir");
    const id = await project(ESTATE, "Fir Lane", null);
    await expect(settle(ESTATE, id, developer, "Fir Lane")).rejects.toThrow(/lowercase/);
  });

  it("reports a project without its settings as it is, with nulls", async () => {
    const id = await project(ESTATE, "Not ready yet", null);
    const rows = await db.query<{ tenant_id: string | null; currency: string | null }>(
      `select tenant_id, currency from public.observer_project_directory($1) where project_id = $2`,
      [ESTATE, id],
    );
    expect(rows.rows[0]).toEqual({ tenant_id: null, currency: null });
  });
});

describe("who may view a project", () => {
  it("grants once, revokes by stamping, and can grant again", async () => {
    const id = await project(ESTATE, "Granted", null);
    const grant = (): Promise<boolean | undefined> =>
      one<boolean>(`select public.observer_project_viewer_grant($1, $2, $3, $4) as value`, [
        ESTATE,
        id,
        "acct_petra",
        "acct_admin",
      ]);
    const revoke = (): Promise<boolean | undefined> =>
      one<boolean>(`select public.observer_project_viewer_revoke($1, $2, $3, $4) as value`, [
        ESTATE,
        id,
        "acct_petra",
        "acct_admin",
      ]);

    expect(await grant()).toBe(true);
    expect(await grant(), "a second grant is the same grant").toBe(true);
    expect(
      await one<number>(
        `select count(*)::int as value from public.observer_project_viewers($1, $2)`,
        [ESTATE, id],
      ),
    ).toBe(1);

    expect(await revoke()).toBe(true);
    expect(await revoke(), "nothing left to revoke").toBe(false);
    expect(
      await one<number>(
        `select count(*)::int as value from public.observer_projects_for_viewer($1, $2)`,
        [ESTATE, "acct_petra"],
      ),
    ).toBe(0);

    expect(await grant()).toBe(true);
    expect(
      await one<number>(
        `select count(*)::int as value from observer.project_viewers where project_id = $1`,
        [id],
      ),
      "the revoked grant is kept beside the new one",
    ).toBe(2);
  });

  it("does not grant on another estate's project", async () => {
    const theirs = await project(OTHER, "Theirs", null);
    expect(
      await one<boolean>(`select public.observer_project_viewer_grant($1, $2, $3, $4) as value`, [
        ESTATE,
        theirs,
        "acct_petra",
        "acct_admin",
      ]),
    ).toBe(false);
  });
});

describe("the names of the people who present", () => {
  async function source(account: string, projectId: string): Promise<string> {
    return (await one<string>(
      `select public.observer_source_create($1, $2, 'showroom_ue5', 'production', 'PC') as value`,
      [account, projectId],
    )) as string;
  }

  const report = (sourceId: string, agents: unknown): Promise<number | undefined> =>
    one<number>(`select public.observer_source_agents_report($1, $2::jsonb) as value`, [
      sourceId,
      JSON.stringify(agents),
    ]);

  it("takes a showroom's roster, and lets administration's word stand over it", async () => {
    const id = await project(ESTATE, "Named", null);
    const pc = await source(ESTATE, id);

    expect(
      await report(pc, [
        { agent_id: "AG-1", display_name: "Monika Kovacova" },
        { agent_id: "AG-2", display_name: "Tomas Varga" },
        { agent_id: "AG-2", display_name: "Tomas Varga again" },
      ]),
      "the repeated one is taken once",
    ).toBe(2);

    expect(
      await one<boolean>(
        `select public.observer_project_agent_name_set($1, $2, 'AG-1', 'Monika Kováčová') as value`,
        [ESTATE, id],
      ),
    ).toBe(true);

    expect(
      await report(pc, [{ agent_id: "AG-1", display_name: "monika" }]),
      "a showroom does not overwrite administration",
    ).toBe(0);

    const rows = await db.query<{ agent_ref: string; display_name: string; named_by: string }>(
      `select agent_ref, display_name, named_by from public.observer_project_agents($1, $2)
        order by agent_ref`,
      [ESTATE, id],
    );
    expect(rows.rows).toEqual([
      { agent_ref: "AG-1", display_name: "Monika Kováčová", named_by: "administration" },
      { agent_ref: "AG-2", display_name: "Tomas Varga", named_by: "showroom" },
    ]);
  });

  it("withdraws a name, and no roster may put it back", async () => {
    const id = await project(ESTATE, "Withdrawn", null);
    const pc = await source(ESTATE, id);
    await report(pc, [{ agent_id: "AG-1", display_name: "Monika Kovacova" }]);

    expect(
      await one<boolean>(
        `select public.observer_project_agent_name_set($1, $2, 'AG-1', null) as value`,
        [ESTATE, id],
      ),
    ).toBe(true);

    const withdrawn = await db.query<{ display_name: string | null; named_by: string }>(
      `select display_name, named_by from public.observer_project_agents($1, $2)`,
      [ESTATE, id],
    );
    expect(withdrawn.rows).toEqual([{ display_name: null, named_by: "withdrawn" }]);

    expect(
      await report(pc, [{ agent_id: "AG-1", display_name: "Monika Kovacova" }]),
      "a withdrawn name is not a showroom's to refill",
      /* The row is kept for exactly this: a deleted one would come back on the next report. */
    ).toBe(0);
    expect(
      (
        await db.query<{ display_name: string | null }>(
          `select display_name from public.observer_project_agents($1, $2)`,
          [ESTATE, id],
        )
      ).rows,
    ).toEqual([{ display_name: null }]);

    expect(
      await one<boolean>(
        `select public.observer_project_agent_name_set($1, $2, 'AG-1', 'Monika Kováčová') as value`,
        [ESTATE, id],
      ),
      "administration can name again after withdrawing",
    ).toBe(true);
    expect(
      (
        await db.query<{ display_name: string | null; named_by: string }>(
          `select display_name, named_by from public.observer_project_agents($1, $2)`,
          [ESTATE, id],
        )
      ).rows,
    ).toEqual([{ display_name: "Monika Kováčová", named_by: "administration" }]);
  });

  it("refuses a withdrawn row that holds a name, and a named row that holds none", async () => {
    const id = await project(ESTATE, "Shapes", null);
    const insert = (name: string | null, namedBy: string): Promise<unknown> =>
      db.query(
        `insert into observer.project_agents (project_id, account_id, agent_ref, display_name, named_by)
         values ($1, $2, $3, $4, $5)`,
        [id, ESTATE, `AG-${namedBy}-${String(name)}`, name, namedBy],
      );
    await expect(insert("Monika", "withdrawn")).rejects.toThrow(/withdrawn_holds_no_name/);
    await expect(insert(null, "administration")).rejects.toThrow(/withdrawn_holds_no_name/);
    await expect(insert("Monika", "nobody")).rejects.toThrow(/named_by_known/);
  });

  it("lists a presenter nobody has named, with a null name and a meeting count", async () => {
    const id = await project(ESTATE, "Unnamed", null);
    const pc = await source(ESTATE, id);
    await db.query(
      `insert into observer.analytics_events
         (source_id, account_id, project_id, event_id, event_name, schema_version, occurred_at,
          session_id, sequence, app_version, app_plugin, app_build_id, app_environment, agent_id)
       values ($1, $2, $3, gen_random_uuid(), 'session.started', 1, now(),
               gen_random_uuid(), 1, '1', '1', 'b', 'production', 'AG-9')`,
      [pc, ESTATE, id],
    );
    const rows = await db.query<{
      agent_ref: string;
      display_name: string | null;
      session_count: number | string;
    }>(
      `select agent_ref, display_name, session_count from public.observer_project_agents($1, $2)`,
      [ESTATE, id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.agent_ref).toBe("AG-9");
    expect(rows.rows[0]?.display_name).toBeNull();
    expect(Number(rows.rows[0]?.session_count)).toBe(1);
  });

  it("takes nothing from a source that is not active", async () => {
    const id = await project(ESTATE, "Suspended", null);
    const pc = await source(ESTATE, id);
    await one(`select public.observer_source_set_state($1, $2, 'suspended') as value`, [
      ESTATE,
      pc,
    ]);
    expect(await report(pc, [{ agent_id: "AG-1", display_name: "Somebody" }])).toBe(0);
  });
});

describe("the migration can be applied again", () => {
  it("over itself, twice, keeping what it holds and restating its grants", async () => {
    const developer = await tenant(ESTATE, "Kept", "kept");
    await expect(db.exec(sql(MIGRATION))).resolves.toBeDefined();
    await expect(db.exec(sql(MIGRATION))).resolves.toBeDefined();
    expect(
      await one<number>(
        `select count(*)::int as value from observer.tenants where tenant_id = $1`,
        [developer],
      ),
    ).toBe(1);
    for (const door of DOORS) {
      expect(
        await one<boolean>(`select has_function_privilege('anon', $1, 'execute') as value`, [door]),
        door,
      ).toBe(false);
    }
  });
});
