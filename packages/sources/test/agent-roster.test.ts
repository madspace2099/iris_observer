import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  AGENT_ROSTER_MAX_ENTRIES,
  AgentRosterResponseSchema,
  OBSERVER_ROUTES,
} from "@observer/contracts/ue5";

import { AGENTS_MAX_BODY_BYTES, handleAgents } from "../src/agents";
import type { ObserverDb } from "../src/db";
import type { HandlerDeps } from "../src/http";
import { pgliteDb, type SqlQuery } from "../src/pglite";
import { issueActivationCode, issueSourceToken, type EnvSource } from "../src/secrets";
import {
  closeSuiteDatabases,
  closeTestDatabases,
  openDatabase,
  applyMigrations,
} from "../../../supabase/test/support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE PRESENTER ROSTER ENDPOINT, AGAINST A REAL POSTGRES.
 *
 * The claims are about rows, as they are for the heartbeat: a name reaches the
 * project's agent record, an administrator's name survives a report, and no
 * analytics row appears. Every credential is minted through the real activation
 * exchange, and the peppers are synthetic phrases `describePepper` accepts only
 * because `VITEST` is set.
 */

/* Named rather than globbed: the spine, the credentials, the event table whose rows are counted, the operations the facades join, and the directory that holds the names. */
const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
  "20260902120000_observer_instant_precision_and_ingest_mark.sql",
  "20260902130000_observer_credential_resolve_precision.sql",
  "20260918100000_observer_project_directory.sql",
];

const ENV: EnvSource = Object.freeze({
  VITEST: "1",
  OBSERVER_ACTIVATION_CODE_PEPPER: "activation-code-pepper-for-this-test-file-only",
  OBSERVER_SOURCE_TOKEN_PEPPER: "source-token-pepper-for-this-test-file-only-and-nothing-else",
});

/* The real clock: an activation code's expiry is compared against the database's own now(). */
const NOW = new Date();

const JANA = "3f6c1f0a-7b1e-4f62-9d55-1c2a4e8b9d10";
const TOMAS = "9a2d7c44-0e3b-4c1f-8a67-5b9e2f1d0c33";

type Database = Awaited<ReturnType<typeof openDatabase>>;

let pg: Database;
let db: ObserverDb;
let deps: HandlerDeps;

const query: SqlQuery = (sql, params) => pg.query(sql, [...params]);

beforeAll(async () => {
  pg = await openDatabase("suite", "hosted");
  await applyMigrations(pg, FILES);
  db = pgliteDb(query);
  deps = { db, env: ENV, now: () => NOW };
});

let accounts = 0;

interface Activated {
  readonly account: string;
  readonly projectId: string;
  readonly sourceId: string;
  readonly token: string;
}

/** A source that has been through the real activation exchange, in an account of its own. */
async function activatedSource(): Promise<Activated> {
  accounts += 1;
  const account = `acct_roster_${String(accounts)}`;
  const projectId = await db.projectCreate({ account, name: `Project for ${account}`, slug: null });
  const sourceId = await db.sourceCreate({
    account,
    project: projectId,
    type: "showroom_ue5",
    environment: "production",
    label: "Showroom terminal",
  });

  const code = issueActivationCode(ENV);
  await db.activationIssue({
    account,
    source: sourceId,
    selector: code.selector,
    verifier: code.verifier,
    purpose: "activation",
    expiresAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
  });
  const credential = issueSourceToken(ENV);
  const consumed = await db.activationConsume({
    codeSelector: code.selector,
    codeVerifier: code.verifier,
    credentialSelector: credential.selector,
    credentialVerifier: credential.verifier,
    credentialExpiresAt: null,
  });
  if (consumed === null) throw new Error("the activation fixture did not mint a credential");

  return { account, projectId, sourceId, token: credential.plaintext };
}

function roster(agents: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { sent_at: NOW.toISOString(), agents, ...overrides };
}

function rosterRequest(
  payload: unknown,
  options: { readonly token?: string; readonly method?: string; readonly body?: string } = {},
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token !== undefined) headers["authorization"] = `Bearer ${options.token}`;
  const method = options.method ?? "POST";
  return new Request(`https://observer.test${OBSERVER_ROUTES.agents}`, {
    method,
    headers,
    body: method === "POST" ? (options.body ?? JSON.stringify(payload)) : undefined,
  });
}

/** The names the project holds, by the reference a showroom sends. */
async function namesOf(source: Activated): Promise<Record<string, string | null>> {
  const rows = await db.projectAgents({ account: source.account, project: source.projectId });
  return Object.fromEntries(rows.map((row) => [row.agent_ref, row.display_name]));
}

async function analyticsEventCount(): Promise<number> {
  const result = await pg.query<{ readonly n: number }>(
    "select count(*)::int as n from observer.analytics_events",
  );
  return result.rows[0]?.n ?? -1;
}

describe("a roster from an activated source", () => {
  it("records each name against the source's own project, and creates no analytics fact", async () => {
    const source = await activatedSource();
    const before = await analyticsEventCount();

    const response = await handleAgents(
      rosterRequest(
        roster([
          { agent_id: JANA, display_name: "Jana Horváthová" },
          { agent_id: TOMAS, display_name: "Tomáš Kováč" },
        ]),
        { token: source.token },
      ),
      deps,
    );

    expect(response.status).toBe(200);
    const body = AgentRosterResponseSchema.parse(await response.json());
    expect(body.recorded).toBe(2);
    expect(await namesOf(source)).toEqual({ [JANA]: "Jana Horváthová", [TOMAS]: "Tomáš Kováč" });
    expect(await analyticsEventCount(), "a name is not an event").toBe(before);
  });

  it("takes a corrected spelling from the showroom on the next report", async () => {
    const source = await activatedSource();
    const send = (name: string) =>
      handleAgents(
        rosterRequest(roster([{ agent_id: JANA, display_name: name }]), { token: source.token }),
        deps,
      );

    await send("Jana Horvathova");
    await send("Jana Horváthová");

    expect(await namesOf(source)).toEqual({ [JANA]: "Jana Horváthová" });
  });

  it("keeps a name an administrator set, and says it recorded one fewer", async () => {
    const source = await activatedSource();
    await db.projectAgentNameSet({
      account: source.account,
      project: source.projectId,
      agent: JANA,
      name: "Jana H. (team lead)",
    });

    const response = await handleAgents(
      rosterRequest(
        roster([
          { agent_id: JANA, display_name: "Jana Horváthová" },
          { agent_id: TOMAS, display_name: "Tomáš Kováč" },
        ]),
        { token: source.token },
      ),
      deps,
    );

    expect(((await response.json()) as { recorded: number }).recorded).toBe(1);
    expect(await namesOf(source)).toEqual({
      [JANA]: "Jana H. (team lead)",
      [TOMAS]: "Tomáš Kováč",
    });
  });

  it("cannot name a presenter in another project: the project comes from the credential", async () => {
    const mine = await activatedSource();
    const theirs = await activatedSource();

    await handleAgents(
      rosterRequest(roster([{ agent_id: JANA, display_name: "Jana Horváthová" }]), {
        token: mine.token,
      }),
      deps,
    );

    expect(await namesOf(theirs)).toEqual({});
  });
});

describe("a roster that must be refused", () => {
  it("answers 401 with no credential, and stores nothing", async () => {
    const source = await activatedSource();
    const response = await handleAgents(
      rosterRequest(roster([{ agent_id: JANA, display_name: "Jana Horváthová" }])),
      deps,
    );
    expect(response.status).toBe(401);
    expect(await namesOf(source)).toEqual({});
  });

  it("refuses anything beyond a reference and a name, without repeating what was sent", async () => {
    const source = await activatedSource();
    const response = await handleAgents(
      rosterRequest(
        roster([
          { agent_id: JANA, display_name: "Jana Horváthová", email: "jana@example.invalid" },
        ]),
        { token: source.token },
      ),
      deps,
    );

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain("malformed_request");
    expect(text, "a refusal never echoes a person's details").not.toContain("jana@");
    expect(text).not.toContain("Horváthová");
    expect(await namesOf(source)).toEqual({});
  });

  it.each([
    ["a blank name", [{ agent_id: JANA, display_name: "   " }]],
    ["a name with a line break in it", [{ agent_id: JANA, display_name: "Jana\nHorváthová" }]],
    ["a name longer than 120 characters", [{ agent_id: JANA, display_name: "J".repeat(121) }]],
    ["an empty roster", []],
    [
      "more presenters than one report may name",
      Array.from({ length: AGENT_ROSTER_MAX_ENTRIES + 1 }, (_, i) => ({
        agent_id: `agent-${String(i)}`,
        display_name: `Presenter ${String(i)}`,
      })),
    ],
  ])("answers 400 to %s", async (_label, agents) => {
    const source = await activatedSource();
    const response = await handleAgents(
      rosterRequest(roster(agents), { token: source.token }),
      deps,
    );
    expect(response.status).toBe(400);
  });

  it("answers 400 to a body over the ceiling, and to anything but POST", async () => {
    const source = await activatedSource();
    const oversized = await handleAgents(
      rosterRequest(null, { token: source.token, body: "x".repeat(AGENTS_MAX_BODY_BYTES + 1) }),
      deps,
    );
    expect(oversized.status).toBe(400);

    const get = await handleAgents(
      rosterRequest(null, { token: source.token, method: "GET" }),
      deps,
    );
    expect(get.status).toBe(400);
  });

  it("fits a roster at every limit of the schema under the byte ceiling", () => {
    /* Three bytes to a character is the most plain UTF-8 spends on one UTF-16 unit. */
    const largest = roster(
      Array.from({ length: AGENT_ROSTER_MAX_ENTRIES }, () => ({
        agent_id: "€".repeat(128),
        display_name: "€".repeat(120),
      })),
    );
    expect(new TextEncoder().encode(JSON.stringify(largest)).length).toBeLessThanOrEqual(
      AGENTS_MAX_BODY_BYTES,
    );
  });

  it("answers 503 when the record cannot be written, so the same roster is sent again", async () => {
    const source = await activatedSource();
    const failing: HandlerDeps = {
      ...deps,
      db: {
        ...db,
        sourceAgentsReport: () => Promise.reject(new Error("connection lost")),
      },
    };
    const response = await handleAgents(
      rosterRequest(roster([{ agent_id: JANA, display_name: "Jana Horváthová" }]), {
        token: source.token,
      }),
      failing,
    );
    expect(response.status).toBe(503);
  });
});
