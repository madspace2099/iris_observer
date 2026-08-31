import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { closeSuiteDatabases, closeTestDatabases, openDatabase } from "./support/pglite";

/*
 * CLOSE WHAT THE FIXTURE OPENS.
 *
 * The database below is a Postgres compiled to WASM, built once for the whole
 * file. Left open it keeps a live handle in the forked worker, the worker does
 * not exit on its own, and Vitest tears the pool down underneath it — which it
 * records as an unhandled error and an exit code of 1 while its own report is
 * already written and green. `supabase/test/worker-bound.test.ts` fails when a
 * suite that boots one of these does not register both hooks, which is how this
 * omission was found.
 */
afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE MODEL AND BUDGET TABLES, AND WHAT PostgreSQL SAYS ABOUT THEM.
 *
 * This runs the migration. It does not read it. Every assertion is the answer
 * PostgreSQL gives after execution — `has_table_privilege`, statements
 * attempted under `set role`, and the reservation arithmetic exercised for
 * real, including the concurrent case that is the entire reason the reserve is
 * one statement.
 *
 * What it still does not prove is that a hosted Supabase project matches. That
 * remains an open deployment prerequisite.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../migrations");
const CREDENTIALS = "20260829173000_observer_account_credentials.sql";
const MODELS = "20260830090000_observer_models_and_budget.sql";

const DOORS: readonly [string, string][] = [
  ["public.observer_usage_read", "text, text"],
  ["public.observer_usage_set_budget", "text, text, bigint"],
  [
    "public.observer_usage_reserve",
    "text, text, text, text, bigint, text, bigint, bigint, bigint, timestamptz",
  ],
  ["public.observer_usage_dispatch", "text, timestamptz"],
  ["public.observer_usage_settle", "text, bigint"],
  ["public.observer_usage_release", "text"],
  ["public.observer_usage_uncertain", "text"],
  ["public.observer_usage_expire", "timestamptz"],
  ["public.observer_preferences_read", "text"],
  ["public.observer_preferences_set_models", "text, text, text"],
  ["public.observer_preferences_record_availability", "text, text, text, timestamptz"],
];

const TABLES = [
  "observer.account_preferences",
  "observer.model_availability",
  "observer.usage_periods",
  "observer.usage_reservations",
];

const BROWSER_ROLES = ["anon", "authenticated"];

/** One dollar, in micro-dollars. The unit the whole ledger speaks. */
const DOLLAR = 1_000_000;

let db: PGlite;

beforeAll(async () => {
  db = await openDatabase("suite");
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  /* Both migrations, in order: this one widens the credential provider list. */
  await db.exec(readFileSync(join(MIGRATIONS, CREDENTIALS), "utf8"));
  await db.exec(readFileSync(join(MIGRATIONS, MODELS), "utf8"));
});

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  const row = result.rows[0];
  if (row === undefined) throw new Error(`no row from: ${sql}`);
  return Object.values(row)[0] as T;
}

async function asService<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.exec("set role service_role");
  try {
    const result = await db.query<T>(sql, params);
    return result.rows;
  } finally {
    await db.exec("reset role");
  }
}

async function attempt(role: string, sql: string): Promise<string | null> {
  await db.exec(`set role ${role}`);
  try {
    await db.query(sql);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    await db.exec("reset role");
  }
}

async function usage(account: string, period: string) {
  const rows = await asService<{
    budget_micros: string;
    spent_micros: string;
    reserved_micros: string;
    uncertain_micros: string;
    requests: number;
  }>(`select * from public.observer_usage_read($1, $2)`, [account, period]);
  const row = rows[0];
  return {
    budget: Number(row?.budget_micros ?? 0),
    spent: Number(row?.spent_micros ?? 0),
    reserved: Number(row?.reserved_micros ?? 0),
    uncertain: Number(row?.uncertain_micros ?? 0),
    requests: Number(row?.requests ?? 0),
  };
}

/**
 * Takes a hold, with the rates it was priced at.
 *
 * The three rate arguments are Terra's published figures. They are passed
 * rather than looked up because that is the contract: the row records what the
 * money was computed with, so a later price change cannot rewrite it.
 */
async function reserve(id: string, account: string, period: string, micros: number) {
  const rows = await asService<{ outcome: string }>(
    `select * from public.observer_usage_reserve($1, $2, $3, 'gpt-5.6-terra', $4, 'v1',
        2000000, 200000, 12000000, (now() + interval '10 minutes'))`,
    [id, account, period, micros],
  );
  return rows[0]?.outcome ?? "unknown";
}

/** Marks a hold as sent. Everything after this is charged, not refunded. */
async function dispatch(id: string) {
  const rows = await asService<{ observer_usage_dispatch: string }>(
    `select public.observer_usage_dispatch($1, now())`,
    [id],
  );
  return rows[0]?.observer_usage_dispatch ?? "unknown";
}

async function release(id: string) {
  const rows = await asService<{ observer_usage_release: string }>(
    `select public.observer_usage_release($1)`,
    [id],
  );
  return rows[0]?.observer_usage_release ?? "unknown";
}

async function markUncertain(id: string) {
  const rows = await asService<{ observer_usage_uncertain: string }>(
    `select public.observer_usage_uncertain($1)`,
    [id],
  );
  return rows[0]?.observer_usage_uncertain ?? "unknown";
}

describe("the migration executes", () => {
  it("creates four tables owned by the private role", async () => {
    for (const table of TABLES) {
      const [schema, name] = table.split(".");
      const owner = await one<string>(
        `select pg_catalog.pg_get_userbyid(c.relowner)
           from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1 and c.relname = $2`,
        [schema, name],
      );
      expect(owner, table).toBe("observer_budget_owner");
    }
  });

  it("gives every function an empty search_path and a private owner", async () => {
    for (const [name, args] of DOORS) {
      const row = await db.query<{ proconfig: string[] | null; owner: string }>(
        `select p.proconfig, pg_catalog.pg_get_userbyid(p.proowner) as owner
           from pg_catalog.pg_proc p
          where p.oid = ($1 || '(' || $2 || ')')::regprocedure`,
        [name, args],
      );
      expect(row.rows[0]?.proconfig ?? [], name).toContain('search_path=""');
      expect(row.rows[0]?.owner, name).toBe("observer_budget_owner");
    }
  });

  it("offers one provider, and names it", async () => {
    /*
     * An earlier draft widened this to five vendors whose figures nobody had
     * checked. The constraint is a LIST rather than free text so a typo cannot
     * create a credential nothing can read — and the list has one member,
     * because one is how many vendors have been verified.
     */
    const definition = await one<string>(
      `select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint
        where conname = 'account_credentials_provider_known'`,
    );
    expect(definition).toContain("openai");
    for (const gone of ["anthropic", "xai", "alibaba", "moonshot"]) {
      expect(definition, gone).not.toContain(gone);
    }
  });

  it("refuses a provider that is not in the list", async () => {
    await expect(
      db.query(
        `insert into observer.account_credentials
           (account_id, provider, key_version, nonce, ciphertext, auth_tag, last_four)
         values ('acct_x', 'not-a-provider', 'v1', 'n', 'c', 't', 'wxyz')`,
      ),
    ).rejects.toThrow(/provider_known/i);
  });
});

describe("browser roles hold nothing", () => {
  it("has no privilege on any of the four tables", async () => {
    for (const role of BROWSER_ROLES) {
      for (const table of TABLES) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          const held = await one<boolean>(`select pg_catalog.has_table_privilege($1, $2, $3)`, [
            role,
            table,
            privilege,
          ]);
          expect(held, `${role} ${privilege} ${table}`).toBe(false);
        }
      }
    }
  });

  it("cannot execute a single one of the functions", async () => {
    for (const role of BROWSER_ROLES) {
      for (const [name, args] of DOORS) {
        const held = await one<boolean>(
          `select pg_catalog.has_function_privilege($1, $2 || '(' || $3 || ')', 'EXECUTE')`,
          [role, name, args],
        );
        expect(held, `${role} may execute ${name}`).toBe(false);
      }
    }
  });

  it("is refused when it actually tries", async () => {
    for (const role of BROWSER_ROLES) {
      expect(await attempt(role, `select * from observer.usage_periods`), role).toMatch(
        /permission denied|does not exist/i,
      );
      expect(
        await attempt(role, `select public.observer_usage_read('acct_x', '2026-08')`),
        role,
      ).toMatch(/permission denied/i);
      expect(
        await attempt(role, `update observer.usage_periods set budget_micros = 999999999`),
        role,
      ).toMatch(/permission denied|does not exist/i);
    }
  });

  it("leaves the backend role with functions and no tables", async () => {
    for (const [name, args] of DOORS) {
      const held = await one<boolean>(
        `select pg_catalog.has_function_privilege('service_role', $1 || '(' || $2 || ')', 'EXECUTE')`,
        [name, args],
      );
      expect(held, name).toBe(true);
    }
    for (const table of TABLES) {
      const held = await one<boolean>(
        `select pg_catalog.has_table_privilege('service_role', $1, 'SELECT')`,
        [table],
      );
      expect(held, table).toBe(false);
    }
  });
});

describe("the ledger's arithmetic", () => {
  it("refuses to reserve when no budget is set", async () => {
    expect(await reserve("r-nobudget", "acct_none", "2026-08", 1000)).toBe("no_budget");
  });

  it("reserves, settles for less, and returns the headroom", async () => {
    await asService(`select public.observer_usage_set_budget('acct_a', '2026-08', $1)`, [
      10 * DOLLAR,
    ]);

    expect(await reserve("r-1", "acct_a", "2026-08", 3 * DOLLAR)).toBe("reserved");
    let now = await usage("acct_a", "2026-08");
    expect(now.reserved).toBe(3 * DOLLAR);
    expect(now.spent).toBe(0);

    /* The answer cost a third of the estimate. */
    await asService(`select public.observer_usage_settle('r-1', $1)`, [DOLLAR]);
    now = await usage("acct_a", "2026-08");
    expect(now.reserved, "the hold is gone").toBe(0);
    expect(now.spent, "and only what it cost is charged").toBe(DOLLAR);
    expect(now.requests).toBe(1);
  });

  it("charges nothing for a released reservation", async () => {
    expect(await reserve("r-2", "acct_a", "2026-08", 2 * DOLLAR)).toBe("reserved");
    await asService(`select public.observer_usage_release('r-2')`);

    const now = await usage("acct_a", "2026-08");
    expect(now.reserved).toBe(0);
    expect(now.spent, "a failed request is not billed").toBe(DOLLAR);
  });

  it("settles and releases idempotently", async () => {
    /* A retry must not charge twice. Both are no-ops the second time. */
    await asService(`select public.observer_usage_settle('r-1', $1)`, [DOLLAR]);
    await asService(`select public.observer_usage_release('r-2')`);

    const now = await usage("acct_a", "2026-08");
    expect(now.spent).toBe(DOLLAR);
    expect(now.requests).toBe(1);
  });

  it("stops at the ceiling rather than past it", async () => {
    await asService(`select public.observer_usage_set_budget('acct_b', '2026-08', $1)`, [
      5 * DOLLAR,
    ]);

    expect(await reserve("b-1", "acct_b", "2026-08", 4 * DOLLAR)).toBe("reserved");
    /* Two more dollars would be six against a ceiling of five. */
    expect(await reserve("b-2", "acct_b", "2026-08", 2 * DOLLAR)).toBe("exhausted");
    /* One more fits exactly, and exactly is allowed. */
    expect(await reserve("b-3", "acct_b", "2026-08", DOLLAR)).toBe("reserved");
    expect(await reserve("b-4", "acct_b", "2026-08", 1)).toBe("exhausted");

    const now = await usage("acct_b", "2026-08");
    expect(now.reserved).toBe(5 * DOLLAR);
  });

  it("holds the line under concurrent reservations", async () => {
    /*
     * THE REASON THE RESERVE IS ONE STATEMENT.
     *
     * Twenty requests, each wanting a tenth of the budget, all issued without
     * awaiting one another. Exactly ten may succeed. A check followed by a
     * separate insert would let most of them through, and the account would end
     * the month having spent twice what it agreed to.
     */
    await asService(`select public.observer_usage_set_budget('acct_c', '2026-08', $1)`, [
      10 * DOLLAR,
    ]);

    const outcomes = await Promise.all(
      Array.from({ length: 20 }, (_, i) => reserve(`c-${i}`, "acct_c", "2026-08", DOLLAR)),
    );

    expect(outcomes.filter((o) => o === "reserved")).toHaveLength(10);
    expect(outcomes.filter((o) => o === "exhausted")).toHaveLength(10);

    const now = await usage("acct_c", "2026-08");
    expect(now.reserved, "never a micro-dollar over").toBe(10 * DOLLAR);
  });

  it("reclaims a hold nobody settled", async () => {
    await asService(`select public.observer_usage_set_budget('acct_d', '2026-08', $1)`, [
      5 * DOLLAR,
    ]);
    await asService(
      `select public.observer_usage_reserve('d-1', 'acct_d', '2026-08', 'gpt-5.6-terra',
         $1, 'v1', 2000000, 200000, 12000000, (now() - interval '1 minute'))`,
      [2 * DOLLAR],
    );
    expect((await usage("acct_d", "2026-08")).reserved).toBe(2 * DOLLAR);

    const reclaimed = await asService<{ observer_usage_expire: number }>(
      `select public.observer_usage_expire(now())`,
    );
    expect(Number(reclaimed[0]?.observer_usage_expire ?? 0)).toBeGreaterThanOrEqual(1);
    expect((await usage("acct_d", "2026-08")).reserved).toBe(0);
  });

  it("carries the ceiling into a new month and starts the spending at zero", async () => {
    /* The rollover. September inherits August's ceiling, not August's spending. */
    await asService(`select public.observer_usage_set_budget('acct_e', '2026-08', $1)`, [
      7 * DOLLAR,
    ]);
    await asService(
      `select public.observer_usage_reserve('e-1', 'acct_e', '2026-08',
      'gpt-5.6-terra', $1, 'v1', 2000000, 200000, 12000000, (now() + interval '10 minutes'))`,
      [3 * DOLLAR],
    );
    await asService(`select public.observer_usage_settle('e-1', $1)`, [3 * DOLLAR]);

    expect(await reserve("e-2", "acct_e", "2026-09", DOLLAR)).toBe("reserved");

    const september = await usage("acct_e", "2026-09");
    expect(september.budget, "the ceiling carries").toBe(7 * DOLLAR);
    expect(september.spent, "the spending does not").toBe(0);

    const august = await usage("acct_e", "2026-08");
    expect(august.spent, "and August is left alone").toBe(3 * DOLLAR);
  });

  it("shows the carried ceiling on the first of the month, before anything is asked", async () => {
    /*
     * The rollover as a READER meets it.
     *
     * The case above reaches September by reserving, which creates the row and
     * carries the ceiling on the way. A reader who simply opens the settings
     * page on the first of the month reaches it through `observer_usage_read`
     * with no row to read — and that door used to answer "no budget set" while
     * the other door was still honouring twenty dollars.
     */
    await asService(`select public.observer_usage_set_budget('acct_f', '2026-08', $1)`, [
      20 * DOLLAR,
    ]);

    const september = await usage("acct_f", "2026-09");
    expect(september.budget, "the ceiling the reader chose").toBe(20 * DOLLAR);
    expect(september.spent).toBe(0);
    expect(september.reserved).toBe(0);
    expect(september.requests).toBe(0);
  });

  it("reports zero for an account that has never set anything", async () => {
    const nothing = await usage("acct_unknown", "2026-08");
    expect(nothing.budget).toBe(0);
    expect(nothing.spent).toBe(0);
  });

  it("keeps one account's ledger out of another's", async () => {
    const a = await usage("acct_a", "2026-08");
    const b = await usage("acct_b", "2026-08");
    expect(a.budget).toBe(10 * DOLLAR);
    expect(b.budget).toBe(5 * DOLLAR);
    expect(a.spent).not.toBe(b.spent);
  });
});

describe("a dispatched request is never refunded", () => {
  /*
   * THE INVARIANT THIS WHOLE LIFECYCLE EXISTS FOR.
   *
   * A request that failed before it was sent cost nothing, and keeping its hold
   * would be taking money for nothing. A request that WAS sent and then vanished
   * may have run to completion at the vendor and been billed there, and handing
   * the hold back would tell a reader they have money they have already spent.
   *
   * From inside a `catch` block the two look identical. The ledger records
   * which one happened instead of guessing, and these cases prove it does.
   */

  it("releases a hold that was never dispatched, in full", async () => {
    await asService(`select public.observer_usage_set_budget('acct_r', '2026-08', $1)`, [
      10 * DOLLAR,
    ]);
    expect(await reserve("r-1", "acct_r", "2026-08", 3 * DOLLAR)).toBe("reserved");
    expect((await usage("acct_r", "2026-08")).reserved).toBe(3 * DOLLAR);

    expect(await release("r-1")).toBe("released");

    const after = await usage("acct_r", "2026-08");
    expect(after.reserved, "the hold is gone").toBe(0);
    expect(after.spent, "and nothing was charged").toBe(0);
    expect(after.uncertain).toBe(0);
  });

  it("refuses to release a dispatched hold, and says why", async () => {
    await asService(`select public.observer_usage_set_budget('acct_s', '2026-08', $1)`, [
      10 * DOLLAR,
    ]);
    await reserve("s-1", "acct_s", "2026-08", 4 * DOLLAR);
    expect(await dispatch("s-1")).toBe("dispatched");

    /* The application asks for a refund. The ledger declines, and explains. */
    expect(await release("s-1")).toBe("dispatched");

    const after = await usage("acct_s", "2026-08");
    expect(after.reserved, "still held, not given back").toBe(4 * DOLLAR);
    expect(after.spent).toBe(0);
  });

  it("charges a dispatched hold whose outcome never came back", async () => {
    await asService(`select public.observer_usage_set_budget('acct_t', '2026-08', $1)`, [
      10 * DOLLAR,
    ]);
    await reserve("t-1", "acct_t", "2026-08", 4 * DOLLAR);
    await dispatch("t-1");

    expect(await markUncertain("t-1")).toBe("uncertain");

    const after = await usage("acct_t", "2026-08");
    expect(after.reserved, "no longer merely held").toBe(0);
    expect(after.spent, "charged in full").toBe(4 * DOLLAR);
    expect(after.uncertain, "and flagged as unconfirmed").toBe(4 * DOLLAR);
  });

  it("corrects an uncertain charge when the real cost is finally known", async () => {
    await asService(`select public.observer_usage_set_budget('acct_u', '2026-08', $1)`, [
      10 * DOLLAR,
    ]);
    await reserve("u-1", "acct_u", "2026-08", 4 * DOLLAR);
    await dispatch("u-1");
    await markUncertain("u-1");

    /* Somebody reconciles the vendor's invoice: it was one dollar, not four. */
    await asService(`select public.observer_usage_settle('u-1', $1)`, [DOLLAR]);

    const after = await usage("acct_u", "2026-08");
    expect(after.spent, "corrected, not charged twice").toBe(DOLLAR);
    expect(after.uncertain, "and no longer unconfirmed").toBe(0);
    expect(after.requests).toBe(1);
  });

  it("expiry refunds what was never sent and charges what was", async () => {
    await asService(`select public.observer_usage_set_budget('acct_v', '2026-08', $1)`, [
      20 * DOLLAR,
    ]);

    /* Two holds, both stale. One left; one did not. */
    await asService(
      `select public.observer_usage_reserve('v-sent', 'acct_v', '2026-08', 'gpt-5.6-terra',
         $1, 'v1', 2000000, 200000, 12000000, (now() - interval '1 minute'))`,
      [3 * DOLLAR],
    );
    await asService(
      `select public.observer_usage_reserve('v-idle', 'acct_v', '2026-08', 'gpt-5.6-terra',
         $1, 'v1', 2000000, 200000, 12000000, (now() - interval '1 minute'))`,
      [2 * DOLLAR],
    );
    await dispatch("v-sent");

    const reclaimed = await asService<{ observer_usage_expire: number }>(
      `select public.observer_usage_expire(now())`,
    );
    expect(Number(reclaimed[0]?.observer_usage_expire ?? 0)).toBe(2);

    const after = await usage("acct_v", "2026-08");
    expect(after.reserved, "both holds resolved").toBe(0);
    expect(after.spent, "only the one that was sent is charged").toBe(3 * DOLLAR);
    expect(after.uncertain).toBe(3 * DOLLAR);
  });

  it("cannot dispatch a hold that no longer exists", async () => {
    expect(await dispatch("nothing-here"), "and the caller must send nothing").toBe("unknown");
  });
});

describe("every entry carries the rates it was priced with", () => {
  it("stores the three rates and the catalogue version on the row", async () => {
    await asService(`select public.observer_usage_set_budget('acct_w', '2026-08', $1)`, [
      10 * DOLLAR,
    ]);
    await reserve("w-1", "acct_w", "2026-08", DOLLAR);

    /*
     * Read as the OWNER, not as service_role.
     *
     * `service_role` holds nothing on these tables by design — it reaches them
     * only through the definer functions — so asking it to select from one
     * fails with "permission denied", which is the privilege model working.
     * The assertion is about what was stored, so it goes in the front door.
     */
    const result = await db.query<{
      catalogue_version: string;
      input_rate_micros: string;
      cached_input_rate_micros: string;
      output_rate_micros: string;
      status: string;
    }>(`select * from observer.usage_reservations where id = 'w-1'`);

    const row = result.rows[0];
    expect(row?.catalogue_version).toBe("v1");
    expect(Number(row?.input_rate_micros)).toBe(2_000_000);
    expect(Number(row?.cached_input_rate_micros)).toBe(200_000);
    expect(Number(row?.output_rate_micros)).toBe(12_000_000);
    expect(row?.status).toBe("reserved");
  });

  it("refuses a status the design does not name", async () => {
    /*
     * Two constraints stand between an invented status and the table: the list
     * itself, and the rule that only a reserved row may have no dispatch time.
     * Either refusing is the point — what must not happen is a row whose state
     * nothing in the application knows how to resolve.
     */
    await expect(
      db.query(`update observer.usage_reservations set status = 'invented' where id = 'w-1'`),
    ).rejects.toThrow(/usage_reservations/);
  });
});

describe("preferences", () => {
  it("stores a default and a deep model per account", async () => {
    await asService(
      `select public.observer_preferences_set_models('acct_p', 'gpt-5.6-luna', 'claude-opus-5-max')`,
    );
    const rows = await asService<{ default_model: string; deep_model: string }>(
      `select * from public.observer_preferences_read('acct_p')`,
    );
    expect(rows[0]?.default_model).toBe("gpt-5.6-luna");
    expect(rows[0]?.deep_model).toBe("claude-opus-5-max");
  });

  it("records what a provider said about a model, per account", async () => {
    await asService(
      `select public.observer_preferences_record_availability('acct_p', 'grok-4.6-high', 'unavailable', now())`,
    );
    const rows = await asService<{ availability: { model: string; state: string }[] }>(
      `select * from public.observer_preferences_read('acct_p')`,
    );
    const availability = rows[0]?.availability ?? [];
    expect(availability).toHaveLength(1);
    expect(availability[0]?.model).toBe("grok-4.6-high");
    expect(availability[0]?.state).toBe("unavailable");

    /* And it belongs to that account alone. */
    const other = await asService<{ availability: unknown[] }>(
      `select * from public.observer_preferences_read('acct_q')`,
    );
    expect(other).toHaveLength(0);
  });
});
