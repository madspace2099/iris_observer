import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ACTIVATION_HTTP_STATUS,
  APPROVED_BACKEND_CEILINGS,
  ActivationSuccessSchema,
  OBSERVER_ROUTES,
} from "@observer/contracts/ue5";

import {
  ACTIVATION_REQUEST_BYTE_CEILING,
  OBSERVER_PUBLIC_ORIGIN,
  handleActivate,
} from "../src/activate";
import type { ObserverDb } from "../src/db";
import type { HandlerDeps } from "../src/http";
import { pgliteDb, type SqlQuery } from "../src/pglite";
import {
  ACTIVATION_CODE_PEPPER,
  SOURCE_TOKEN_PEPPER,
  issueActivationCode,
  parseToken,
  type EnvSource,
  type IssuedSecret,
} from "../src/secrets";
import {
  closeSuiteDatabases,
  closeTestDatabases,
  openDatabase,
} from "../../../supabase/test/support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE ACTIVATION ENDPOINT, AGAINST A REAL POSTGRES.
 *
 * ## Why this file boots a database rather than stubbing the port
 *
 * The property the endpoint exists to hold is that six different failures are
 * one indistinguishable answer, and five of those six are decisions the
 * *database* makes: `observer_activation_consume` returns null for an unknown
 * selector, a wrong verifier, an expired code, a spent one, a revoked one and a
 * code whose source is no longer eligible. A stubbed port would let this file
 * assert that a null becomes a 401, which is the one part of the chain nobody
 * gets wrong. Against the real SQL it asserts the thing that actually protects
 * the endpoint: that those six causes are indistinguishable **all the way
 * down**, including that the atomic consume really is atomic.
 *
 * ## Every secret here is obviously synthetic, except where it must not be
 *
 * The two peppers are English sentences. The codes and tokens, by contrast, are
 * minted by the real `issueActivationCode` and `issueSourceToken`, because the
 * handler derives a verifier from a presented code and the only proof that its
 * derivation agrees with the issuer's is a code that made the whole round trip.
 * No plaintext is printed: every assertion about one is a comparison or an
 * absence check.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../../../supabase/migrations");

/**
 * The five migrations of the source spine, named rather than globbed.
 *
 * `20260902120000` is the one a reader might think optional: it corrects the
 * facades' timestamp rendering to milliseconds. It is applied because a fixture
 * that runs a subset of the migrations is proving something no deployment will
 * ever run.
 */
const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
  "20260902120000_observer_instant_precision_and_ingest_mark.sql",
  "20260902130000_observer_credential_resolve_precision.sql",
];

const ACCOUNT = "acct_northgate";

/*
 * Two peppers, distinct, and unmistakably not secrets. `VITEST` is what lets
 * `describePepper` accept material this obvious; a deployment refuses it, which
 * is what makes copying a test configuration into Preview fail closed.
 */
const ENV: EnvSource = {
  VITEST: "1",
  [ACTIVATION_CODE_PEPPER]: "activation-code-pepper-for-the-activate-suite-only",
  [SOURCE_TOKEN_PEPPER]: "source-token-pepper-for-the-activate-suite-only",
};

type Database = Awaited<ReturnType<typeof openDatabase>>;

let pg: Database;
let db: ObserverDb;
let deps: HandlerDeps;

const query: SqlQuery = (sql, params) => pg.query(sql, [...params]);

beforeAll(async () => {
  pg = await openDatabase("suite");
  /* The three Supabase roles the migrations revoke from; PGlite has none. */
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const name of FILES) await pg.exec(readFileSync(join(MIGRATIONS, name), "utf8"));
  db = pgliteDb(query);
  deps = { db, env: ENV, now: () => new Date() };
});

/* --- fixtures ------------------------------------------------------------------- */

const ACTIVATE_URL = `https://observer.test${OBSERVER_ROUTES.activate}`;

/** A well-formed request body, with whatever this case needs changed. */
function requestBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    activation_code: "obs.this-is-replaced-per-case.and-never-used-as-is",
    reported_environment: "production",
    installation_nonce: "9f4b2d61-0c8e-4a37-b1d5-6e2a7c930f48",
    build: {
      app_version: "1.4.2",
      plugin_version: "0.2.0",
      build_id: "BUILD-2026-09-02",
      engine_version: "5.6",
    },
    os: "Windows 11 26100",
    ...overrides,
  };
}

function post(body: unknown, method = "POST"): Request {
  /*
   * A GET may not carry a body — `undici` throws rather than ignoring it — so
   * the method cases send none. That is also the honest shape of the request a
   * misconfigured proxy or a curious browser actually sends here.
   */
  const carriesBody = method !== "GET" && method !== "HEAD";
  return new Request(ACTIVATE_URL, {
    method,
    headers: { "content-type": "application/json" },
    ...(carriesBody ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}

/** A project and an active source under it. */
async function makeSource(label: string): Promise<string> {
  const project = await db.projectCreate({ account: ACCOUNT, name: `P ${label}`, slug: null });
  return db.sourceCreate({
    account: ACCOUNT,
    project,
    type: "showroom_ue5",
    environment: "production",
    label,
  });
}

/**
 * Mint a code with the real issuer and record it against a source.
 *
 * The plaintext is returned so a case can present it. It is the value under
 * test — the handler has to reduce it to the same selector and verifier the
 * issuer produced — and it is never printed.
 */
async function issueCode(
  source: string,
  purpose: "activation" | "reactivation" = "activation",
  expiresAt: Date = new Date(Date.now() + 3_600_000),
): Promise<IssuedSecret> {
  const code = issueActivationCode(ENV);
  const written = await db.activationIssue({
    account: ACCOUNT,
    source,
    selector: code.selector,
    verifier: code.verifier,
    purpose,
    expiresAt: expiresAt.toISOString(),
  });
  expect(written, "the fixture's own precondition").toBe(true);
  return code;
}

/** A source, a code for it, and the code's plaintext. */
async function sourceWithCode(label: string): Promise<{ source: string; code: IssuedSecret }> {
  const source = await makeSource(label);
  return { source, code: await issueCode(source) };
}

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly contentType: string | null;
  readonly retryAfter: string | null;
}

/** Everything a client can observe about a response, as one comparable value. */
async function answerOf(response: Response): Promise<Answer> {
  return {
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get("content-type"),
    retryAfter: response.headers.get("retry-after"),
  };
}

async function activate(body: unknown, over: Partial<HandlerDeps> = {}): Promise<Response> {
  return handleActivate(post(body), { ...deps, ...over });
}

/** The 200 body, parsed through the contract's own schema. */
async function successBody(response: Response): Promise<Record<string, unknown>> {
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  const parsed = ActivationSuccessSchema.safeParse(body);
  expect(parsed.success, "the response must satisfy the published success schema").toBe(true);
  return body as Record<string, unknown>;
}

/* --- a first activation ---------------------------------------------------------- */

describe("a fresh code becomes a credential the source can present", () => {
  it("answers 200 with the operator's label, the record's environment and one token", async () => {
    const { source, code } = await sourceWithCode("Atrium PC");

    const body = await successBody(
      await activate(requestBody({ activation_code: code.plaintext })),
    );

    expect(body["status"]).toBe("activated");
    expect(body["source_id"]).toBe(source);
    expect(body["display_label"], "server-authored, never the client's hostname").toBe("Atrium PC");
    expect(body["environment"], "the record's, not the build's claim").toBe("production");
    expect(body["environment_mismatch"]).toBe(false);
    expect(body["token_expires_at"], "V1 states no credential expiry").toBeNull();
    expect(body["accepted_schema_versions"]).toEqual({ min: 1, max: 1 });
    expect(body["ingest_url"]).toBe(`https://observer.test${OBSERVER_ROUTES.ingest}`);
    expect(body["heartbeat_url"]).toBe(`https://observer.test${OBSERVER_ROUTES.heartbeat}`);
  });

  it("states the three ceilings the ingestion endpoint will actually refuse at", async () => {
    /*
     * A stated limit exists so a client splits before the 413 rather than
     * after. Stating null while enforcing 200 events and 8 MiB would make the
     * negotiation decorative.
     */
    const { code } = await sourceWithCode("Limits PC");
    const body = await successBody(
      await activate(requestBody({ activation_code: code.plaintext })),
    );

    expect(body["limits"]).toEqual({
      max_batch_events: APPROVED_BACKEND_CEILINGS.maxBatchEvents,
      max_batch_bytes: APPROVED_BACKEND_CEILINGS.maxBatchBytes,
      max_event_bytes: APPROVED_BACKEND_CEILINGS.maxEventBytes,
      max_property_depth: APPROVED_BACKEND_CEILINGS.maxPropertyDepth,
      max_property_count: APPROVED_BACKEND_CEILINGS.maxPropertyCount,
      min_send_interval_ms: null,
    });
  });

  it("flags a build that reports an environment the record disagrees with", async () => {
    const { code } = await sourceWithCode("Mismatch PC");

    const body = await successBody(
      await activate(
        requestBody({ activation_code: code.plaintext, reported_environment: "development" }),
      ),
    );

    expect(body["environment"], "authoritative, and unmoved by the claim").toBe("production");
    expect(body["environment_mismatch"]).toBe(true);
  });

  it("dates the configuration refresh from the injected clock, not from the wall", async () => {
    const { code } = await sourceWithCode("Clock PC");
    const frozen = new Date("2026-09-02T09:00:00.000Z");

    const body = await successBody(
      await activate(requestBody({ activation_code: code.plaintext }), { now: () => frozen }),
    );

    expect(body["config_refresh_after"], "thirty days on, as the reference mock states").toBe(
      "2026-10-02T09:00:00.000Z",
    );
  });

  it("sends clients to the configured public origin when a deployment states one", async () => {
    const { code } = await sourceWithCode("Origin PC");

    const body = await successBody(
      await activate(requestBody({ activation_code: code.plaintext }), {
        /* The trailing slash is tolerated, as `SUPABASE_URL`'s is. */
        env: { ...ENV, [OBSERVER_PUBLIC_ORIGIN]: "https://project-ref.example.test/" },
      }),
    );

    expect(body["ingest_url"]).toBe(`https://project-ref.example.test${OBSERVER_ROUTES.ingest}`);
    expect(body["heartbeat_url"]).toBe(
      `https://project-ref.example.test${OBSERVER_ROUTES.heartbeat}`,
    );
  });

  it("stores a verifier for the credential and nothing the token can be recovered from", async () => {
    const { source, code } = await sourceWithCode("Storage PC");

    const body = await successBody(
      await activate(requestBody({ activation_code: code.plaintext })),
    );
    const token = body["source_token"] as string;
    const presented = parseToken(token);
    expect(presented, "the response carries a token this repository can parse").not.toBeNull();

    const stored = await pg.query<Record<string, unknown>>(
      "select * from observer.source_credentials where source_id = $1",
      [source],
    );
    expect(stored.rows).toHaveLength(1);

    const row = JSON.stringify(stored.rows[0]);
    expect(row.includes(token), "the plaintext is not in the row").toBe(false);
    expect(row.includes(presented?.secret ?? token), "nor is the secret half").toBe(false);
    expect(
      row.includes(presented?.selector ?? "impossible"),
      "the public half is, because that is what a lookup finds",
    ).toBe(true);

    /* And the credential resolves to the source it was minted for. */
    const resolved = await db.credentialResolve(presented?.selector ?? "");
    expect(resolved?.source_id).toBe(source);
    expect(resolved?.credential_state).toBe("active");
  });
});

/* --- reactivation ----------------------------------------------------------------- */

describe("a second code re-credentials the same source", () => {
  it("keeps the source_id, issues a different token and supersedes the old one", async () => {
    const { source, code } = await sourceWithCode("Reimaged PC");

    const first = await successBody(
      await activate(requestBody({ activation_code: code.plaintext })),
    );
    const firstToken = first["source_token"] as string;

    /*
     * The operator issues a fresh code marked `reactivation`. There is no
     * token-refresh endpoint and no way for the client to ask: credential
     * material reaches a device through exactly one door.
     */
    const again = await issueCode(source, "reactivation");
    const second = await successBody(
      await activate(requestBody({ activation_code: again.plaintext })),
    );
    const secondToken = second["source_token"] as string;

    expect(second["status"], "derived from the code's purpose, not from a client field").toBe(
      "reactivated",
    );
    expect(second["source_id"], "the same source, which is what recovery means").toBe(source);
    expect(secondToken === firstToken, "a new credential, never the old one again").toBe(false);

    const old = parseToken(firstToken);
    const fresh = parseToken(secondToken);
    expect((await db.credentialResolve(old?.selector ?? ""))?.credential_state).toBe("superseded");
    expect((await db.credentialResolve(fresh?.selector ?? ""))?.credential_state).toBe("active");
  });
});

/* --- the one indistinguishable failure --------------------------------------------- */

describe("every way a code can fail produces byte-identical bytes", () => {
  /**
   * The six causes, each built from a real database state.
   *
   * They are constructed rather than described because the point of the
   * assertion is that the *database* cannot be told apart through this
   * endpoint. A table of six pre-baked 401s would prove only that this file can
   * write the same literal six times.
   */
  async function causes(): Promise<readonly (readonly [string, Answer])[]> {
    const answers: (readonly [string, Answer])[] = [];

    /* 1. A code the issuer minted and nobody ever recorded. */
    answers.push([
      "never issued",
      await answerOf(
        await activate(requestBody({ activation_code: issueActivationCode(ENV).plaintext })),
      ),
    ]);

    /*
     * 2. A value that satisfies the request schema and is not a token. It fails
     * `parseToken` rather than the database, and must not be separable from the
     * five that fail in Postgres — a caller learning that their guess had the
     * wrong *shape* has learned the first bit of an enumeration.
     */
    answers.push([
      "malformed after the schema accepted it",
      await answerOf(await activate(requestBody({ activation_code: "not-a-source-token-at-all" }))),
    ]);

    /* 3. Issued, and already past its expiry when presented. */
    const expiredSource = await makeSource("Expired PC");
    const expired = await issueCode(expiredSource, "activation", new Date(Date.now() - 60_000));
    answers.push([
      "expired",
      await answerOf(await activate(requestBody({ activation_code: expired.plaintext }))),
    ]);

    /* 4. Spent once, presented again — the case `409 already_activated` used to leak. */
    const spentSource = await sourceWithCode("Spent PC");
    expect(
      (await activate(requestBody({ activation_code: spentSource.code.plaintext }))).status,
    ).toBe(200);
    answers.push([
      "already consumed",
      await answerOf(await activate(requestBody({ activation_code: spentSource.code.plaintext }))),
    ]);

    /* 5. Revoked by an operator before anybody used it. */
    const revokedSource = await sourceWithCode("Revoked PC");
    await pg.query(
      "update observer.activation_codes set state = 'revoked', revoked_at = now() where selector = $1",
      [revokedSource.code.selector],
    );
    answers.push([
      "revoked",
      await answerOf(
        await activate(requestBody({ activation_code: revokedSource.code.plaintext })),
      ),
    ]);

    /*
     * 6. A genuine code against a source that is no longer eligible. The code is
     * spent by the attempt — the migration consumes first and checks
     * eligibility after, deliberately, so a stolen code cannot be polled until
     * an operator happens to resume the source.
     */
    const archivedSource = await sourceWithCode("Archived PC");
    await db.sourceSetState({ account: ACCOUNT, source: archivedSource.source, state: "archived" });
    answers.push([
      "tied to an ineligible source",
      await answerOf(
        await activate(requestBody({ activation_code: archivedSource.code.plaintext })),
      ),
    ]);

    return answers;
  }

  it("answers 401 activation_failed with a null source_id for all six", async () => {
    for (const [name, answer] of await causes()) {
      expect(answer.status, name).toBe(ACTIVATION_HTTP_STATUS.activation_failed);
      expect(JSON.parse(answer.text), name).toEqual({
        status: "failed",
        code: "activation_failed",
        message: expect.any(String) as unknown,
        source_id: null,
        retry_after_seconds: null,
      });
    }
  });

  it("produces the same bytes and the same headers for all six", async () => {
    /*
     * Byte identity rather than field-by-field agreement. A message that
     * differed only in length would still be an oracle to anybody timing or
     * measuring the response, and `Content-Length` is computed from these bytes.
     */
    const answers = await causes();
    const [, first] = answers[0] ?? [];
    expect(first).toBeDefined();

    for (const [name, answer] of answers) {
      expect(answer.text, name).toBe(first?.text);
      expect(answer.status, name).toBe(first?.status);
      expect(answer.contentType, name).toBe(first?.contentType);
      expect(answer.retryAfter, name).toBeNull();
    }
  });

  it("gives a suspended source's code the same answer as a pure guess", async () => {
    const { source, code } = await sourceWithCode("Suspended PC");
    await db.sourceSetState({ account: ACCOUNT, source, state: "suspended" });

    const suspended = await answerOf(
      await activate(requestBody({ activation_code: code.plaintext })),
    );
    const guessed = await answerOf(
      await activate(requestBody({ activation_code: issueActivationCode(ENV).plaintext })),
    );

    /*
     * 403 `source_suspended` is the right answer for a *credentialled* request
     * on the ingestion path, where the caller has already proved who it is. Here
     * the caller has proved nothing, so telling it that a suspended source
     * exists behind this code is the existence oracle §9.1 forbids.
     */
    expect(suspended).toEqual(guessed);
  });
});

/* --- what the responses may never contain -------------------------------------------- */

describe("no response carries an identifier the client has no use for", () => {
  it("returns exactly the success schema's keys, and no account or project id", async () => {
    const source = await makeSource("Quiet PC");
    const code = await issueCode(source);

    const response = await activate(requestBody({ activation_code: code.plaintext }));
    const text = await response.clone().text();
    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(
      [
        "accepted_schema_versions",
        "config_refresh_after",
        "display_label",
        "environment",
        "environment_mismatch",
        "heartbeat_url",
        "ingest_url",
        "limits",
        "source_id",
        "source_token",
        "status",
        "token_expires_at",
      ].sort(),
    );

    /*
     * The row the database returned carries `account_id` and `project_id` —
     * the service needs both to build an authenticated context. Neither may
     * appear on the wire, so this asserts on the serialised bytes rather than
     * on the keys: a nested object would satisfy a key check and still leak.
     */
    const projects = await pg.query<{ project_id: string }>(
      "select project_id from observer.project_sources where source_id = $1",
      [source],
    );
    expect(text.includes(ACCOUNT), "no account identifier anywhere in the body").toBe(false);
    expect(
      text.includes(projects.rows[0]?.project_id ?? "impossible"),
      "no project identifier either",
    ).toBe(false);
  });

  it("returns no source_id and no token on any failure", async () => {
    const { source, code } = await sourceWithCode("Silent PC");
    await db.sourceSetState({ account: ACCOUNT, source, state: "archived" });

    const text = await (await activate(requestBody({ activation_code: code.plaintext }))).text();

    expect(text.includes(source), "the source exists and the caller must not learn it").toBe(false);
    expect(text.includes("obs."), "no credential material on a refusal").toBe(false);
    expect(text.includes(code.plaintext), "not even the code that was presented").toBe(false);
    expect(text.includes(code.verifier), "and certainly not a verifier").toBe(false);
  });

  it("puts the token in the success body and in no header", async () => {
    const { code } = await sourceWithCode("Header PC");

    const response = await activate(requestBody({ activation_code: code.plaintext }));
    const body = await response.clone().json();
    const token = (body as Record<string, unknown>)["source_token"] as string;

    const headers = JSON.stringify([...response.headers.entries()]);
    expect(headers.includes(token), "not in a header").toBe(false);
    expect(headers.includes("obs."), "no header carries credential material at all").toBe(false);
    expect(token.startsWith("obs."), "the body has it, once").toBe(true);
  });
});

/* --- what the client may not supply ---------------------------------------------------- */

describe("identity cannot be supplied by the client", () => {
  const forbidden = [
    ["tenant_id", "acct_riverside"],
    ["project_id", "00000000-0000-4000-8000-000000000001"],
    ["source_id", "00000000-0000-4000-8000-000000000002"],
  ] as const;

  for (const [field, value] of forbidden) {
    it(`refuses a request carrying ${field} instead of ignoring it`, async () => {
      /*
       * The envelope is a `strictObject`, so this is automatic — and asserted
       * anyway. The failure mode of a non-strict envelope is silent: a plugin
       * sets `project_id` for a year and believes it is doing something.
       */
      const { code } = await sourceWithCode(`Forbidden ${field}`);

      const response = await activate(
        requestBody({ activation_code: code.plaintext, [field]: value }),
      );

      expect(response.status).toBe(ACTIVATION_HTTP_STATUS.malformed_request);
      expect(await response.json()).toEqual({
        status: "failed",
        code: "malformed_request",
        message: expect.any(String) as unknown,
        source_id: null,
        retry_after_seconds: null,
      });

      /* And a rejected envelope must not have spent the code it carried. */
      expect(
        (await activate(requestBody({ activation_code: code.plaintext }))).status,
        "the code is still good",
      ).toBe(200);
    });
  }
});

/* --- the shape of the request itself ---------------------------------------------------- */

describe("the request is refused before anything expensive happens", () => {
  for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
    it(`refuses ${method}, because this route is POST only`, async () => {
      const response = await handleActivate(post(requestBody(), method), deps);
      expect(response.status).toBe(ACTIVATION_HTTP_STATUS.malformed_request);
      expect((await response.json()) as Record<string, unknown>).toMatchObject({
        status: "failed",
        code: "malformed_request",
        source_id: null,
      });
    });
  }

  it("refuses an over-sized body as malformed rather than as a batch to be split", async () => {
    /*
     * `batch_too_large` is the wrong answer and 413 is the wrong status. Its
     * policy is `retain_and_split` — halve it and try again — and an activation
     * request has no halves. It is also not in `ACTIVATION_FAILURE_CODES`.
     */
    const oversized = JSON.stringify(requestBody({ padding: "x".repeat(6_000) }));
    expect(oversized.length).toBeGreaterThan(ACTIVATION_REQUEST_BYTE_CEILING);

    const response = await handleActivate(post(oversized), deps);

    expect(response.status).toBe(ACTIVATION_HTTP_STATUS.malformed_request);
    expect(response.status, "emphatically not 413").not.toBe(413);
    expect((await response.json()) as Record<string, unknown>).toMatchObject({
      code: "malformed_request",
    });
  });

  it("refuses a body that is not JSON without quoting it back", async () => {
    const response = await handleActivate(post('{"activation_code":'), deps);
    const text = await response.text();

    expect(response.status).toBe(ACTIVATION_HTTP_STATUS.malformed_request);
    expect(text.includes("activation_code"), "the parser's message is not the client's").toBe(
      false,
    );
  });

  it("refuses a request missing a required field", async () => {
    const body = requestBody();
    delete body["installation_nonce"];
    expect((await activate(body)).status).toBe(ACTIVATION_HTTP_STATUS.malformed_request);
  });
});

/* --- the rate limit hook ------------------------------------------------------------------ */

describe("the rate limit hook refuses without spending a code", () => {
  it("answers 429 with Retry-After in both the header and the body", async () => {
    const { code } = await sourceWithCode("Limited PC");

    const response = await activate(requestBody({ activation_code: code.plaintext }), {
      rateLimit: (_request, route) => {
        expect(route, "the hook is told which door it is guarding").toBe(OBSERVER_ROUTES.activate);
        return Promise.resolve(30);
      },
    });

    expect(response.status).toBe(ACTIVATION_HTTP_STATUS.rate_limited);
    expect(
      response.headers.get("retry-after"),
      "a client must not have to parse a body to learn how long to wait",
    ).toBe("30");
    expect(await response.json()).toEqual({
      status: "failed",
      code: "rate_limited",
      message: expect.any(String) as unknown,
      source_id: null,
      retry_after_seconds: 30,
    });

    expect(
      (await activate(requestBody({ activation_code: code.plaintext }))).status,
      "a refused attempt is not an attempt",
    ).toBe(200);
  });

  it("proceeds when the hook allows the request", async () => {
    const { code } = await sourceWithCode("Allowed PC");
    const response = await activate(requestBody({ activation_code: code.plaintext }), {
      rateLimit: () => Promise.resolve(null),
    });
    expect(response.status).toBe(200);
  });
});

/* --- when the backend cannot answer ---------------------------------------------------------- */

describe("a backend that cannot answer says so without saying why", () => {
  it("turns a failing exchange into 503 unavailable and no token", async () => {
    const { code } = await sourceWithCode("Unreachable PC");
    const broken: ObserverDb = {
      ...db,
      /* A message that names the account, so the assertion below has something to catch. */
      activationConsume: () =>
        Promise.reject(new Error(`connection for ${ACCOUNT} refused by the pooler`)),
    };

    const response = await activate(requestBody({ activation_code: code.plaintext }), {
      db: broken,
    });
    const text = await response.text();

    expect(response.status).toBe(ACTIVATION_HTTP_STATUS.unavailable);
    expect(text.includes(ACCOUNT), "the thrown message named an account; the body does not").toBe(
      false,
    );
    expect(text.includes("obs."), "a credential was minted and goes nowhere").toBe(false);
    expect(
      (await activate(requestBody({ activation_code: code.plaintext }))).status,
      "and nothing was spent, so the operator need not issue another code",
    ).toBe(200);
  });

  it("mints nothing when the pepper is unusable", async () => {
    const { code } = await sourceWithCode("Unpeppered PC");

    const response = await activate(requestBody({ activation_code: code.plaintext }), {
      env: { VITEST: "1", [SOURCE_TOKEN_PEPPER]: ENV[SOURCE_TOKEN_PEPPER] },
    });

    expect(response.status).toBe(ACTIVATION_HTTP_STATUS.unavailable);
    expect(
      (await response.text()).includes(ACTIVATION_CODE_PEPPER),
      "the variable's name is a configuration detail, not a client's business",
    ).toBe(false);
    expect(
      (await activate(requestBody({ activation_code: code.plaintext }))).status,
      "and a misconfigured deployment spent nothing",
    ).toBe(200);
  });
});

/* --- the race ------------------------------------------------------------------------------- */

describe("one code, twenty-five simultaneous installations", () => {
  it("mints exactly one credential and answers everybody else identically", async () => {
    /**
     * HONEST LIMITATION: PGlite is a single connection.
     *
     * `Promise.all` over twenty-five handler calls does not produce twenty-five
     * concurrent transactions here — PGlite serialises them onto one backend,
     * so what this test drives is twenty-five interleaved-in-JavaScript,
     * serialised-in-Postgres exchanges. It cannot prove that hosted Postgres
     * resolves a genuine race correctly.
     *
     * What it does prove is the invariant that makes the hosted case follow:
     * `observer_activation_consume` decides and writes in ONE conditional
     * `update ... returning` guarded by `state = 'issued'`, so a second caller
     * matches no row whether it arrives a microsecond or a minute later. The
     * serialised case and the concurrent case differ only in who is made to
     * wait; the guard is identical, and PostgreSQL serialises writers on the
     * row anyway. `supabase/migrations/20260902093000` states the same
     * limitation over the same statement, and `audit-contract.test.ts:319`
     * records why a `Promise.all` against one handle is not on its own a
     * concurrency proof.
     */
    const { source, code } = await sourceWithCode("Contended PC");

    const responses = await Promise.all(
      Array.from({ length: 25 }, () => activate(requestBody({ activation_code: code.plaintext }))),
    );
    const answers = await Promise.all(responses.map(answerOf));

    const won = answers.filter((a) => a.status === 200);
    const lost = answers.filter((a) => a.status !== 200);

    expect(won, "exactly one installation activates").toHaveLength(1);
    expect(lost, "and twenty-four do not").toHaveLength(24);
    for (const answer of lost) {
      expect(answer.status).toBe(ACTIVATION_HTTP_STATUS.activation_failed);
      expect(answer.text, "the losers cannot tell they lost a race").toBe(lost[0]?.text);
    }

    const credentials = await pg.query<{ count: string }>(
      "select count(*)::text as count from observer.source_credentials where source_id = $1",
      [source],
    );
    expect(
      credentials.rows[0]?.count,
      "twenty-four tokens were minted in memory and exactly one was stored",
    ).toBe("1");

    const state = await pg.query<{ state: string }>(
      "select state from observer.activation_codes where selector = $1",
      [code.selector],
    );
    expect(state.rows[0]?.state).toBe("consumed");
  });
});
