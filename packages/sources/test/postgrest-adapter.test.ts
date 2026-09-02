import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { FACADE_NAMES, type FacadeName, type ObserverDb } from "../src/db";
import { postgrestDb, PostgrestFacadeError, type FetchLike } from "../src/postgrest";

/**
 * THE POSTGREST ADAPTER, WITHOUT A NETWORK.
 *
 * Two properties are worth a test here, and neither of them is "the code runs".
 *
 * The first is that the request is *exactly* right. Everything this adapter can
 * get wrong is a string TypeScript will happily accept: the path, the header
 * names, and above all the `p_*` argument keys, which PostgREST resolves an RPC
 * by. A renamed SQL parameter compiles, deploys, and answers `PGRST202` — a
 * 404 — at the first real request, indistinguishable from a wrong URL and from
 * a missing grant. So the bodies below are hard-coded from the migrations
 * rather than derived from the adapter, because a test that asks the adapter
 * what it sends proves only that it is consistent with itself.
 *
 * The second is that nothing secret escapes. `activationIssue`,
 * `activationConsume` and the credential paths all take HMAC verifiers as
 * arguments, and PostgREST's error bodies quote the failing statement back with
 * its arguments in it. The 500 case below hands the adapter exactly such a
 * body and asserts that what comes out the other side carries neither the
 * verifier nor the key.
 *
 * Every secret-shaped value in this file is prose in capitals. That is
 * deliberate: a fixture that looked like a real digest could be pasted
 * somewhere real, and a leak test whose canary is 64 characters of hex is one
 * that cannot tell you *which* string escaped.
 */

/* --- the fixture ------------------------------------------------------------- */

const BASE = "https://synthetic-project.example.invalid";
const KEY = "NOT-A-REAL-KEY-THIS-IS-A-TEST-FIXTURE-ONLY";

const ACCOUNT = "acct_northgate";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const SOURCE = "22222222-2222-4222-8222-222222222222";

const CODE_SELECTOR = "SYNTHETIC-CODE-SELECTOR";
const CODE_VERIFIER = "SYNTHETIC-CODE-VERIFIER-NEVER-A-REAL-DIGEST";
const CRED_SELECTOR = "SYNTHETIC-CREDENTIAL-SELECTOR";
const CRED_VERIFIER = "SYNTHETIC-CREDENTIAL-VERIFIER-NEVER-A-REAL-DIGEST";

const EXPECTED_HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

interface Recorded {
  readonly url: string;
  readonly method: string | undefined;
  readonly headers: unknown;
  /** Parsed, so an assertion reads as an object rather than as a string. */
  readonly body: unknown;
}

interface Stub {
  readonly db: ObserverDb;
  readonly calls: readonly Recorded[];
}

/**
 * An adapter wired to a fetch that answers once, from memory.
 *
 * `status` and `payload` are what the fake PostgREST replies with; `calls`
 * accumulates what it was asked. Nothing here opens a socket, which is the
 * property that lets this file assert a header set rather than a happy path.
 */
function stub(payload: unknown, status = 200, baseUrl: string = BASE): Stub {
  const calls: Recorded[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      body: JSON.parse(String(init.body)) as unknown,
    });
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
  return { db: postgrestDb({ url: baseUrl, key: KEY, fetch }), calls };
}

function only(calls: readonly Recorded[]): Recorded {
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (call === undefined) throw new Error("no request was made");
  return call;
}

/* --- the request shape --------------------------------------------------------- */

interface Case {
  /** The port method, named as a caller would say it. */
  readonly method: string;
  readonly facade: FacadeName;
  /** What the fake PostgREST answers, in the shape the real one would. */
  readonly reply: unknown;
  readonly invoke: (db: ObserverDb) => Promise<unknown>;
  /**
   * The JSON body, keyed by the SQL parameter names.
   *
   * Copied by hand out of `supabase/migrations/`, and that is the entire point:
   * this object and the `create function` signature are the two halves of a
   * contract no compiler checks. If a migration renames a parameter, this test
   * is where it is meant to hurt.
   */
  readonly body: Readonly<Record<string, unknown>>;
}

const CASES: readonly Case[] = [
  {
    method: "projectCreate",
    facade: "observer_project_create",
    reply: PROJECT,
    invoke: (db) => db.projectCreate({ account: ACCOUNT, name: "Northgate", slug: "northgate" }),
    body: { p_account: ACCOUNT, p_name: "Northgate", p_slug: "northgate" },
  },
  {
    method: "sourceCreate",
    facade: "observer_source_create",
    reply: SOURCE,
    invoke: (db) =>
      db.sourceCreate({
        account: ACCOUNT,
        project: PROJECT,
        type: "showroom_ue5",
        environment: "production",
        label: "Atrium kiosk",
      }),
    body: {
      p_account: ACCOUNT,
      p_project: PROJECT,
      p_type: "showroom_ue5",
      p_environment: "production",
      p_label: "Atrium kiosk",
    },
  },
  {
    method: "sourceSetState",
    facade: "observer_source_set_state",
    reply: true,
    invoke: (db) => db.sourceSetState({ account: ACCOUNT, source: SOURCE, state: "suspended" }),
    body: { p_account: ACCOUNT, p_source: SOURCE, p_state: "suspended" },
  },
  {
    method: "sourceStatus",
    facade: "observer_source_status",
    reply: [],
    invoke: (db) => db.sourceStatus({ account: ACCOUNT, project: PROJECT }),
    body: { p_account: ACCOUNT, p_project: PROJECT },
  },
  {
    method: "activationIssue",
    facade: "observer_activation_issue",
    reply: true,
    invoke: (db) =>
      db.activationIssue({
        account: ACCOUNT,
        source: SOURCE,
        selector: CODE_SELECTOR,
        verifier: CODE_VERIFIER,
        purpose: "first_activation",
        expiresAt: "2026-09-02T12:00:00.000Z",
      }),
    body: {
      p_account: ACCOUNT,
      p_source: SOURCE,
      p_selector: CODE_SELECTOR,
      p_verifier: CODE_VERIFIER,
      p_purpose: "first_activation",
      p_expires_at: "2026-09-02T12:00:00.000Z",
    },
  },
  {
    /*
     * The one that matters most. Four secret-derived strings in a fixed order,
     * two of them abbreviated by the SQL (`p_cred_*`) where the port spells
     * them out — so a mechanical "camelCase to snake_case" mapping would send
     * `p_credential_selector` and get a 404, and swapping the two verifiers
     * would send a request PostgREST accepts and Postgres executes into a
     * credential nobody can present.
     */
    method: "activationConsume",
    facade: "observer_activation_consume",
    reply: [],
    invoke: (db) =>
      db.activationConsume({
        codeSelector: CODE_SELECTOR,
        codeVerifier: CODE_VERIFIER,
        credentialSelector: CRED_SELECTOR,
        credentialVerifier: CRED_VERIFIER,
        credentialExpiresAt: null,
      }),
    body: {
      p_code_selector: CODE_SELECTOR,
      p_code_verifier: CODE_VERIFIER,
      p_cred_selector: CRED_SELECTOR,
      p_cred_verifier: CRED_VERIFIER,
      p_cred_expires_at: null,
    },
  },
  {
    method: "credentialResolve",
    facade: "observer_credential_resolve",
    reply: [],
    invoke: (db) => db.credentialResolve(CRED_SELECTOR),
    body: { p_selector: CRED_SELECTOR },
  },
  {
    method: "credentialRevoke",
    facade: "observer_credential_revoke",
    reply: true,
    invoke: (db) => db.credentialRevoke({ account: ACCOUNT, source: SOURCE }),
    body: { p_account: ACCOUNT, p_source: SOURCE },
  },
  {
    method: "credentialStatus",
    facade: "observer_credential_status",
    reply: [],
    invoke: (db) => db.credentialStatus({ account: ACCOUNT, source: SOURCE }),
    body: { p_account: ACCOUNT, p_source: SOURCE },
  },
  {
    method: "eventsAppend",
    facade: "observer_events_append",
    reply: [],
    invoke: (db) => db.eventsAppend({ source: SOURCE, events: [] }),
    body: { p_source: SOURCE, p_events: [] },
  },
  {
    method: "eventsForSource",
    facade: "observer_events_for_source",
    reply: [],
    invoke: (db) => db.eventsForSource({ account: ACCOUNT, source: SOURCE, limit: 50 }),
    body: { p_account: ACCOUNT, p_source: SOURCE, p_limit: 50 },
  },
  {
    method: "heartbeatRecord",
    facade: "observer_heartbeat_record",
    reply: true,
    invoke: (db) =>
      db.heartbeatRecord({ source: SOURCE, facts: { app_version: "1.4.0", queue_event_count: 3 } }),
    body: { p_source: SOURCE, p_facts: { app_version: "1.4.0", queue_event_count: 3 } },
  },
  {
    method: "ingestionVerified",
    facade: "observer_ingestion_verified",
    reply: true,
    invoke: (db) => db.ingestionVerified({ source: SOURCE }),
    body: { p_source: SOURCE },
  },
  {
    /* The only nullable `p_project` in the port. Sent, never omitted. */
    method: "sourceOperations",
    facade: "observer_source_operations",
    reply: [],
    invoke: (db) => db.sourceOperations({ account: ACCOUNT, project: null }),
    body: { p_account: ACCOUNT, p_project: null },
  },
];

describe("each port method becomes one POST whose shape is pinned here", () => {
  for (const example of CASES) {
    it(`sends ${example.method} to /rest/v1/rpc/${example.facade} with the SQL parameter names`, async () => {
      const { db, calls } = stub(example.reply);
      await example.invoke(db);

      const call = only(calls);
      expect(call.url).toBe(`${BASE}/rest/v1/rpc/${example.facade}`);
      expect(call.method).toBe("POST");
      expect(call.headers).toEqual(EXPECTED_HEADERS);
      expect(call.body).toEqual(example.body);
    });
  }

  it("covers every method the port declares, so a new one cannot arrive untested", () => {
    /*
     * The port is an interface, so its keys exist only at runtime on an
     * instance. Building one against a fetch that is never called is the
     * cheapest way to enumerate them, and it also proves the adapter implements
     * the whole port rather than most of it.
     */
    const { db } = stub(null);
    const declared = Object.keys(db).sort();
    const covered = CASES.map((example) => example.method).sort();
    expect(covered).toEqual(declared);
  });

  it("does not double the slash when the configured URL keeps its trailing one", async () => {
    /*
     * `supabase-env.ts` accepts `https://project.supabase.co/` as valid,
     * reasoning that a trailing slash is unambiguous and common. Concatenating
     * naively would produce `//rest/v1/rpc/...`, which PostgREST answers 404 —
     * the same status as a missing function and as a key whose role cannot see
     * one, which is three problems wearing one number.
     */
    const { db, calls } = stub(PROJECT, 200, `${BASE}/`);
    await db.projectCreate({ account: ACCOUNT, name: "Northgate", slug: null });
    expect(only(calls).url).toBe(`${BASE}/rest/v1/rpc/observer_project_create`);
  });
});

/* --- what comes back ----------------------------------------------------------- */

describe("a scalar facade and a table facade are read differently", () => {
  it("reads observer_project_create as the bare value PostgREST sends for a scalar", async () => {
    /*
     * `returns uuid` produces the JSON string `"1111…"`, not
     * `[{"observer_project_create":"1111…"}]`. Reading `rows[0]` from that
     * would yield `"1"` — a plausible-looking value that is one character of an
     * identifier, and no error anywhere.
     */
    const { db } = stub(PROJECT);
    expect(await db.projectCreate({ account: ACCOUNT, name: "Northgate", slug: null })).toBe(
      PROJECT,
    );
  });

  it("reads a returns-table facade as an array even when it holds one row", async () => {
    const { db } = stub([{ ordinal: 1, event_id: SOURCE, outcome: "accepted" }]);
    const rows = await db.eventsAppend({ source: SOURCE, events: [{ event_name: "demo" }] });
    expect(rows).toEqual([{ ordinal: 1, event_id: SOURCE, outcome: "accepted" }]);
  });

  it("gives activationConsume null for no row, so five failures stay one answer", async () => {
    /*
     * Unknown selector, wrong verifier, expired, already spent, ineligible
     * source: the facade returns nothing for all five, and the port promises
     * the caller cannot tell them apart. An empty array reaching a caller would
     * be a sixth distinguishable outcome.
     */
    const { db } = stub([]);
    expect(
      await db.activationConsume({
        codeSelector: CODE_SELECTOR,
        codeVerifier: CODE_VERIFIER,
        credentialSelector: CRED_SELECTOR,
        credentialVerifier: CRED_VERIFIER,
        credentialExpiresAt: null,
      }),
    ).toBeNull();
  });

  it("gives credentialResolve null for an unknown selector", async () => {
    const { db } = stub([]);
    expect(await db.credentialResolve("SYNTHETIC-SELECTOR-THAT-MATCHES-NOTHING")).toBeNull();
  });

  it("gives credentialResolve the row itself when the selector matches", async () => {
    const row = {
      verifier: CRED_VERIFIER,
      credential_state: "active",
      expires_at: null,
      source_id: SOURCE,
      account_id: ACCOUNT,
      project_id: PROJECT,
      environment: "production",
      display_label: "Atrium kiosk",
      source_state: "active",
    };
    const { db } = stub([row]);
    expect(await db.credentialResolve(CRED_SELECTOR)).toEqual(row);
  });

  it("keeps only the newest credential status, which is what the facade orders first", async () => {
    const newest = {
      state: "active",
      created_at: "2026-09-02T10:00:00.000Z",
      expires_at: null,
      superseded_at: null,
      revoked_at: null,
    };
    const older = { ...newest, state: "superseded", created_at: "2026-08-01T10:00:00.000Z" };
    const { db } = stub([newest, older]);
    expect(await db.credentialStatus({ account: ACCOUNT, source: SOURCE })).toEqual(newest);
  });
});

describe("a batch of events crosses the wire as one jsonb argument", () => {
  it("sends the whole array under p_events rather than one request per event", async () => {
    const events = [
      { event_id: "aaaaaaaa-0000-4000-8000-000000000001", event_name: "showroom.opened" },
      { event_id: "aaaaaaaa-0000-4000-8000-000000000002", event_name: "configurator.changed" },
      { event_id: "aaaaaaaa-0000-4000-8000-000000000003", event_name: "enquiry.submitted" },
    ];
    const { db, calls } = stub([]);
    await db.eventsAppend({ source: SOURCE, events });

    const call = only(calls);
    expect(call.body).toEqual({ p_source: SOURCE, p_events: events });

    /*
     * An array, not a string containing one. `JSON.stringify`-ing the batch
     * before putting it in the argument object would arrive as a `jsonb`
     * string, and `jsonb_array_elements` raises on those — a runtime error
     * that no type in this codebase could have caught.
     */
    const body = call.body as { p_events: unknown };
    expect(Array.isArray(body.p_events)).toBe(true);
  });
});

/* --- what must never come back ------------------------------------------------- */

describe("a failing facade says which door and what status, and nothing else", () => {
  /**
   * A PostgREST error body of the kind that made this rule.
   *
   * `details` quoting the statement with its arguments interpolated is what
   * Postgres does when a `security definer` function raises, and PostgREST
   * passes it through. Included verbatim in a thrown message, it would put a
   * credential verifier into whatever log caught the throw.
   */
  const LEAKY_BODY = {
    code: "P0001",
    message: "credential could not be minted",
    details: `failing statement: select public.observer_activation_consume('${CODE_SELECTOR}', '${CODE_VERIFIER}', '${CRED_SELECTOR}', '${CRED_VERIFIER}', null)`,
    hint: null,
  };

  async function thrownBy(status: number): Promise<unknown> {
    const { db } = stub(LEAKY_BODY, status);
    try {
      await db.activationConsume({
        codeSelector: CODE_SELECTOR,
        codeVerifier: CODE_VERIFIER,
        credentialSelector: CRED_SELECTOR,
        credentialVerifier: CRED_VERIFIER,
        credentialExpiresAt: null,
      });
    } catch (error) {
      return error;
    }
    throw new Error(`HTTP ${status} did not throw`);
  }

  it("names the facade and the status in the message", async () => {
    const error = await thrownBy(500);
    expect(error).toBeInstanceOf(PostgrestFacadeError);
    expect((error as Error).message).toContain("observer_activation_consume");
    expect((error as Error).message).toContain("500");
  });

  it("carries the facade and status as fields, so a caller need not parse prose", async () => {
    const error = await thrownBy(404);
    expect(error).toBeInstanceOf(PostgrestFacadeError);
    expect((error as PostgrestFacadeError).facade).toBe("observer_activation_consume");
    expect((error as PostgrestFacadeError).status).toBe(404);
  });

  it("leaks neither verifier nor the secret key into anything the error can print", async () => {
    const error = await thrownBy(500);

    /*
     * Everything a caller could plausibly write to a log: the message, the
     * default string coercion, the enumerable properties, and the stack — which
     * is worth checking because a `cause` chain rides along in some runtimes'
     * stack rendering and `cause` is exactly where a helpful wrapper would have
     * parked the response body.
     */
    const surfaces = [
      (error as Error).message,
      String(error),
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
      (error as Error).stack ?? "",
    ];

    for (const surface of surfaces) {
      for (const secret of [CODE_VERIFIER, CRED_VERIFIER, KEY, LEAKY_BODY.details]) {
        expect(surface).not.toContain(secret);
      }
    }

    expect((error as Error).cause).toBeUndefined();
  });

  it("refuses a 200 whose body is not JSON without quoting the body it choked on", async () => {
    /*
     * A proxy or a captive portal answering 200 with an HTML page. The native
     * `SyntaxError` from `response.json()` quotes the document it failed on, so
     * passing it through would be the same disclosure by a different route.
     */
    const html = `<html><body>blocked: ${CRED_VERIFIER}</body></html>`;
    const fetch: FetchLike = () => Promise.resolve(new Response(html, { status: 200 }));
    const db = postgrestDb({ url: BASE, key: KEY, fetch });

    await expect(db.credentialResolve(CRED_SELECTOR)).rejects.toThrow(
      /observer_credential_resolve/,
    );
    await expect(db.credentialResolve(CRED_SELECTOR)).rejects.not.toThrow(
      new RegExp(CRED_VERIFIER),
    );
  });
});

/* --- the drift check ----------------------------------------------------------- */

/**
 * The check that a facade the port names is a facade the database has.
 *
 * `FACADE_NAMES` exists in `db.ts` for exactly this, and the failure it guards
 * against has a history: three of these names — the source-operations trio —
 * were in the port with no migration behind them while this adapter was being
 * written, and nothing but a filesystem read could have said so. TypeScript
 * cannot see an RPC name, and PostgREST reports the absence as a 404, which is
 * also what a wrong URL and an ungranted role look like.
 */
describe("every facade name the adapter can call exists in the SQL", () => {
  const directory = resolve(import.meta.dirname, "../../../supabase/migrations");
  const sql = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readFileSync(join(directory, name), "utf8"))
    .join("\n");

  /*
   * Matched as a `create function` in `public`, not merely as a substring. A
   * name can appear in a migration inside a `revoke`, a comment or a `drop` for
   * a function nothing ever created, and every one of those would satisfy a
   * plain `includes` while still 404-ing at runtime. The schema is part of the
   * pattern because a function that exists only in `observer` is unreachable
   * over PostgREST — that is the whole reason the facades are in `public`.
   */
  function created(facade: FacadeName): boolean {
    return new RegExp(`create (or replace )?function public\\.${facade}\\b`).test(sql);
  }

  for (const facade of FACADE_NAMES) {
    it(`finds a create function for ${facade}`, () => {
      expect(created(facade)).toBe(true);
    });
  }

  it("names in its failure every facade that no migration creates", () => {
    /*
     * The same property as the loop above, asserted once more as a set, so that
     * a run which is missing several says so in one line rather than in one
     * red case per name — and so that the empty array is itself a readable
     * statement of what this file guarantees.
     */
    expect(FACADE_NAMES.filter((facade) => !created(facade))).toEqual([]);
  });
});
