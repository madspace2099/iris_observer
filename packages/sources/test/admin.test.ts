import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ACTIVATION_TTL_DEFAULT_SECONDS,
  ACTIVATION_TTL_MAX_SECONDS,
  ACTIVATION_TTL_MIN_SECONDS,
  observerAdmin,
  type AdminRefusal,
  type AdminResult,
  type IssuedActivation,
  type ObserverAdmin,
} from "../src/admin";
import {
  ACTIVATION_CODE_PEPPER,
  SOURCE_TOKEN_PEPPER,
  issueSourceToken,
  parseToken,
  verifySecret,
  type EnvSource,
} from "../src/secrets";
import { pgliteDb, type SqlQuery } from "../src/pglite";
import {
  closeSuiteDatabases,
  closeTestDatabases,
  openDatabase,
} from "../../../supabase/test/support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE OPERATOR SURFACE, AGAINST A REAL POSTGRES.
 *
 * ## Why this boots a database rather than a mocked `ObserverDb`
 *
 * Every interesting guarantee in `admin.ts` is a guarantee about SQL somebody
 * else wrote. That an archived source cannot be re-credentialled lives in
 * `observer_activation_issue`'s `state in ('active','suspended')`; that account
 * B cannot suspend account A's source lives in `observer_source_set_state`'s
 * account filter; that archival is terminal lives in a `state <> 'archived'`
 * clause. A stubbed port would let this file assert that the service returns
 * whatever the stub was told to return, which is a test of the stub.
 *
 * So the migrations are applied verbatim and the services are driven through
 * them. What is being proved is that the *pair* — this service and that SQL —
 * refuses the right things.
 *
 * ## The scoping assertions compare refusals, not booleans
 *
 * Several tests below assert `toEqual` between two refusals rather than
 * asserting both are failures. That is the actual requirement: a refusal that
 * says `unknown_source` for a stranger's id and `source_archived` for one's own
 * is an existence oracle, and a test that only checked `ok === false` would
 * pass the day somebody added the second code as a convenience.
 *
 * ## Every secret here is unmistakably synthetic
 *
 * The two peppers are English phrases with hyphens. They satisfy
 * `describePepper` only because `VITEST` is set, which is exactly the shape the
 * harness is meant to have and exactly what a deployment refuses.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../../../supabase/migrations");
const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
  "20260902120000_observer_instant_precision_and_ingest_mark.sql",
  "20260902130000_observer_credential_resolve_precision.sql",
];

const ACCOUNT_A = "acct_northgate";
const ACCOUNT_B = "acct_riverside";

const ENV: EnvSource = {
  VITEST: "1",
  [ACTIVATION_CODE_PEPPER]: "activation-pepper-for-the-admin-suite-only",
  [SOURCE_TOKEN_PEPPER]: "source-token-pepper-for-the-admin-suite-only",
};

/** A uuid that is canonical, absent from every table, and obviously a fixture. */
const NO_SUCH_SOURCE = "00000000-0000-4000-8000-00000000dead";
const NO_SUCH_PROJECT = "00000000-0000-4000-8000-00000000beef";

/** PGlite's type, without importing PGlite — see `pglite-adapter.test.ts`. */
type Database = Awaited<ReturnType<typeof openDatabase>>;

let pg: Database;
let admin: ObserverAdmin;

/**
 * The clock the services see. LIVE by default, pinned only where an assertion
 * needs it to be.
 *
 * The obvious arrangement — one fixed instant for the whole file — is what this
 * file started with, and it broke four tests in a way worth recording. The
 * service computes `expires_at` from THIS clock, and
 * `observer_activation_consume` compares that column against the DATABASE's
 * `now()`. Pin the service to 10:00 and every code it issues is stamped 10:15,
 * so `activate()` succeeds all morning and starts failing at a quarter past
 * ten — a fixture whose outcome depends on what time the suite is run.
 *
 * So the clock is real except inside {@link freezing}, which the two expiry
 * tests use and `afterEach` undoes. Those two never consume a code, so a stamp
 * Postgres considers stale costs them nothing.
 */
let frozen: Date | null = null;
const clock = (): Date => frozen ?? new Date();

/** Pin the service's clock for one assertion. Undone by `afterEach`. */
function freezing(instant: string): void {
  frozen = new Date(instant);
}

afterEach(() => {
  frozen = null;
});

beforeAll(async () => {
  pg = await openDatabase("suite");
  /* The Supabase roles the migrations revoke from and grant to; PGlite has none. */
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const name of FILES) await pg.exec(readFileSync(join(MIGRATIONS, name), "utf8"));

  const query: SqlQuery = (sql, params) => pg.query(sql, [...params]);
  admin = observerAdmin({ db: pgliteDb(query), env: ENV, now: clock });
});

/* --- reading results without losing the type ------------------------------------- */

function valueOf<T>(result: AdminResult<T>): T {
  if (!result.ok) throw new Error(`expected success, got refusal ${result.refusal.code}`);
  return result.value;
}

function refusalOf<T>(result: AdminResult<T>): AdminRefusal {
  if (result.ok) throw new Error("expected a refusal, got success");
  return result.refusal;
}

/* --- fixtures --------------------------------------------------------------------- */

let fixtures = 0;

async function makeProject(account: string): Promise<string> {
  fixtures += 1;
  return valueOf(
    await admin.createProject({
      account,
      name: `Riverside Quarter ${String(fixtures)}`,
      slug: `riverside-quarter-${String(fixtures)}`,
    }),
  );
}

async function makeSource(account: string, project?: string): Promise<string> {
  const owner = project ?? (await makeProject(account));
  fixtures += 1;
  return valueOf(
    await admin.createSource({
      account,
      project: owner,
      type: "showroom_ue5",
      environment: "production",
      label: `Marketing suite ${String(fixtures)}`,
    }),
  );
}

/** The stored HMAC for a selector. Compared against, never printed. */
async function storedVerifier(selector: string): Promise<string> {
  const result = await pg.query<{ verifier: string }>(
    `select verifier from observer.activation_codes where selector = $1`,
    [selector],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("no activation code was recorded for that selector");
  return row.verifier;
}

/**
 * Take a source all the way to an active credential.
 *
 * Deliberately goes through the real service and the real consume facade rather
 * than inserting a credential row: the reactivation and revoke tests are only
 * meaningful if the credential they act on was minted the way a plugin mints
 * one.
 */
async function activate(account: string, source: string): Promise<void> {
  const issued = valueOf(
    await admin.issueActivationCode({ account, source, purpose: "activation" }),
  );
  const parsed = parseToken(issued.plaintext);
  if (parsed === null) throw new Error("the issued code did not parse as a source token");

  const credential = issueSourceToken(ENV);
  const consumed = await pg.query(
    `select * from public.observer_activation_consume($1, $2, $3, $4, $5)`,
    [
      parsed.selector,
      await storedVerifier(parsed.selector),
      credential.selector,
      credential.verifier,
      null,
    ],
  );
  if (consumed.rows.length !== 1) throw new Error("the issued code would not consume");
}

async function stateOf(account: string, project: string, source: string): Promise<string> {
  const rows = valueOf(await admin.sourceStatus({ account, project }));
  const row = rows.find((candidate) => candidate.source_id === source);
  if (row === undefined) throw new Error("the source was not in its own account's status list");
  return row.state;
}

/* ================================================================= the tests */

describe("creating projects and sources", () => {
  it("returns the new project's identifier, which is a canonical uuid", async () => {
    const project = await makeProject(ACCOUNT_A);
    expect(project).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("creates a source under a project the account owns and lists it back", async () => {
    const project = await makeProject(ACCOUNT_A);
    const source = await makeSource(ACCOUNT_A, project);

    const rows = valueOf(await admin.sourceStatus({ account: ACCOUNT_A, project }));
    expect(rows.map((row) => row.source_id)).toEqual([source]);
    expect(rows[0]?.state).toBe("active");
    expect(rows[0]?.environment).toBe("production");
  });

  it("refuses to create a source under another account's project, as if it did not exist", async () => {
    const project = await makeProject(ACCOUNT_A);

    const stranger = refusalOf(
      await admin.createSource({
        account: ACCOUNT_B,
        project,
        type: "showroom_ue5",
        environment: "production",
        label: "A showroom account B does not own",
      }),
    );
    const absent = refusalOf(
      await admin.createSource({
        account: ACCOUNT_B,
        project: NO_SUCH_PROJECT,
        type: "showroom_ue5",
        environment: "production",
        label: "A showroom nobody owns",
      }),
    );

    expect(stranger).toEqual(absent);
    expect(stranger.code).toBe("unknown_project");
  });

  it("refuses a source type or environment outside the schema's vocabulary", async () => {
    const project = await makeProject(ACCOUNT_A);
    const base = { account: ACCOUNT_A, project, label: "Marketing suite" } as const;

    const badType = refusalOf(
      await admin.createSource({
        ...base,
        /* Cast because the point is a caller that is not type-checked. */
        type: "unreal_showroom" as never,
        environment: "production",
      }),
    );
    const badEnvironment = refusalOf(
      await admin.createSource({
        ...base,
        type: "showroom_ue5",
        environment: "prod" as never,
      }),
    );

    expect(badType).toEqual({ code: "invalid_input", field: "type" });
    expect(badEnvironment).toEqual({ code: "invalid_input", field: "environment" });
  });

  it("refuses a malformed project identifier without letting the value reach Postgres", async () => {
    const nonsense = "'; drop table observer.projects; --";
    const result = await admin.sourceStatus({ account: ACCOUNT_A, project: nonsense });

    expect(refusalOf(result)).toEqual({ code: "invalid_input", field: "project" });
    /*
     * The whole reason the uuid shape is checked here: Postgres answers a bad
     * uuid with `invalid input syntax for type uuid: "..."`, quoting the value
     * into an exception message that something will log.
     */
    expect(JSON.stringify(result)).not.toContain("drop table");
  });
});

describe("issuing an activation code", () => {
  it("returns the plaintext exactly once, and stores only a verifier that cannot produce it", async () => {
    const source = await makeSource(ACCOUNT_A);
    const issued = valueOf(
      await admin.issueActivationCode({ account: ACCOUNT_A, source, purpose: "activation" }),
    );

    const parsed = parseToken(issued.plaintext);
    expect(parsed).not.toBeNull();
    expect(parsed?.selector).toBe(issued.selector);

    const stored = await storedVerifier(issued.selector);
    expect(stored).not.toBe(issued.plaintext);
    expect(issued.plaintext).not.toContain(stored);
    /* The code the operator holds is the code the database will accept. */
    expect(
      verifySecret("activation_code", issued.selector, parsed?.secret ?? "", stored, ENV),
    ).toBe(true);
  });

  it("keeps the plaintext out of every later answer about the same source", async () => {
    const project = await makeProject(ACCOUNT_A);
    const source = await makeSource(ACCOUNT_A, project);
    const issued = valueOf(
      await admin.issueActivationCode({ account: ACCOUNT_A, source, purpose: "activation" }),
    );

    const status = await admin.sourceStatus({ account: ACCOUNT_A, project });
    const operations = await admin.sourceOperations({ account: ACCOUNT_A, project });
    const codes = await pg.query(`select * from observer.activation_codes`);
    const audit = await pg.query(`select * from observer.source_audit`);

    for (const answer of [status, operations, codes.rows, audit.rows]) {
      expect(JSON.stringify(answer)).not.toContain(issued.plaintext);
    }
  });

  it("omits the plaintext when the whole result is serialised, which is how it would leak", async () => {
    const source = await makeSource(ACCOUNT_A);
    const result = await admin.issueActivationCode({
      account: ACCOUNT_A,
      source,
      purpose: "activation",
    });
    const issued = valueOf(result);

    /* The accident this guards: `logger.info({ result })` in a server action. */
    expect(JSON.stringify(result)).not.toContain(issued.plaintext);
    expect(JSON.parse(JSON.stringify(issued)) as Record<string, unknown>).toEqual({
      selector: issued.selector,
      purpose: "activation",
      expiresAt: issued.expiresAt,
    });
    /* And the caller can still read it, because that is the one thing it is for. */
    expect(issued.plaintext.startsWith("obs.")).toBe(true);
  });

  it("expires the code fifteen minutes out by default", async () => {
    freezing("2026-09-02T10:00:00.000Z");
    const source = await makeSource(ACCOUNT_A);
    const issued = valueOf(
      await admin.issueActivationCode({ account: ACCOUNT_A, source, purpose: "activation" }),
    );

    expect(ACTIVATION_TTL_DEFAULT_SECONDS).toBe(900);
    expect(issued.expiresAt).toBe("2026-09-02T10:15:00.000Z");
  });

  it("honours a ttl inside the range and refuses one outside it rather than clamping", async () => {
    freezing("2026-09-02T10:00:00.000Z");
    const source = await makeSource(ACCOUNT_A);

    const short = valueOf(
      await admin.issueActivationCode({
        account: ACCOUNT_A,
        source,
        purpose: "activation",
        ttlSeconds: ACTIVATION_TTL_MIN_SECONDS,
      }),
    );
    expect(short.expiresAt).toBe("2026-09-02T10:01:00.000Z");

    for (const ttlSeconds of [
      ACTIVATION_TTL_MIN_SECONDS - 1,
      ACTIVATION_TTL_MAX_SECONDS + 1,
      0,
      -60,
      900.5,
    ]) {
      const refusal = refusalOf(
        await admin.issueActivationCode({
          account: ACCOUNT_A,
          source,
          purpose: "activation",
          ttlSeconds,
        }),
      );
      expect(refusal).toEqual({ code: "invalid_input", field: "ttlSeconds" });
    }
  });

  it("records the purpose the operator supplied, so a reactivation is legible later", async () => {
    const source = await makeSource(ACCOUNT_A);
    const issued = valueOf(
      await admin.issueActivationCode({ account: ACCOUNT_A, source, purpose: "reactivation" }),
    );

    const stored = await pg.query<{ purpose: string }>(
      `select purpose from observer.activation_codes where selector = $1`,
      [issued.selector],
    );
    expect(stored.rows[0]?.purpose).toBe("reactivation");
    expect(issued.purpose).toBe("reactivation");
  });

  it("issues a code for a source that already holds an active credential, which is how reactivation starts", async () => {
    const source = await makeSource(ACCOUNT_A);
    await activate(ACCOUNT_A, source);

    const active = await pg.query(
      `select 1 from observer.source_credentials where source_id = $1 and state = 'active'`,
      [source],
    );
    expect(active.rows).toHaveLength(1);

    const reissued = await admin.issueActivationCode({
      account: ACCOUNT_A,
      source,
      purpose: "reactivation",
    });
    expect(reissued.ok).toBe(true);
  });

  it("still issues a code for a suspended source, because resuming it is an operator action", async () => {
    const source = await makeSource(ACCOUNT_A);
    expect((await admin.suspendSource({ account: ACCOUNT_A, source })).ok).toBe(true);

    /*
     * The client comes back with a code after the operator resumes, so refusing
     * here would make suspension a one-way door while pretending otherwise.
     */
    const issued = await admin.issueActivationCode({
      account: ACCOUNT_A,
      source,
      purpose: "reactivation",
    });
    expect(issued.ok).toBe(true);
  });

  it("refuses a code for an archived source, indistinguishably from one that never existed", async () => {
    const source = await makeSource(ACCOUNT_A);
    expect((await admin.archiveSource({ account: ACCOUNT_A, source })).ok).toBe(true);

    const archived = refusalOf(
      await admin.issueActivationCode({ account: ACCOUNT_A, source, purpose: "reactivation" }),
    );
    const absent = refusalOf(
      await admin.issueActivationCode({
        account: ACCOUNT_A,
        source: NO_SUCH_SOURCE,
        purpose: "activation",
      }),
    );

    expect(archived).toEqual(absent);
    expect(archived.code).toBe("unknown_source");
    /* And nothing was written under the archived source's name. */
    const codes = await pg.query(`select 1 from observer.activation_codes where source_id = $1`, [
      source,
    ]);
    expect(codes.rows).toHaveLength(0);
  });
});

describe("suspending, resuming and archiving", () => {
  it("moves a source between active and suspended and back", async () => {
    const project = await makeProject(ACCOUNT_A);
    const source = await makeSource(ACCOUNT_A, project);

    expect(await stateOf(ACCOUNT_A, project, source)).toBe("active");
    expect((await admin.suspendSource({ account: ACCOUNT_A, source })).ok).toBe(true);
    expect(await stateOf(ACCOUNT_A, project, source)).toBe("suspended");
    expect((await admin.resumeSource({ account: ACCOUNT_A, source })).ok).toBe(true);
    expect(await stateOf(ACCOUNT_A, project, source)).toBe("active");
  });

  it("treats archival as terminal, refusing a later resume", async () => {
    const project = await makeProject(ACCOUNT_A);
    const source = await makeSource(ACCOUNT_A, project);

    expect((await admin.archiveSource({ account: ACCOUNT_A, source })).ok).toBe(true);
    expect(await stateOf(ACCOUNT_A, project, source)).toBe("archived");

    const resumed = refusalOf(await admin.resumeSource({ account: ACCOUNT_A, source }));
    expect(resumed.code).toBe("unknown_source");
    expect(await stateOf(ACCOUNT_A, project, source)).toBe("archived");
  });
});

describe("revoking a credential", () => {
  it("revokes the active credential and refuses a second attempt", async () => {
    const source = await makeSource(ACCOUNT_A);
    await activate(ACCOUNT_A, source);

    expect((await admin.revokeCredential({ account: ACCOUNT_A, source })).ok).toBe(true);

    const states = await pg.query<{ state: string }>(
      `select state from observer.source_credentials where source_id = $1`,
      [source],
    );
    expect(states.rows.map((row) => row.state)).toEqual(["revoked"]);

    const again = refusalOf(await admin.revokeCredential({ account: ACCOUNT_A, source }));
    expect(again.code).toBe("unknown_source");
  });

  it("refuses a source that never held a credential the same way it refuses a stranger's", async () => {
    const source = await makeSource(ACCOUNT_A);

    const uncredentialled = refusalOf(await admin.revokeCredential({ account: ACCOUNT_A, source }));
    const strangers = refusalOf(await admin.revokeCredential({ account: ACCOUNT_B, source }));

    expect(uncredentialled).toEqual(strangers);
  });
});

describe("the account boundary", () => {
  /**
   * The single most important property in this file.
   *
   * Account B holds a real source id belonging to account A — ids travel, in
   * URLs, in screenshots, in support tickets. Every write operation must refuse
   * it, and must refuse it with exactly the value it gives for an id that has
   * never existed, or the difference tells B that A's estate contains it.
   */
  it("refuses every write against another account's source, identically to one that does not exist", async () => {
    const source = await makeSource(ACCOUNT_A);
    await activate(ACCOUNT_A, source);

    const attempts: readonly (readonly [
      string,
      (account: string, source: string) => Promise<AdminResult<unknown>>,
    ])[] = [
      ["suspendSource", (account, target) => admin.suspendSource({ account, source: target })],
      ["resumeSource", (account, target) => admin.resumeSource({ account, source: target })],
      ["archiveSource", (account, target) => admin.archiveSource({ account, source: target })],
      [
        "revokeCredential",
        (account, target) => admin.revokeCredential({ account, source: target }),
      ],
      [
        "issueActivationCode",
        (account, target) =>
          admin.issueActivationCode({ account, source: target, purpose: "activation" }),
      ],
    ];

    for (const [name, attempt] of attempts) {
      const stranger = refusalOf(await attempt(ACCOUNT_B, source));
      const absent = refusalOf(await attempt(ACCOUNT_B, NO_SUCH_SOURCE));
      expect(stranger, name).toEqual(absent);
      expect(stranger.code, name).toBe("unknown_source");
    }
  });

  it("leaves account A's source untouched after account B has tried everything", async () => {
    const project = await makeProject(ACCOUNT_A);
    const source = await makeSource(ACCOUNT_A, project);
    await activate(ACCOUNT_A, source);

    await admin.suspendSource({ account: ACCOUNT_B, source });
    await admin.archiveSource({ account: ACCOUNT_B, source });
    await admin.revokeCredential({ account: ACCOUNT_B, source });

    expect(await stateOf(ACCOUNT_A, project, source)).toBe("active");
    const credentials = await pg.query<{ state: string }>(
      `select state from observer.source_credentials where source_id = $1`,
      [source],
    );
    expect(credentials.rows.map((row) => row.state)).toEqual(["active"]);
  });

  it("shows account B an empty list for account A's project rather than a refusal", async () => {
    const project = await makeProject(ACCOUNT_A);
    await makeSource(ACCOUNT_A, project);

    const mine = valueOf(await admin.sourceStatus({ account: ACCOUNT_A, project }));
    const theirs = valueOf(await admin.sourceStatus({ account: ACCOUNT_B, project }));
    const nowhere = valueOf(
      await admin.sourceStatus({ account: ACCOUNT_B, project: NO_SUCH_PROJECT }),
    );

    expect(mine).toHaveLength(1);
    expect(theirs).toEqual(nowhere);
    expect(theirs).toHaveLength(0);
  });

  it("refuses an empty account, which would otherwise scope silently to nothing", async () => {
    const source = await makeSource(ACCOUNT_A);
    for (const account of ["", "   "]) {
      expect(refusalOf(await admin.suspendSource({ account, source }))).toEqual({
        code: "invalid_input",
        field: "account",
      });
    }
  });
});

describe("reading the estate", () => {
  it("reports operational facts for one project, and for the whole account when asked", async () => {
    const project = await makeProject(ACCOUNT_A);
    const source = await makeSource(ACCOUNT_A, project);

    const scoped = valueOf(await admin.sourceOperations({ account: ACCOUNT_A, project }));
    expect(scoped.map((row) => row.source_id)).toEqual([source]);
    /* A source that has never reported anything is a row with nulls, not a gap. */
    expect(scoped[0]?.last_heartbeat_at).toBeNull();
    expect(scoped[0]?.ingestion_verified_at).toBeNull();

    /*
     * A second project of the same account, created here rather than relied on
     * from an earlier test: the suite shares one database, and an assertion
     * that "the account-wide list is longer" would otherwise be an assertion
     * about which tests ran first.
     */
    const elsewhere = await makeSource(ACCOUNT_A);
    const whole = valueOf(await admin.sourceOperations({ account: ACCOUNT_A, project: null }));
    expect(whole.map((row) => row.source_id)).toEqual(expect.arrayContaining([source, elsewhere]));
    expect(scoped.map((row) => row.source_id)).not.toContain(elsewhere);
  });

  it("never shows one account another's operational rows", async () => {
    const source = await makeSource(ACCOUNT_A);
    const theirs = valueOf(await admin.sourceOperations({ account: ACCOUNT_B, project: null }));
    expect(theirs.map((row) => row.source_id)).not.toContain(source);
  });
});

describe("what a refusal is allowed to carry", () => {
  it("names the unusable field and never the value it held", async () => {
    const secretish = "obs.a-value-an-operator-should-not-see-echoed.and-its-tail";
    const results: readonly AdminResult<unknown>[] = [
      await admin.suspendSource({ account: ACCOUNT_A, source: secretish }),
      await admin.createProject({ account: secretish, name: "", slug: null }),
      await admin.sourceOperations({ account: ACCOUNT_A, project: secretish }),
    ];

    for (const result of results) {
      const refusal = refusalOf(result);
      expect(refusal.code).toBe("invalid_input");
      expect(JSON.stringify(refusal)).not.toContain(secretish);
    }
  });

  it("is a returned value rather than a thrown error, so nothing logs a stack", async () => {
    const issued: AdminResult<IssuedActivation> = await admin.issueActivationCode({
      account: ACCOUNT_A,
      source: NO_SUCH_SOURCE,
      purpose: "activation",
    });
    expect(issued.ok).toBe(false);
  });
});
