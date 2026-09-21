/**
 * The database port — the one seam between Observer's source services and
 * whichever Postgres is actually holding the rows.
 *
 * ## Why a port at all, when the repository already talks to Supabase
 *
 * Every function below already exists in a migration as a `SECURITY DEFINER`
 * facade, and `apps/web` reaches its existing ones through PostgREST's `/rpc/`
 * with the server secret key. That works and is not being replaced.
 *
 * What it cannot do is be *proved* locally. There is no Docker on this machine
 * (ADR-0008), no `DATABASE_URL`, and the hosted projects are out of bounds for
 * this milestone — so a test that exercises the real handler against the real
 * SQL has nowhere to run unless the handler can be handed a different Postgres.
 *
 * PGlite is a real Postgres and already runs the migrations verbatim in
 * `supabase/test`. So the port has exactly two implementations, and the thing
 * that makes the local proof mean something is that **both call the same
 * function names with the same arguments**. A PGlite test that passes is not a
 * test of a parallel implementation; it is a test of the SQL that hosted
 * Postgres will run, reached by a different transport.
 *
 * ## Why one method per function, and not `call(name, args)`
 *
 * A generic `call<T>(fn: string, args: object)` would be shorter and would let
 * a caller invoke anything, including a function that does not exist, with
 * arguments in the wrong order, and find out at runtime in production. The
 * argument lists below are load-bearing — `observer_activation_consume` takes
 * four secret-derived strings in a fixed order, and swapping the code verifier
 * with the credential verifier would mint a credential nobody can present while
 * every type still checked.
 *
 * So the port is wide and boring on purpose. Adding a function here is meant to
 * be the moment somebody notices a new database entry point exists.
 *
 * ## What is deliberately NOT here
 *
 * No transaction control, no connection lifecycle, no query builder. Each
 * method is one round trip to one facade, because that is what PostgREST can
 * express — a port that offered `begin()` would be honest against PGlite and a
 * lie against hosted Supabase, and the whole point is that the two agree.
 *
 * Atomicity therefore lives *inside* the SQL functions, which is where
 * `observer_activation_consume` already puts it: one conditional `update ...
 * returning`, so exactly one caller can win a race the port cannot even see.
 */

/* --- rows the facades return ------------------------------------------------- */

/**
 * Timestamps cross this boundary as strings, never as `Date`.
 *
 * The facades render every instant as `to_char(x at time zone 'utc',
 * 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`, so PostgREST and PGlite cannot disagree
 * about a serialisation the wire contract pins to millisecond ISO-8601. Parsing
 * to `Date` here would throw that away and hand every caller a value whose
 * printed form depends on the host's locale.
 *
 * The milliseconds arrived late. This docblock originally described a format
 * string no migration used — the facades truncated to the second, which is
 * fine for `created_at` and quietly destructive for `occurred_at`, since
 * ADR-0016 derives dwell from exactly those values. Migration
 * `20260902120000` corrected the SQL to match what was written here, rather
 * than the other way round.
 */
export type Instant = string;

/** One row of {@link ObserverDb.sourceStatus}. */
export interface SourceStatusRow {
  readonly source_id: string;
  readonly project_id: string;
  readonly source_type: string;
  readonly environment: string;
  readonly display_label: string;
  readonly state: string;
  readonly last_seen_at: Instant | null;
  readonly last_ingest_at: Instant | null;
  readonly observed_app_version: string | null;
  readonly observed_plugin: string | null;
  readonly observed_build_id: string | null;
  readonly observed_environment: string | null;
  readonly created_at: Instant;
}

/**
 * What a successful activation exchange yields.
 *
 * Note what is here and what the endpoint may return: `account_id` and
 * `project_id` are present because the *service* needs them to build the
 * authenticated context, and absent from the activation response because the
 * client has no use for them and learning them is a small privilege escalation
 * for anybody holding a stolen code.
 */
export interface ActivationConsumeRow {
  readonly source_id: string;
  readonly account_id: string;
  readonly project_id: string;
  readonly environment: string;
  readonly display_label: string;
  readonly purpose: string;
}

/**
 * What a presented credential resolves to, before verification.
 *
 * `verifier` is the stored HMAC, and it is returned so the caller can compare
 * in constant time against a verifier derived from the presented secret. It is
 * the one value in this file that must never reach a response body, a log line
 * or a test snapshot.
 */
export interface CredentialResolveRow {
  readonly verifier: string;
  readonly credential_state: string;
  readonly expires_at: Instant | null;
  readonly source_id: string;
  readonly account_id: string;
  readonly project_id: string;
  readonly environment: string;
  readonly display_label: string;
  readonly source_state: string;
}

/** Credential lifecycle as an operator sees it — never the verifier. */
export interface CredentialStatusRow {
  readonly state: string;
  readonly created_at: Instant;
  readonly expires_at: Instant | null;
  readonly superseded_at: Instant | null;
  readonly revoked_at: Instant | null;
}

/**
 * One event's fate, positionally bound to the submitted array.
 *
 * `ordinal` is 1-based and comes from `with ordinality`, which is what makes
 * the response's per-event ordering a property of the database rather than of
 * the service remembering to keep two arrays aligned. A foreign `event_id`
 * cannot appear here because the rows are generated from the input.
 */
export interface EventAppendRow {
  readonly ordinal: number;
  readonly event_id: string;
  readonly outcome: string;
}

/** A stored event, read back. Read models and the E2E proof use this. */
export interface StoredEventRow {
  readonly event_id: string;
  readonly event_name: string;
  readonly schema_version: number;
  readonly occurred_at: Instant;
  readonly ingested_at: Instant;
  readonly session_id: string | null;
  readonly sequence: number | null;
  readonly account_id: string;
  readonly project_id: string;
  readonly app_environment: string;
  readonly properties: Record<string, unknown>;
}

/**
 * One session-scoped event of a project, with the identity its envelope carried.
 *
 * What a read model folds sessions from. `StoredEventRow` above is the
 * operations view — newest first, one source, no `agent_id` or entity — and
 * nothing could rebuild a session from it. Never a diagnostic and never an
 * event without a session: the facade filters both, so `session_id` and
 * `sequence` are not nullable here.
 */
export interface ProjectEventRow {
  readonly source_id: string;
  readonly event_id: string;
  readonly event_name: string;
  readonly schema_version: number;
  readonly occurred_at: Instant;
  readonly ingested_at: Instant;
  readonly session_id: string;
  readonly sequence: number;
  readonly agent_id: string | null;
  readonly visitor_subject: string | null;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly properties: Record<string, unknown>;
  /**
   * Where this row sits in the read, to be handed back verbatim as `after`.
   * Opaque: it carries microseconds the `Instant`s above do not, and a cursor
   * rebuilt from one of those would sit before rows already returned.
   */
  readonly page_cursor: string;
}

/**
 * One project an account holds, with the rollups an operations list needs.
 *
 * The counts come from one scan of that account's sources, so they cannot
 * disagree with each other. `source_count` is zero — not one — for a project
 * with no sources, which is the state this row exists to make visible: every
 * other read in this port enumerates sources, so a project created moments
 * before a process died was invisible to all of them.
 */
export interface ProjectSummaryRow {
  readonly project_id: string;
  readonly name: string;
  readonly slug: string | null;
  readonly status: string;
  readonly created_at: Instant;
  readonly source_count: number;
  readonly connected_count: number;
  readonly verified_count: number;
  readonly last_activity_at: Instant | null;
}

/** A property developer whose projects the estate administers. */
export interface TenantRow {
  readonly tenant_id: string;
  readonly name: string;
  /** The first segment of every customer address. Unique across the system. */
  readonly slug: string;
  readonly status: string;
  readonly created_at: Instant;
  readonly project_count: number;
}

/**
 * One active project with what the customer side needs to show it.
 *
 * A project is COMPLETE when its developer, its slug and its three settings are
 * all present, and only a complete project can be a dashboard. The nulls are the
 * answer to "why is this project not visible yet", so they are reported rather
 * than filtered out here.
 */
export interface ProjectDirectoryRow {
  readonly project_id: string;
  readonly name: string;
  readonly slug: string | null;
  readonly tenant_id: string | null;
  readonly tenant_name: string | null;
  readonly tenant_slug: string | null;
  /** ISO 4217, three capitals. */
  readonly currency: string | null;
  /** BCP 47. */
  readonly locale: string | null;
  /** IANA. The database checks the shape only; the application checks the zone. */
  readonly time_zone: string | null;
  readonly created_at: Instant;
}

/** A standing grant. Revoked ones are kept in the table and never returned. */
export interface ProjectViewerRow {
  readonly viewer_account: string;
  readonly granted_by: string;
  readonly created_at: Instant;
}

/**
 * Somebody who presented on a project, or whom administration has named.
 *
 * `display_name` null is a presenter nobody has named yet, which is the row an
 * operator is looking for. `session_count` zero is a name with no meeting yet.
 */
export interface ProjectAgentRow {
  /** Exactly what the showroom sends as `agent_id`. */
  readonly agent_ref: string;
  readonly display_name: string | null;
  /** `administration` | `showroom`, null with no name. */
  readonly named_by: string | null;
  readonly session_count: number;
  readonly last_seen_at: Instant | null;
}

/**
 * A source's operational state — what a heartbeat writes and Admin reads.
 *
 * Two fields carry a distinction the milestone insists on and which nothing
 * else in the row can express: `last_heartbeat_at` says the source can reach us
 * and hold a valid credential; `ingestion_verified_at` says an event actually
 * survived the whole path into storage. A source can be Connected and never
 * have proved Ingestion Verified, and an operator needs to see which.
 */
export interface SourceOperationsRow {
  readonly source_id: string;
  readonly project_id: string;
  readonly source_type: string;
  readonly environment: string;
  readonly display_label: string;
  readonly state: string;
  readonly last_seen_at: Instant | null;
  readonly last_heartbeat_at: Instant | null;
  readonly ingestion_verified_at: Instant | null;
  readonly observed_app_version: string | null;
  readonly observed_plugin: string | null;
  readonly observed_build_id: string | null;
  readonly observed_engine: string | null;
  readonly observed_environment: string | null;
  readonly environment_mismatch: boolean;
  readonly queue_event_count: number | null;
  readonly queue_bytes_used: number | null;
  readonly queue_bytes_ceiling: number | null;
  readonly oldest_pending_age_seconds: number | null;
  readonly quarantine_count: number | null;
  readonly validation_failure_count: number | null;
  readonly capacity_refusal_count: number | null;
  readonly backend_quarantine_count: number | null;
  readonly last_error_code: string | null;
}

/* --- what a heartbeat writes -------------------------------------------------- */

/**
 * The bounded operational payload.
 *
 * Every field is optional because a plugin that cannot compute one of them must
 * still be able to say it is alive — a heartbeat that fails validation because
 * the outbox could not be measured turns a diagnostic into an outage.
 *
 * Every field is also a number, a short enum-ish string or a version string.
 * There is deliberately no free-text field: `last_error_code` is a code, not a
 * message, because the alternative is an exception dump arriving in an
 * operational table with a visitor's name inside it.
 */
export interface HeartbeatFacts {
  readonly installation_nonce?: string | null;
  readonly app_version?: string | null;
  readonly plugin_version?: string | null;
  readonly build_id?: string | null;
  readonly engine_version?: string | null;
  readonly reported_environment?: string | null;
  readonly queue_event_count?: number | null;
  readonly queue_bytes_used?: number | null;
  readonly queue_bytes_ceiling?: number | null;
  readonly oldest_pending_age_seconds?: number | null;
  readonly quarantine_count?: number | null;
  readonly validation_failure_count?: number | null;
  readonly capacity_refusal_count?: number | null;
  readonly backend_quarantine_count?: number | null;
  readonly last_error_code?: string | null;
}

/* --- the port ----------------------------------------------------------------- */

/**
 * Every database entry point the source services are allowed to use.
 *
 * Implementations: `pgliteDb()` for tests and the local end-to-end proof,
 * `postgrestDb()` for a deployment. Neither may add a method the other lacks —
 * a test asserts the two expose the same keys, because a port with an
 * implementation-specific escape hatch is not a port.
 */
export interface ObserverDb {
  /* --- control plane ---------------------------------------------------- */

  /** Returns the new project's id. */
  projectCreate(input: {
    readonly account: string;
    readonly name: string;
    readonly slug: string | null;
  }): Promise<string>;

  /** Returns the new source's id. */
  sourceCreate(input: {
    readonly account: string;
    readonly project: string;
    readonly type: string;
    readonly environment: string;
    readonly label: string;
  }): Promise<string>;

  /**
   * `active` | `suspended` | `archived`. False when the source is not this
   * account's, which is deliberately indistinguishable from "does not exist".
   */
  sourceSetState(input: {
    readonly account: string;
    readonly source: string;
    readonly state: string;
  }): Promise<boolean>;

  /** Every project this account holds, most recently active first. */
  projectsForAccount(account: string): Promise<readonly ProjectSummaryRow[]>;

  sourceStatus(input: {
    readonly account: string;
    readonly project: string;
  }): Promise<readonly SourceStatusRow[]>;

  /* --- the project directory -------------------------------------------- */

  /** Returns the new developer's id. A slug already taken raises, like a project's. */
  tenantCreate(input: {
    readonly account: string;
    readonly name: string;
    readonly slug: string;
  }): Promise<string>;

  tenantsForAccount(account: string): Promise<readonly TenantRow[]>;

  /**
   * Attach a project to a developer and give it its address and settings.
   *
   * False for a project that is not this account's active project, a developer
   * of another estate, and any call that would move a project that already has
   * a developer or change its address. The settings of such a project may still
   * be changed, by repeating its developer and slug.
   */
  projectSettingsSet(input: {
    readonly account: string;
    readonly project: string;
    readonly tenant: string;
    readonly slug: string;
    readonly currency: string;
    readonly locale: string;
    readonly timeZone: string;
  }): Promise<boolean>;

  /** Every active project of the account, complete or not. */
  projectDirectory(account: string): Promise<readonly ProjectDirectoryRow[]>;

  /** True when the grant stands afterwards, whether or not this call made it. */
  projectViewerGrant(input: {
    readonly account: string;
    readonly project: string;
    readonly viewer: string;
    readonly grantedBy: string;
  }): Promise<boolean>;

  /** False when there was no standing grant to revoke. */
  projectViewerRevoke(input: {
    readonly account: string;
    readonly project: string;
    readonly viewer: string;
    readonly revokedBy: string;
  }): Promise<boolean>;

  projectViewers(input: {
    readonly account: string;
    readonly project: string;
  }): Promise<readonly ProjectViewerRow[]>;

  /** The projects a person holds a standing grant on. */
  projectsForViewer(input: {
    readonly account: string;
    readonly viewer: string;
  }): Promise<readonly { readonly project_id: string }[]>;

  /**
   * Administration names a presenter, or withdraws the name with `null`.
   *
   * Replaces a showroom's name, never the reverse. A withdrawal keeps the row
   * without a name, so the next roster report cannot refill it.
   */
  projectAgentNameSet(input: {
    readonly account: string;
    readonly project: string;
    readonly agent: string;
    readonly name: string | null;
  }): Promise<boolean>;

  projectAgents(input: {
    readonly account: string;
    readonly project: string;
  }): Promise<readonly ProjectAgentRow[]>;

  /**
   * A showroom reports the names on its roster. Identity comes from the
   * resolved source, never from the body. Returns how many names were taken;
   * a name administration set is left alone and not counted.
   */
  sourceAgentsReport(input: {
    readonly source: string;
    readonly agents: readonly { readonly agent_id: string; readonly display_name: string }[];
  }): Promise<number>;

  /* --- activation ------------------------------------------------------- */

  /**
   * Record an issued activation code. The caller has already generated the
   * secret and derived `selector`/`verifier`; the plaintext never arrives here.
   */
  activationIssue(input: {
    readonly account: string;
    readonly source: string;
    readonly selector: string;
    readonly verifier: string;
    readonly purpose: string;
    readonly expiresAt: Instant;
  }): Promise<boolean>;

  /**
   * Spend a code and mint a credential, atomically, or return null.
   *
   * Null covers every failure — unknown selector, wrong verifier, expired,
   * already consumed, revoked, ineligible source — because the caller must not
   * be able to tell them apart, and the cheapest way to guarantee that is to
   * have nothing to tell apart with.
   */
  activationConsume(input: {
    readonly codeSelector: string;
    readonly codeVerifier: string;
    readonly credentialSelector: string;
    readonly credentialVerifier: string;
    readonly credentialExpiresAt: Instant | null;
  }): Promise<ActivationConsumeRow | null>;

  credentialResolve(selector: string): Promise<CredentialResolveRow | null>;

  credentialRevoke(input: { readonly account: string; readonly source: string }): Promise<boolean>;

  credentialStatus(input: {
    readonly account: string;
    readonly source: string;
  }): Promise<CredentialStatusRow | null>;

  /* --- ingestion -------------------------------------------------------- */

  /**
   * Append a batch under one source, returning one row per submitted event in
   * submission order. Idempotency is `(source_id, event_id)` and lives in the
   * table's primary key, not in this call.
   */
  eventsAppend(input: {
    readonly source: string;
    readonly events: readonly unknown[];
  }): Promise<readonly EventAppendRow[]>;

  eventsForSource(input: {
    readonly account: string;
    readonly source: string;
    readonly limit: number;
  }): Promise<readonly StoredEventRow[]>;

  /**
   * ONE PAGE of a project's session-scoped events, across all its sources, in
   * the order they were ingested. `after` is the previous page's last
   * `page_cursor`, null for the beginning. The facade answers at most 1000 rows
   * whatever `limit` says, and PostgREST may cut that shorter without saying so.
   * Read a whole project with {@link readProjectEvents}.
   */
  eventsForProject(input: {
    readonly account: string;
    readonly project: string;
    readonly after: string | null;
    readonly limit: number;
  }): Promise<readonly ProjectEventRow[]>;

  /* --- operations ------------------------------------------------------- */

  /** Record a heartbeat's facts against a source. Operational, never a fact. */
  heartbeatRecord(input: {
    readonly source: string;
    readonly facts: HeartbeatFacts;
  }): Promise<boolean>;

  /** Mark that a source has proved the whole ingestion path at least once. */
  ingestionVerified(input: { readonly source: string }): Promise<boolean>;

  sourceOperations(input: {
    readonly account: string;
    readonly project: string | null;
  }): Promise<readonly SourceOperationsRow[]>;
}

/**
 * The facade names, in one place, so a drift test can assert that every name
 * the port calls is a function some migration actually creates.
 *
 * This list existing is the difference between "the adapter compiles" and "the
 * adapter can run": a typo in an RPC name is invisible to TypeScript and shows
 * up as a 404 from PostgREST at the first real request.
 */
export const FACADE_NAMES = [
  "observer_project_create",
  "observer_projects_for_account",
  "observer_source_create",
  "observer_source_set_state",
  "observer_source_status",
  "observer_tenant_create",
  "observer_tenants_for_account",
  "observer_project_settings_set",
  "observer_project_directory",
  "observer_project_viewer_grant",
  "observer_project_viewer_revoke",
  "observer_project_viewers",
  "observer_projects_for_viewer",
  "observer_project_agent_name_set",
  "observer_project_agents",
  "observer_source_agents_report",
  "observer_activation_issue",
  "observer_activation_consume",
  "observer_credential_resolve",
  "observer_credential_revoke",
  "observer_credential_status",
  "observer_events_append",
  "observer_events_for_source",
  "observer_events_for_project",
  "observer_heartbeat_record",
  "observer_ingestion_verified",
  "observer_source_operations",
] as const;

export type FacadeName = (typeof FACADE_NAMES)[number];

/* --- reading a whole project's events ------------------------------------------- */

/** The most one call is asked for. The facade's own ceiling, and PostgREST's default `max-rows` on Supabase. */
export const PROJECT_EVENTS_PAGE = 1000;

/**
 * Every session-scoped event of a project, read a page at a time.
 *
 * Each page is asked for after the last row's `page_cursor`, handed back
 * verbatim: a keyset over `(ingested_at, source_id, event_id)` that the facade
 * compares strictly, so no row repeats and none is skipped.
 *
 * It stops on an EMPTY page, never on a short one. PostgREST cuts a response at
 * its `max-rows` without saying so, and an operator may have set that below
 * what was asked for; a short page is then a full one, and treating it as the
 * end would present part of a project as the whole. The cost is one request
 * that answers nothing.
 *
 * `complete` is false only when `maxPages` ran out first, so a caller can say a
 * project was read in part.
 *
 * ponytail: `maxPages` defaults to fifty, so fifty thousand events per read at
 * the default cap. Past that, sessions want materialising at ingest, not a larger
 * number here.
 */
export async function readProjectEvents(
  db: Pick<ObserverDb, "eventsForProject">,
  input: { readonly account: string; readonly project: string; readonly maxPages?: number },
): Promise<{ readonly events: readonly ProjectEventRow[]; readonly complete: boolean }> {
  const events: ProjectEventRow[] = [];
  let after: string | null = null;
  for (let page = 0; page < (input.maxPages ?? 50); page += 1) {
    const rows: readonly ProjectEventRow[] = await db.eventsForProject({
      account: input.account,
      project: input.project,
      after,
      limit: PROJECT_EVENTS_PAGE,
    });
    const last = rows[rows.length - 1];
    if (last === undefined) return { events, complete: true };
    events.push(...rows);
    after = last.page_cursor;
  }
  return { events, complete: false };
}
