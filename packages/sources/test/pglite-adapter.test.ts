import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FACADE_NAMES, readProjectEvents, type ObserverDb } from "../src/db";
import { pgliteDb, type SqlQuery } from "../src/pglite";
import {
  closeSuiteDatabases,
  closeTestDatabases,
  openDatabase,
  applyMigrations,
} from "../../../supabase/test/support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE ADAPTER, AGAINST THE SQL IT CLAIMS TO SPEAK.
 *
 * ## Why this file boots a Postgres instead of asserting on statement strings
 *
 * A test that checked `pgliteDb` emits `select * from public.observer_events_
 * append($1, $2::jsonb)` would pass forever, including on the day somebody
 * renames a facade, reorders its parameters, or changes a `returns table`
 * column. Every one of those is invisible to TypeScript — an RPC name is a
 * string and a `returns table` is not a type — and every one of them is a
 * production incident rather than a compile error.
 *
 * So this file applies the real migrations to a real Postgres and drives every
 * method of the port through them. What it proves is not that the adapter is
 * internally consistent but that the fourteen function names it calls, in the
 * argument orders it calls them, are functions that exist and do what the port
 * says they do.
 *
 * ## Every secret below is obviously synthetic
 *
 * The selectors and verifiers are English sentences with hyphens in them. They
 * are not the shape `issueActivationCode` produces and could not be mistaken
 * for a real value in a dump or a grep. The one place a verifier is asserted
 * on, it is compared against the constant this file supplied rather than
 * printed — the port is explicit that a verifier must not reach a snapshot, and
 * a comparison is not a snapshot.
 */

/*
 * All four migrations of the source spine, named rather than globbed.
 *
 * Every one of them is needed: the port's fourteen facades are spread across
 * the last three, and the first creates the `observer_ingest_owner` role and
 * the two tables the rest hang off. Listed explicitly, as
 * `analytics-events.test.ts` does, so that a migration added later joins this
 * fixture by somebody's decision rather than by matching a pattern.
 */
const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
  "20260917100000_observer_events_for_project.sql",
  "20260918100000_observer_project_directory.sql",
];

const ACCOUNT_A = "acct_northgate";
const ACCOUNT_B = "acct_riverside";

/** Obviously synthetic. Not the shape `issueActivationCode` mints. */
const CODE_SELECTOR = "selector-for-a-code-that-only-exists-in-this-test";
const CODE_VERIFIER = "verifier-for-a-code-that-only-exists-in-this-test";
const CRED_SELECTOR = "selector-for-a-credential-that-only-exists-in-this-test";
const CRED_VERIFIER = "verifier-for-a-credential-that-only-exists-in-this-test";

/*
 * PGlite's type, without importing PGlite.
 *
 * `@observer/sources` must not gain a dependency on a WASM Postgres, not even a
 * type-only one, because a type-only import still has to resolve and the
 * package's own `node_modules` has no reason to contain it. The harness already
 * names the type in its signature, so borrowing it costs nothing.
 */
type Database = Awaited<ReturnType<typeof openDatabase>>;

let pg: Database;
let db: ObserverDb;

/**
 * Every statement the adapter issued since the last test began.
 *
 * This exists for one assertion — that a 200-event batch is a single round trip
 * with a single `jsonb` parameter — and is cleared before each test so that a
 * count is never inherited from the case before it.
 */
let issued: { readonly sql: string; readonly params: readonly unknown[] }[] = [];

const query: SqlQuery = async (sql, params) => {
  issued.push({ sql, params });
  return pg.query(sql, [...params]);
};

beforeAll(async () => {
  pg = await openDatabase("suite", "hosted");
  await applyMigrations(pg, FILES);
  db = pgliteDb(query);
});

beforeEach(() => {
  issued = [];
});

/** An hour out, in the millisecond ISO-8601 the port's `Instant` is. */
function inAnHour(): string {
  return new Date(Date.now() + 3_600_000).toISOString();
}

let minted = 0;
/** Canonical lowercase 8-4-4-4-12, which is all the contract requires. */
function eventId(): string {
  minted += 1;
  return `6f1c9f6e-2c7a-0a4e-9b31-${minted.toString(16).padStart(12, "0")}`;
}

function event(id: string = eventId()): Record<string, unknown> {
  return {
    event_id: id,
    event_name: "diagnostic.test",
    schema_version: 1,
    occurred_at: "2026-09-01T15:30:00.124Z",
    session_id: null,
    sequence: null,
    app: {
      version: "1.0.0",
      plugin: "0.2.0",
      build_id: "BUILD-2026-09-01",
      environment: "development",
    },
    properties: {},
  };
}

/** A project and a source under it, which almost every case needs first. */
async function makeSource(account: string, label: string): Promise<string> {
  const project = await db.projectCreate({ account, name: `P ${label}`, slug: null });
  return db.sourceCreate({
    account,
    project,
    type: "showroom_ue5",
    environment: "production",
    label,
  });
}

describe("the project directory round-trips through the adapter", () => {
  it("makes a developer, completes a project, and reads both back", async () => {
    const tenant = await db.tenantCreate({
      account: ACCOUNT_A,
      name: "Alder Homes",
      slug: "alder-homes-adapter",
    });
    expect(tenant, "the scalar uuid").toMatch(/^[0-9a-f-]{36}$/);

    const project = await db.projectCreate({ account: ACCOUNT_A, name: "Alder Court", slug: null });
    expect(
      await db.projectSettingsSet({
        account: ACCOUNT_A,
        project,
        tenant,
        slug: "alder-court",
        currency: "EUR",
        locale: "sk-SK",
        timeZone: "Europe/Bratislava",
      }),
      "seven arguments in the facade's order",
    ).toBe(true);

    const row = (await db.projectDirectory(ACCOUNT_A)).find((r) => r.project_id === project);
    expect(row).toMatchObject({
      name: "Alder Court",
      slug: "alder-court",
      tenant_id: tenant,
      tenant_name: "Alder Homes",
      tenant_slug: "alder-homes-adapter",
      currency: "EUR",
      locale: "sk-SK",
      time_zone: "Europe/Bratislava",
    });

    const listed = (await db.tenantsForAccount(ACCOUNT_A)).find((t) => t.tenant_id === tenant);
    expect(listed?.slug).toBe("alder-homes-adapter");
    expect(Number(listed?.project_count)).toBe(1);

    expect(
      (await db.projectDirectory(ACCOUNT_B)).some((r) => r.project_id === project),
      "another account's directory does not hold it",
    ).toBe(false);
  });

  it("grants, lists, answers for the viewer, and revokes", async () => {
    const project = await db.projectCreate({ account: ACCOUNT_A, name: "P viewers", slug: null });
    const grant = { account: ACCOUNT_A, project, viewer: "acct_petra", grantedBy: "acct_admin" };

    expect(await db.projectViewerGrant(grant)).toBe(true);
    expect(await db.projectViewers({ account: ACCOUNT_A, project })).toMatchObject([
      { viewer_account: "acct_petra", granted_by: "acct_admin" },
    ]);
    expect(await db.projectsForViewer({ account: ACCOUNT_A, viewer: "acct_petra" })).toContainEqual(
      {
        project_id: project,
      },
    );
    expect(
      await db.projectsForViewer({ account: ACCOUNT_B, viewer: "acct_petra" }),
      "asked of another account, the same person holds nothing",
    ).toEqual([]);

    expect(
      await db.projectViewerRevoke({
        account: ACCOUNT_A,
        project,
        viewer: "acct_petra",
        revokedBy: "acct_admin",
      }),
    ).toBe(true);
    expect(await db.projectViewers({ account: ACCOUNT_A, project })).toEqual([]);
  });

  it("names a presenter, takes a showroom's roster as one jsonb, and lists both", async () => {
    const project = await db.projectCreate({ account: ACCOUNT_A, name: "P agents", slug: null });
    const source = await db.sourceCreate({
      account: ACCOUNT_A,
      project,
      type: "showroom_ue5",
      environment: "production",
      label: "Agents PC",
    });

    issued = [];
    expect(
      await db.sourceAgentsReport({
        source,
        agents: [
          { agent_id: "AG-1", display_name: "Monika" },
          { agent_id: "AG-2", display_name: "Tomas" },
        ],
      }),
      "a count, not a row",
    ).toBe(2);
    expect(issued).toHaveLength(1);
    expect(issued[0]?.params[1], "one jsonb parameter, serialised here").toBe(
      JSON.stringify([
        { agent_id: "AG-1", display_name: "Monika" },
        { agent_id: "AG-2", display_name: "Tomas" },
      ]),
    );

    expect(
      await db.projectAgentNameSet({
        account: ACCOUNT_A,
        project,
        agent: "AG-1",
        name: "Monika Kováčová",
      }),
    ).toBe(true);
    expect(
      await db.projectAgentNameSet({
        account: ACCOUNT_B,
        project,
        agent: "AG-1",
        name: "Somebody else's word",
      }),
      "another account cannot name this project's people",
    ).toBe(false);

    const agents = await db.projectAgents({ account: ACCOUNT_A, project });
    expect(agents.map((a) => [a.agent_ref, a.display_name, a.named_by]).sort()).toEqual([
      ["AG-1", "Monika Kováčová", "administration"],
      ["AG-2", "Tomas", "showroom"],
    ]);
  });
});

describe("the control plane round-trips through the adapter", () => {
  it("creates a project, creates a source under it, and reads the source back", async () => {
    const project = await db.projectCreate({
      account: ACCOUNT_A,
      name: "Northgate atrium",
      slug: null,
    });
    expect(project, "the scalar uuid, not a row wrapping it").toMatch(/^[0-9a-f-]{36}$/);

    const source = await db.sourceCreate({
      account: ACCOUNT_A,
      project,
      type: "showroom_ue5",
      environment: "production",
      label: "Atrium PC",
    });
    expect(source).toMatch(/^[0-9a-f-]{36}$/);

    const status = await db.sourceStatus({ account: ACCOUNT_A, project });
    expect(status).toHaveLength(1);
    expect(status[0]?.source_id).toBe(source);
    expect(status[0]?.project_id).toBe(project);
    expect(status[0]?.display_label).toBe("Atrium PC");
    expect(status[0]?.environment).toBe("production");
    expect(status[0]?.state).toBe("active");
    expect(status[0]?.last_seen_at, "nothing has been heard from it yet").toBeNull();
    expect(
      status[0]?.created_at,
      "a string, because the facade already formatted it and the adapter must not reparse",
    ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("moves a source's state and reports whether anything moved", async () => {
    const project = await db.projectCreate({ account: ACCOUNT_A, name: "P state", slug: null });
    const source = await db.sourceCreate({
      account: ACCOUNT_A,
      project,
      type: "showroom_ue5",
      environment: "production",
      label: "State PC",
    });

    expect(await db.sourceSetState({ account: ACCOUNT_A, source, state: "suspended" })).toBe(true);
    const [row] = await db.sourceStatus({ account: ACCOUNT_A, project });
    expect(row?.state).toBe("suspended");
  });

  it("answers false for another account's source rather than saying it exists", async () => {
    const source = await makeSource(ACCOUNT_A, "Foreign PC");
    expect(
      await db.sourceSetState({ account: ACCOUNT_B, source, state: "suspended" }),
      "indistinguishable from a source that was never created",
    ).toBe(false);
  });

  it("returns an empty list for an account that owns none of the project", async () => {
    const project = await db.projectCreate({ account: ACCOUNT_A, name: "P scoped", slug: null });
    await db.sourceCreate({
      account: ACCOUNT_A,
      project,
      type: "showroom_ue5",
      environment: "production",
      label: "Scoped PC",
    });
    expect(await db.sourceStatus({ account: ACCOUNT_B, project })).toHaveLength(0);
  });
});

describe("an activation code is spent exactly once", () => {
  it("issues a code and exchanges it for the source's identity", async () => {
    const source = await makeSource(ACCOUNT_A, "Activation PC");

    expect(
      await db.activationIssue({
        account: ACCOUNT_A,
        source,
        selector: CODE_SELECTOR,
        verifier: CODE_VERIFIER,
        purpose: "activation",
        expiresAt: inAnHour(),
      }),
    ).toBe(true);

    const claim = await db.activationConsume({
      codeSelector: CODE_SELECTOR,
      codeVerifier: CODE_VERIFIER,
      credentialSelector: CRED_SELECTOR,
      credentialVerifier: CRED_VERIFIER,
      credentialExpiresAt: null,
    });

    expect(claim).not.toBeNull();
    expect(claim?.source_id).toBe(source);
    expect(claim?.account_id, "the service needs it; the response must not carry it").toBe(
      ACCOUNT_A,
    );
    expect(claim?.project_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(claim?.display_label).toBe("Activation PC");
    expect(claim?.purpose).toBe("activation");
  });

  it("returns null the second time, rather than throwing", async () => {
    /*
     * Null and not an exception, because the endpoint above this must answer
     * one indistinguishable failure for every reason a code can fail. An
     * adapter that threw here would push the caller into a try/catch whose
     * shape leaks which branch it took.
     */
    const again = await db.activationConsume({
      codeSelector: CODE_SELECTOR,
      codeVerifier: CODE_VERIFIER,
      credentialSelector: "selector-for-a-second-credential-that-must-never-exist",
      credentialVerifier: "verifier-for-a-second-credential-that-must-never-exist",
      credentialExpiresAt: null,
    });
    expect(again).toBeNull();
  });

  it("returns null for a selector nobody ever issued", async () => {
    expect(
      await db.activationConsume({
        codeSelector: "selector-for-a-code-that-was-never-issued",
        codeVerifier: "verifier-for-a-code-that-was-never-issued",
        credentialSelector: "selector-that-must-not-be-written",
        credentialVerifier: "verifier-that-must-not-be-written",
        credentialExpiresAt: null,
      }),
    ).toBeNull();
  });
});

describe("a credential resolves by selector and revokes by owner", () => {
  it("resolves the credential the exchange minted, with the source it grants", async () => {
    const resolved = await db.credentialResolve(CRED_SELECTOR);
    expect(resolved).not.toBeNull();
    /*
     * Compared against the constant this file supplied, never printed. Proving
     * the verifier survives the round trip is the only way to show the adapter
     * did not transpose two adjacent text columns — and a transposed verifier
     * mints a credential nobody can ever present.
     */
    expect(resolved?.verifier === CRED_VERIFIER, "the stored verifier, unaltered").toBe(true);
    expect(resolved?.credential_state).toBe("active");
    expect(resolved?.source_state).toBe("active");
    expect(resolved?.account_id).toBe(ACCOUNT_A);
    expect(resolved?.display_label).toBe("Activation PC");
    expect(resolved?.expires_at, "the exchange asked for no expiry").toBeNull();
  });

  it("returns null for a selector that resolves to nothing", async () => {
    expect(await db.credentialResolve("selector-that-was-never-issued-to-anybody")).toBeNull();
  });

  it("reports the credential's lifecycle without its verifier", async () => {
    const resolved = await db.credentialResolve(CRED_SELECTOR);
    const source = resolved?.source_id ?? "";

    const before = await db.credentialStatus({ account: ACCOUNT_A, source });
    expect(before?.state).toBe("active");
    expect(before?.revoked_at).toBeNull();
    expect(
      Object.keys(before ?? {}),
      "no door anywhere returns a verifier to an operator surface",
    ).not.toContain("verifier");

    expect(await db.credentialRevoke({ account: ACCOUNT_A, source })).toBe(true);

    const after = await db.credentialStatus({ account: ACCOUNT_A, source });
    expect(after?.state).toBe("revoked");
    expect(after?.revoked_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(
      (await db.credentialResolve(CRED_SELECTOR))?.credential_state,
      "and the ingestion path sees the change immediately",
    ).toBe("revoked");

    expect(
      await db.credentialRevoke({ account: ACCOUNT_A, source }),
      "there is no longer an active credential to revoke",
    ).toBe(false);
  });

  it("returns null when the source has never held a credential", async () => {
    const source = await makeSource(ACCOUNT_A, "Never credentialled PC");
    expect(await db.credentialStatus({ account: ACCOUNT_A, source })).toBeNull();
  });
});

describe("a batch of events keeps the order it was submitted in", () => {
  it("returns one row per event, numbered from one, all accepted", async () => {
    const source = await makeSource(ACCOUNT_A, "Batch PC");
    const events = [event(), event(), event()];

    const results = await db.eventsAppend({ source, events });
    expect(results.map((r) => r.ordinal)).toEqual([1, 2, 3]);
    expect(results.map((r) => r.event_id)).toEqual(events.map((e) => e["event_id"]));
    expect(results.every((r) => r.outcome === "accepted")).toBe(true);
  });

  it("accepts an event once and calls the replay a duplicate", async () => {
    const source = await makeSource(ACCOUNT_A, "Replay PC");
    const once = event();

    expect((await db.eventsAppend({ source, events: [once] }))[0]?.outcome).toBe("accepted");
    expect((await db.eventsAppend({ source, events: [once] }))[0]?.outcome).toBe("duplicate");
  });

  it("sends a 200-event batch as ONE statement with ONE jsonb parameter", async () => {
    /*
     * THE ASSERTION THAT WOULD FAIL FIRST if somebody expanded the batch into
     * one placeholder per event. That version works at three events and breaks
     * in three ways at scale: the statement text differs for every batch size
     * so no plan is ever reused, the parameter count walks towards Postgres's
     * 65535 ceiling where it surfaces as a protocol error rather than a
     * rejected request, and the port's "one round trip per method" promise —
     * the thing that makes PGlite a fair stand-in for PostgREST — stops being
     * true.
     */
    const source = await makeSource(ACCOUNT_A, "Round trip PC");
    const events = Array.from({ length: 200 }, () => event());

    issued = [];
    const results = await db.eventsAppend({ source, events });

    expect(issued, "one round trip, whatever the batch size").toHaveLength(1);
    expect(issued[0]?.params, "the source, and the whole batch as one value").toHaveLength(2);
    expect(issued[0]?.sql, "no third placeholder was ever generated").not.toMatch(/\$3/);
    expect(typeof issued[0]?.params[1], "serialised once, by the adapter").toBe("string");

    expect(results).toHaveLength(200);
    expect(
      results.map((r) => r.ordinal),
      "1..N, in submission order",
    ).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(results.map((r) => r.event_id)).toEqual(events.map((e) => e["event_id"]));
  });

  it("stores nothing for an empty batch and returns no rows", async () => {
    const source = await makeSource(ACCOUNT_A, "Empty PC");
    expect(await db.eventsAppend({ source, events: [] })).toHaveLength(0);
  });

  it("reads a source's events back, scoped to the owning account", async () => {
    const source = await makeSource(ACCOUNT_A, "Readback PC");
    const events = [event(), event()];
    await db.eventsAppend({ source, events });

    const mine = await db.eventsForSource({ account: ACCOUNT_A, source, limit: 100 });
    expect(mine).toHaveLength(2);
    expect(mine.map((e) => e.event_id).sort()).toEqual(
      events.map((e) => e["event_id"] as string).sort(),
    );
    expect(mine[0]?.event_name).toBe("diagnostic.test");
    expect(mine[0]?.schema_version).toBe(1);
    expect(mine[0]?.account_id).toBe(ACCOUNT_A);
    expect(mine[0]?.properties, "jsonb arrives as an object, not as text").toEqual({});
    expect(mine[0]?.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(
      mine[0]?.app_environment,
      "the build's own claim, kept beside the derived identity",
    ).toBe("development");

    expect(
      await db.eventsForSource({ account: ACCOUNT_B, source, limit: 100 }),
      "an empty result, not an error",
    ).toHaveLength(0);
  });

  it("reads a project's session events back with the envelope's identity", async () => {
    const project = await db.projectCreate({ account: ACCOUNT_A, name: "P fold", slug: null });
    const source = await db.sourceCreate({
      account: ACCOUNT_A,
      project,
      type: "showroom_ue5",
      environment: "production",
      label: "Fold PC",
    });
    const session = "7a1c9f6e-2c7a-4a4e-9b31-0000000000aa";
    const inSession = (sequence: number, name: string, extra: Record<string, unknown> = {}) => ({
      ...event(),
      event_name: name,
      session_id: session,
      sequence,
      agent_id: "agent-guid-from-the-plugin",
      visitor_subject: "vis_07",
      ...extra,
    });

    /* Appended out of order, with a diagnostic and a session-less event beside them. */
    await db.eventsAppend({
      source,
      events: [
        inSession(2, "unit.view.started", {
          entity: { type: "unit", id: "A-204" },
          properties: { unit_id: "A-204" },
        }),
        inSession(1, "session.started"),
        inSession(3, "diagnostic.test"),
        event(),
      ],
    });

    const rows = await db.eventsForProject({
      account: ACCOUNT_A,
      project,
      after: null,
      limit: 100,
    });
    expect(
      rows.map((r) => r.event_name).sort(),
      "no diagnostic, nothing without a session; the fold orders by sequence, not this read",
    ).toEqual(["session.started", "unit.view.started"]);
    const opened = rows.find((r) => r.event_name === "unit.view.started");
    expect(opened?.session_id).toBe(session);
    expect(opened?.sequence).toBe(2);
    expect(opened?.source_id).toBe(source);
    expect(opened?.agent_id).toBe("agent-guid-from-the-plugin");
    expect(opened?.visitor_subject).toBe("vis_07");
    expect(opened?.entity_type).toBe("unit");
    expect(opened?.entity_id).toBe("A-204");
    expect(opened?.properties).toEqual({ unit_id: "A-204" });
    expect(opened?.occurred_at).toBe("2026-09-01T15:30:00.124Z");

    /*
     * THE CURSOR IS STRICT AND UNIQUE. Both rows came in one batch and share an
     * `ingested_at` to the microsecond, which is exactly the case a timestamp
     * cursor gets wrong: after the first row there must be one row left, not two
     * and not none.
     */
    const [first, second] = rows;
    expect(first?.page_cursor, "microseconds, which the instants above do not carry").toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\|[0-9a-f-]{36}\|[0-9a-f-]{36}$/,
    );
    const rest = await db.eventsForProject({
      account: ACCOUNT_A,
      project,
      after: first?.page_cursor ?? null,
      limit: 100,
    });
    expect(rest.map((r) => r.event_id)).toEqual([second?.event_id]);
    expect(
      await db.eventsForProject({
        account: ACCOUNT_A,
        project,
        after: second?.page_cursor ?? null,
        limit: 100,
      }),
      "nothing after the last row",
    ).toHaveLength(0);
    expect(
      await db.eventsForProject({ account: ACCOUNT_B, project, after: null, limit: 100 }),
      "another account reads nothing, not an error",
    ).toHaveLength(0);
  });
});

describe("a whole project is read a page at a time", () => {
  /*
   * THE CASE THE HOSTED DATABASE WOULD HAVE LOST. PostgREST cuts a response at
   * its `max-rows` and says nothing, so the facade never answers more than a
   * thousand rows and the read pages. 2300 events is three pages and an empty
   * one; every event must come back exactly once, in order, with no help from a
   * de-duplication step.
   */
  it("returns every event once across page boundaries", async () => {
    const project = await db.projectCreate({ account: ACCOUNT_A, name: "P paged", slug: null });
    const source = await db.sourceCreate({
      account: ACCOUNT_A,
      project,
      type: "showroom_ue5",
      environment: "production",
      label: "Paged PC",
    });
    const session = "7a1c9f6e-2c7a-4a4e-9b31-0000000000cc";
    const sent: string[] = [];
    let sequence = 0;
    /* Twelve batches, as a plugin would send them: never more than two hundred at once. */
    for (let batch = 0; batch < 12; batch += 1) {
      const size = batch === 11 ? 100 : 200;
      const events = Array.from({ length: size }, () => {
        sequence += 1;
        const id = eventId();
        sent.push(id);
        return { ...event(id), event_name: "screenshot.created", session_id: session, sequence };
      });
      await db.eventsAppend({ source, events });
    }
    expect(sent).toHaveLength(2300);

    const capped = await db.eventsForProject({
      account: ACCOUNT_A,
      project,
      after: null,
      limit: 50_000,
    });
    expect(
      capped,
      "one call never answers more than a page, whatever it is asked for",
    ).toHaveLength(1000);

    issued = [];
    const whole = await readProjectEvents(db, { account: ACCOUNT_A, project });
    expect(whole.complete).toBe(true);
    expect(whole.events, "no row twice: the list is as long as what was sent").toHaveLength(2300);
    expect(whole.events.map((e) => e.event_id).sort()).toEqual([...sent].sort());
    expect(issued, "three pages of rows and the empty one that ends the read").toHaveLength(4);

    /*
     * A SERVER THAT CUTS SHORTER THAN IT WAS ASKED. An operator may set
     * PostgREST's `max-rows` below a thousand; a page of 300 is then a FULL page,
     * and a reader that stopped on a short page would call 300 events the whole
     * project.
     */
    const cut = await readProjectEvents(
      {
        eventsForProject: async (input) => (await db.eventsForProject(input)).slice(0, 300),
      },
      { account: ACCOUNT_A, project },
    );
    expect(cut.complete).toBe(true);
    expect(cut.events).toHaveLength(2300);

    const part = await readProjectEvents(db, { account: ACCOUNT_A, project, maxPages: 1 });
    expect(part.complete, "a read that stopped early says so").toBe(false);
    expect(part.events).toHaveLength(1000);
  });
});

describe("a source's operational state is written and read", () => {
  it("records a heartbeat's facts and surfaces them on the operations row", async () => {
    const project = await db.projectCreate({ account: ACCOUNT_A, name: "P ops", slug: null });
    const source = await db.sourceCreate({
      account: ACCOUNT_A,
      project,
      type: "showroom_ue5",
      environment: "production",
      label: "Ops PC",
    });

    expect(
      await db.heartbeatRecord({
        source,
        facts: {
          app_version: "1.4.2",
          plugin_version: "0.2.0",
          build_id: "BUILD-2026-09-02",
          reported_environment: "production",
          queue_event_count: 12,
          queue_bytes_used: 4096,
          queue_bytes_ceiling: 1_048_576,
        },
      }),
    ).toBe(true);

    const [row] = await db.sourceOperations({ account: ACCOUNT_A, project });
    expect(row?.source_id).toBe(source);
    expect(row?.last_heartbeat_at).not.toBeNull();
    expect(row?.observed_app_version).toBe("1.4.2");
    expect(row?.observed_build_id).toBe("BUILD-2026-09-02");
    expect(
      row?.queue_bytes_used,
      "the two byte counts are adjacent integers and must not transpose",
    ).toBe(4096);
    expect(row?.queue_bytes_ceiling).toBe(1_048_576);
    expect(
      row?.ingestion_verified_at,
      "reachable is not the same as having proved the whole path",
    ).toBeNull();
  });

  it("marks ingestion verified separately from being heard from", async () => {
    const project = await db.projectCreate({ account: ACCOUNT_A, name: "P verified", slug: null });
    const source = await db.sourceCreate({
      account: ACCOUNT_A,
      project,
      type: "showroom_ue5",
      environment: "production",
      label: "Verified PC",
    });
    await db.eventsAppend({ source, events: [event()] });

    expect(await db.ingestionVerified({ source })).toBe(true);

    const [row] = await db.sourceOperations({ account: ACCOUNT_A, project });
    expect(row?.ingestion_verified_at).not.toBeNull();
  });

  it("reads every project's sources when no project is named", async () => {
    const rows = await db.sourceOperations({ account: ACCOUNT_A, project: null });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => typeof r.source_id === "string")).toBe(true);
  });
});

describe("the adapter implements the whole port and nothing else", () => {
  /**
   * The port's methods, written out so a reviewer can compare two lists.
   *
   * ## Why the interface is not enough
   *
   * `ObserverDb` is erased at compile time. It catches a method missing from an
   * object literal in *this* implementation's file, and that is the whole of
   * what it catches: the port's own docblock promises that `pgliteDb` and
   * `postgrestDb` expose the same keys, and there is no type that can be asked
   * that question at run time. An adapter assembled mechanically — `Object.
   * fromEntries` over a name list is the obvious way to write the PostgREST
   * one — satisfies the interface with a `undefined` sitting where a method
   * should be, because `undefined` is assignable to nothing but the cast that
   * built it was `as ObserverDb`.
   *
   * The failure this defends against is also the quietest one available: a
   * method that is never called in a test is a method whose absence nobody
   * notices until the first request that needs it.
   */
  const PORT_METHODS = [
    "activationConsume",
    "activationIssue",
    "credentialResolve",
    "credentialRevoke",
    "credentialStatus",
    "eventsAppend",
    "eventsForProject",
    "eventsForSource",
    "heartbeatRecord",
    "ingestionVerified",
    "projectAgentNameSet",
    "projectAgents",
    "projectCreate",
    "projectDirectory",
    "projectSettingsSet",
    "projectViewerGrant",
    "projectViewerRevoke",
    "projectViewers",
    "projectsForAccount",
    "projectsForViewer",
    "sourceAgentsReport",
    "sourceCreate",
    "sourceOperations",
    "sourceSetState",
    "sourceStatus",
    "tenantCreate",
    "tenantsForAccount",
  ] as const;

  /* No database: this asks what the object has, not what the object can do. */
  const adapter = pgliteDb(() => Promise.resolve({ rows: [] }));

  it("exposes exactly the methods the port declares", () => {
    expect(Object.keys(adapter).sort()).toEqual([...PORT_METHODS]);
  });

  it("has a callable function behind every one of them", () => {
    for (const name of PORT_METHODS) {
      expect(typeof adapter[name], name).toBe("function");
    }
  });

  it("has one method for every facade the port names", () => {
    /*
     * Not a coincidence worth leaving unasserted: the port is wide precisely so
     * that adding a database entry point is a visible act. A facade added to
     * `FACADE_NAMES` with no method here is an entry point nothing can reach;
     * a method with no facade is a 404 at the first real request.
     */
    expect(PORT_METHODS).toHaveLength(FACADE_NAMES.length);
  });
});
