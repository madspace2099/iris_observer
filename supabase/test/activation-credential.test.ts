import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ACTIVATION_CODE_PEPPER,
  SOURCE_TOKEN_PEPPER,
  issueActivationCode,
  issueSourceToken,
  parseToken,
  type EnvSource,
  type IssuedSecret,
} from "@observer/sources";

import { closeSuiteDatabases, closeTestDatabases, openDatabase } from "./support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * ACTIVATION AND CREDENTIALS, PROVED AGAINST REAL POSTGRESQL.
 *
 * ## The property everything else serves
 *
 * **A code is exchanged exactly once, and the exchange is one statement.** Every
 * other assertion here — expiry, revocation, the wrong verifier, the suspended
 * source, the supersede — is a way that property could be lost.
 *
 * The verifiers below are real: `@observer/sources` computes them with real
 * HMACs under two obviously-fake test peppers, so what the database stores is
 * what the application would store. A test that inserted `'verifier'` as a
 * literal would prove the SQL and nothing about the join between the two.
 *
 * ## What PGlite cannot do, said plainly
 *
 * It is a single connection, so two genuinely simultaneous consumes cannot be
 * issued and `Promise.all` against one handle serialises. That is documented at
 * `audit-contract.test.ts:319` and it is not worked around here — the
 * concurrency claim is proved in the two ways that are honest: the statement's
 * shape is asserted from `pg_get_functiondef`, and repeated attempts are shown
 * to yield exactly one success and one credential.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../migrations");
const SPINE = "20260902090000_observer_source_identity_spine.sql";
const ACTIVATION = "20260902093000_observer_activation_and_credentials.sql";

const DOORS: readonly [string, string][] = [
  ["public.observer_activation_issue", "text, uuid, text, text, text, timestamptz"],
  ["public.observer_activation_consume", "text, text, text, text, timestamptz"],
  ["public.observer_credential_resolve", "text"],
  ["public.observer_credential_revoke", "text, uuid"],
  ["public.observer_credential_status", "text, uuid"],
];

const TABLES = [
  "observer.activation_codes",
  "observer.source_credentials",
  "observer.source_audit",
];
const BROWSER_ROLES = ["anon", "authenticated"];
const OWNER = "observer_ingest_owner";

const ACCOUNT_A = "acct_northgate";
const ACCOUNT_B = "acct_riverside";

/** Obviously fake, obviously long, and distinct. A deployment refuses both. */
const ENV: EnvSource = {
  VITEST: "1",
  [ACTIVATION_CODE_PEPPER]: "activation-pepper-0123456789abcdefghijklmnop",
  [SOURCE_TOKEN_PEPPER]: "source-token-pepper-0123456789abcdefghijklmnop",
};

let db: PGlite;

beforeAll(async () => {
  db = await openDatabase("suite");
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  await db.exec(readFileSync(join(MIGRATIONS, SPINE), "utf8"));
  await db.exec(readFileSync(join(MIGRATIONS, ACTIVATION), "utf8"));
});

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  const row = result.rows[0];
  if (row === undefined) throw new Error(`no row from: ${sql}`);
  return Object.values(row)[0] as T;
}

async function asRole(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  await db.exec(`set role ${role}`);
  try {
    await db.query(sql, params);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    await db.exec("reset role");
  }
}

/** A project and an active source, created through the spine's doors. */
async function makeSource(account: string, label: string): Promise<string> {
  const project = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
    account,
    `P ${label}`,
    null,
  ]);
  return one<string>(`select public.observer_source_create($1, $2, $3, $4, $5)`, [
    account,
    project,
    "showroom_ue5",
    "production",
    label,
  ]);
}

const HOUR_AHEAD = () => new Date(Date.now() + 3_600_000).toISOString();

/** Issue a code and keep the plaintext, exactly as the service would. */
async function issueCode(
  account: string,
  source: string,
  purpose: "activation" | "reactivation" = "activation",
  expiresAt: string = HOUR_AHEAD(),
): Promise<IssuedSecret> {
  const code = issueActivationCode(ENV);
  const ok = await one<boolean>(`select public.observer_activation_issue($1, $2, $3, $4, $5, $6)`, [
    account,
    source,
    code.selector,
    code.verifier,
    purpose,
    expiresAt,
  ]);
  if (!ok) throw new Error("the code was not issued");
  return code;
}

interface ConsumeResult {
  readonly rows: number;
  readonly sourceId: string | null;
  readonly accountId: string | null;
  readonly purpose: string | null;
  readonly token: IssuedSecret;
}

/** Exchange a code, minting a fresh token exactly as the endpoint would. */
async function consume(code: IssuedSecret): Promise<ConsumeResult> {
  const token = issueSourceToken(ENV);
  const parsed = parseToken(code.plaintext);
  const result = await db.query<{
    source_id: string;
    account_id: string;
    purpose: string;
  }>(`select * from public.observer_activation_consume($1, $2, $3, $4, $5)`, [
    code.selector,
    /* The verifier the application recomputes from what the client presented. */
    verifierOf(code, parsed?.secret ?? ""),
    token.selector,
    token.verifier,
    null,
  ]);
  const row = result.rows[0];
  return {
    rows: result.rows.length,
    sourceId: row?.source_id ?? null,
    accountId: row?.account_id ?? null,
    purpose: row?.purpose ?? null,
    token,
  };
}

/**
 * What the application would compute for a presented secret.
 *
 * The happy path is simply the issued verifier; a test that wants to present
 * the wrong secret substitutes a different one.
 */
function verifierOf(issued: IssuedSecret, presentedSecret: string): string {
  const own = parseToken(issued.plaintext)?.secret ?? "";
  return presentedSecret === own ? issued.verifier : "0".repeat(64);
}

describe("the migration executes", () => {
  it("owns all three tables with the ingest role", async () => {
    for (const table of TABLES) {
      const [schema, name] = table.split(".");
      const owner = await one<string>(
        `select pg_catalog.pg_get_userbyid(c.relowner)
           from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1 and c.relname = $2`,
        [schema, name],
      );
      expect(owner, table).toBe(OWNER);
    }
  });

  it("gives every door an empty search_path and definer rights", async () => {
    for (const [name, args] of DOORS) {
      const row = await db.query<{ proconfig: string[] | null; prosecdef: boolean }>(
        `select p.proconfig, p.prosecdef from pg_catalog.pg_proc p
          where p.oid = ($1 || '(' || $2 || ')')::regprocedure`,
        [name, args],
      );
      expect(row.rows[0]?.proconfig, name).toEqual(['search_path=""']);
      expect(row.rows[0]?.prosecdef, name).toBe(true);
    }
  });

  it("enables RLS and writes no policy", async () => {
    for (const table of TABLES) {
      const [schema, name] = table.split(".");
      const enabled = await one<boolean>(
        `select c.relrowsecurity from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1 and c.relname = $2`,
        [schema, name],
      );
      expect(enabled, table).toBe(true);
    }
    expect(
      await one<string>(
        `select count(*)::text from pg_catalog.pg_policies where schemaname = 'observer'`,
      ),
    ).toBe("0");
  });

  it("keeps the browser roles out, by catalogue and by attempt", async () => {
    for (const role of BROWSER_ROLES) {
      for (const table of TABLES) {
        expect(
          await one<boolean>(`select pg_catalog.has_table_privilege($1, $2, 'SELECT')`, [
            role,
            table,
          ]),
          `${role} ${table}`,
        ).toBe(false);
      }
      expect(await asRole(role, `select * from observer.source_credentials limit 1`), role).toMatch(
        /permission denied/i,
      );
    }
  });

  it("lets service_role knock and nothing more", async () => {
    for (const table of TABLES) {
      expect(
        await one<boolean>(`select pg_catalog.has_table_privilege('service_role', $1, 'SELECT')`, [
          table,
        ]),
        table,
      ).toBe(false);
    }
    for (const [name, args] of DOORS) {
      expect(
        await one<boolean>(
          `select pg_catalog.has_function_privilege('service_role', $1 || '(' || $2 || ')', 'EXECUTE')`,
          [name, args],
        ),
        name,
      ).toBe(true);
    }
  });
});

describe("a code is exchanged exactly once", () => {
  it("mints a credential and returns the identity the code names", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 1");
    const code = await issueCode(ACCOUNT_A, source);

    const result = await consume(code);
    expect(result.rows).toBe(1);
    expect(result.sourceId).toBe(source);
    expect(result.accountId).toBe(ACCOUNT_A);
    expect(result.purpose).toBe("activation");

    const credentials = await one<string>(
      `select count(*)::text from observer.source_credentials where source_id = $1 and state = 'active'`,
      [source],
    );
    expect(credentials).toBe("1");
  });

  it("refuses the second exchange of the same code", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 2");
    const code = await issueCode(ACCOUNT_A, source);

    expect((await consume(code)).rows).toBe(1);
    const replay = await consume(code);
    expect(replay.rows, "the code is spent").toBe(0);

    const active = await one<string>(
      `select count(*)::text from observer.source_credentials where source_id = $1 and state = 'active'`,
      [source],
    );
    expect(active, "exactly one credential was minted").toBe("1");
  });

  it("yields exactly one success across many sequential attempts", async () => {
    /*
     * The honest version of the concurrency proof. PGlite is one connection, so
     * this is not twenty-five simultaneous callers — it is twenty-five attempts
     * at a code that only the first may spend, which is the invariant the
     * single-statement guard exists to hold. The atomicity itself is asserted
     * from the function's own definition below.
     */
    const source = await makeSource(ACCOUNT_A, "PC 3");
    const code = await issueCode(ACCOUNT_A, source);

    const outcomes = await Promise.all(Array.from({ length: 25 }, () => consume(code)));
    expect(outcomes.filter((o) => o.rows === 1)).toHaveLength(1);
    expect(outcomes.filter((o) => o.rows === 0)).toHaveLength(24);

    expect(
      await one<string>(
        `select count(*)::text from observer.source_credentials where source_id = $1`,
        [source],
      ),
      "no orphan credential from the twenty-four that failed",
    ).toBe("1");
    expect(
      await one<string>(`select state from observer.activation_codes where source_id = $1`, [
        source,
      ]),
    ).toBe("consumed");
    expect(
      await one<string>(
        `select count(*)::text from observer.source_audit where source_id = $1 and action = 'credential_issued'`,
        [source],
      ),
      "one credential, one audit row",
    ).toBe("1");
  });

  it("decides and writes in one statement, which is why the above holds", async () => {
    /*
     * Asserted from the function's own text rather than from behaviour, because
     * behaviour on a single connection cannot distinguish an atomic guard from
     * a read-then-write that happened not to interleave. The guard clauses must
     * be part of the UPDATE.
     */
    const body = await one<string>(`select pg_catalog.pg_get_functiondef($1::regprocedure)`, [
      "public.observer_activation_consume(text, text, text, text, timestamptz)",
    ]);
    const update = /update observer\.activation_codes[\s\S]*?returning/i.exec(body)?.[0] ?? "";
    expect(update, "state is guarded inside the UPDATE").toMatch(/state\s*=\s*'issued'/i);
    expect(update, "expiry is guarded inside the UPDATE").toMatch(/expires_at\s*>/i);
    expect(update, "the verifier is compared inside the UPDATE").toMatch(/verifier\s*=/i);
  });
});

describe("a code that cannot be used", () => {
  it("refuses an expired one", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 4");
    const code = await issueCode(
      ACCOUNT_A,
      source,
      "activation",
      new Date(Date.now() - 1000).toISOString(),
    );
    expect((await consume(code)).rows).toBe(0);
  });

  it("refuses a revoked one", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 5");
    const code = await issueCode(ACCOUNT_A, source);
    await db.query(
      `update observer.activation_codes set state = 'revoked', revoked_at = now() where selector = $1`,
      [code.selector],
    );
    expect((await consume(code)).rows).toBe(0);
  });

  it("refuses the right selector with the wrong secret", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 6");
    const code = await issueCode(ACCOUNT_A, source);

    const token = issueSourceToken(ENV);
    const wrong = await db.query(
      `select * from public.observer_activation_consume($1, $2, $3, $4, $5)`,
      [code.selector, "0".repeat(64), token.selector, token.verifier, null],
    );
    expect(wrong.rows.length).toBe(0);

    expect(
      await one<string>(`select state from observer.activation_codes where selector = $1`, [
        code.selector,
      ]),
      "a wrong secret must not burn the code",
    ).toBe("issued");
  });

  it("refuses a selector that never existed", async () => {
    const token = issueSourceToken(ENV);
    const answer = await db.query(
      `select * from public.observer_activation_consume($1, $2, $3, $4, $5)`,
      ["no-such-selector-at-all", "0".repeat(64), token.selector, token.verifier, null],
    );
    expect(answer.rows.length).toBe(0);
  });

  it("spends a code presented against a suspended source, and mints nothing", async () => {
    /*
     * Deliberate, and the reasoning is worth keeping: the code is consumed even
     * though no credential is issued. Leaving it live would let whoever holds a
     * stolen code poll until an operator happens to resume the source.
     */
    const source = await makeSource(ACCOUNT_A, "PC 7");
    const code = await issueCode(ACCOUNT_A, source);
    await one<boolean>(`select public.observer_source_set_state($1, $2, $3)`, [
      ACCOUNT_A,
      source,
      "suspended",
    ]);

    const result = await consume(code);
    expect(result.rows, "no identity is returned").toBe(0);
    expect(
      await one<string>(`select state from observer.activation_codes where selector = $1`, [
        code.selector,
      ]),
      "and the code is spent",
    ).toBe("consumed");
    expect(
      await one<string>(
        `select count(*)::text from observer.source_credentials where source_id = $1`,
        [source],
      ),
    ).toBe("0");
  });
});

describe("issuing a code is scoped to the account that owns the source", () => {
  it("refuses to issue against another account's source", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 8");
    const code = issueActivationCode(ENV);
    const issued = await one<boolean>(
      `select public.observer_activation_issue($1, $2, $3, $4, $5, $6)`,
      [ACCOUNT_B, source, code.selector, code.verifier, "activation", HOUR_AHEAD()],
    );
    expect(issued).toBe(false);
    expect(
      await one<string>(
        `select count(*)::text from observer.activation_codes where selector = $1`,
        [code.selector],
      ),
    ).toBe("0");
  });

  it("refuses to issue against an archived source", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 9");
    await one<boolean>(`select public.observer_source_set_state($1, $2, $3)`, [
      ACCOUNT_A,
      source,
      "archived",
    ]);
    const code = issueActivationCode(ENV);
    expect(
      await one<boolean>(`select public.observer_activation_issue($1, $2, $3, $4, $5, $6)`, [
        ACCOUNT_A,
        source,
        code.selector,
        code.verifier,
        "activation",
        HOUR_AHEAD(),
      ]),
    ).toBe(false);
  });
});

describe("reactivation preserves the source and supersedes the credential", () => {
  it("keeps source_id, supersedes the old credential, and leaves one active", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 10");
    const first = await consume(await issueCode(ACCOUNT_A, source));
    expect(first.rows).toBe(1);

    const second = await consume(await issueCode(ACCOUNT_A, source, "reactivation"));
    expect(second.rows).toBe(1);
    expect(second.sourceId, "the source identity survives rotation").toBe(source);
    expect(second.purpose).toBe("reactivation");

    const states = await db.query<{ state: string; selector: string }>(
      `select state, selector from observer.source_credentials where source_id = $1 order by created_at`,
      [source],
    );
    expect(states.rows.map((r) => r.state)).toEqual(["superseded", "active"]);
    expect(states.rows[0]?.selector).toBe(first.token.selector);
    expect(states.rows[1]?.selector).toBe(second.token.selector);
  });

  it("allows only one active credential per source, by index", async () => {
    /*
     * The supersede above is what the function does. This is what the database
     * would refuse if a future path forgot to — enforcement rather than care.
     */
    const source = await makeSource(ACCOUNT_A, "PC 11");
    await consume(await issueCode(ACCOUNT_A, source));
    const extra = issueSourceToken(ENV);
    await expect(
      db.query(
        `insert into observer.source_credentials (selector, verifier, source_id) values ($1, $2, $3)`,
        [extra.selector, extra.verifier, source],
      ),
    ).rejects.toThrow(/source_credentials_one_active/i);
  });
});

describe("resolving a presented credential", () => {
  it("returns the identity and both states, without filtering", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 12");
    const result = await consume(await issueCode(ACCOUNT_A, source));

    const rows = await db.query<{
      verifier: string;
      credential_state: string;
      source_state: string;
      account_id: string;
      source_id: string;
    }>(`select * from public.observer_credential_resolve($1)`, [result.token.selector]);

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.credential_state).toBe("active");
    expect(rows.rows[0]?.source_state).toBe("active");
    expect(rows.rows[0]?.account_id).toBe(ACCOUNT_A);
    expect(rows.rows[0]?.source_id).toBe(source);
    expect(rows.rows[0]?.verifier).toBe(result.token.verifier);
  });

  it("still returns a superseded credential, so 401 can be told from 403", async () => {
    /*
     * Filtering revoked or superseded rows here would collapse "your credential
     * was rotated" and "your source is suspended" into one empty result, and
     * the endpoint could no longer answer 401 and 403 differently.
     */
    const source = await makeSource(ACCOUNT_A, "PC 13");
    const first = await consume(await issueCode(ACCOUNT_A, source));
    await consume(await issueCode(ACCOUNT_A, source, "reactivation"));

    const rows = await db.query<{ credential_state: string }>(
      `select * from public.observer_credential_resolve($1)`,
      [first.token.selector],
    );
    expect(rows.rows[0]?.credential_state).toBe("superseded");
  });

  it("reports a suspended source beside an active credential", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 14");
    const result = await consume(await issueCode(ACCOUNT_A, source));
    await one<boolean>(`select public.observer_source_set_state($1, $2, $3)`, [
      ACCOUNT_A,
      source,
      "suspended",
    ]);

    const rows = await db.query<{ credential_state: string; source_state: string }>(
      `select * from public.observer_credential_resolve($1)`,
      [result.token.selector],
    );
    expect(rows.rows[0]?.credential_state).toBe("active");
    expect(rows.rows[0]?.source_state).toBe("suspended");
  });

  it("returns nothing for an unknown selector", async () => {
    const rows = await db.query(`select * from public.observer_credential_resolve($1)`, [
      "not-a-selector",
    ]);
    expect(rows.rows).toHaveLength(0);
  });
});

describe("revocation", () => {
  it("takes effect and is scoped to the owning account", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 15");
    const result = await consume(await issueCode(ACCOUNT_A, source));

    expect(
      await one<boolean>(`select public.observer_credential_revoke($1, $2)`, [ACCOUNT_B, source]),
      "another account may not revoke it",
    ).toBe(false);

    expect(
      await one<boolean>(`select public.observer_credential_revoke($1, $2)`, [ACCOUNT_A, source]),
    ).toBe(true);

    const rows = await db.query<{ credential_state: string }>(
      `select * from public.observer_credential_resolve($1)`,
      [result.token.selector],
    );
    expect(rows.rows[0]?.credential_state).toBe("revoked");
  });
});

describe("nothing anywhere holds recoverable secret material", () => {
  it("stores only selectors and fixed-width verifiers", async () => {
    const source = await makeSource(ACCOUNT_A, "PC 16");
    const code = await issueCode(ACCOUNT_A, source);
    const result = await consume(code);

    for (const [table, plaintext] of [
      ["observer.activation_codes", code.plaintext],
      ["observer.source_credentials", result.token.plaintext],
    ] as const) {
      const dump = await db.query<{ row: string }>(`select t::text as row from ${table} t`);
      const text = dump.rows.map((r) => r.row).join("\n");
      const secret = parseToken(plaintext)?.secret ?? "";
      expect(text, `${table} holds no plaintext`).not.toContain(plaintext);
      expect(text, `${table} holds no secret half`).not.toContain(secret);
    }
  });

  it("keeps every verifier a 64-character hex digest", async () => {
    const verifiers = await db.query<{ verifier: string }>(
      `select verifier from observer.activation_codes
       union all
       select verifier from observer.source_credentials`,
    );
    expect(verifiers.rows.length).toBeGreaterThan(0);
    for (const row of verifiers.rows) expect(row.verifier).toMatch(/^[0-9a-f]{64}$/);
  });

  it("writes an audit that carries no secret and a closed vocabulary", async () => {
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'observer' and table_name = 'source_audit'`,
    );
    const names = columns.rows.map((r) => r.column_name).sort();
    expect(names).toEqual(["account_id", "action", "at", "id", "source_id", "succeeded"]);
    expect(names, "no column could hold a code or a token").not.toContain("selector");
    expect(names).not.toContain("verifier");
  });
});
