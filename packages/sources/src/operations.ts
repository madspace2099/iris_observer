import type { Instant, ObserverDb, SourceOperationsRow } from "./db";

/**
 * THE OPERATIONS READ MODEL — one source, as the person responsible for it
 * needs to see it, and nothing more.
 *
 * ## Why a read model at all, when `db.sourceOperations()` already returns rows
 *
 * `SourceOperationsRow` is the shape of a `returns table (...)`: snake_case,
 * flat, twenty-four columns, and entirely undecided about what any of it means.
 * Handing that to an Admin surface would put three decisions into a component:
 * whether a bytes-used of null and a ceiling of 50 MB is 0% or unknown, whether
 * a suspended source with a full outbox is a suspension or a capacity problem,
 * and what "connected" is. Those are the same three decisions on every screen
 * that renders a source, and a component is the worst place to keep them
 * because there will eventually be two components.
 *
 * So the SQL answers "what is stored" and this file answers "what does it
 * mean". It adds no query — {@link observerOperations} is one call to the
 * facade the migration already publishes — and it derives nothing the row does
 * not already contain.
 *
 * ## Connected and Ingestion Verified are two facts, not two words for one
 *
 * This is the distinction the milestone exists to preserve and the one a
 * dashboard is most likely to collapse.
 *
 *   `connected`          a heartbeat has arrived. The machine is powered, has a
 *                        network path to us, and holds a credential that
 *                        verifies.
 *   `ingestionVerified`  an event has survived the whole path into storage,
 *                        once, ever. The envelope validates, the batch was
 *                        accepted, the row landed.
 *
 * A showroom PC can be Connected for six months and never Ingestion Verified —
 * a plugin misconfigured to talk to the wrong project, an outbox that fills and
 * quarantines, an envelope the schema refuses. That estate looks perfect on any
 * screen that shows a single green dot, and the only person who finds out is
 * whoever is asked why the analytics are empty. Both booleans are therefore
 * carried separately and all four of their combinations are meaningful.
 *
 * ## What may never appear in a value this file returns
 *
 * No credential, no verifier, no selector, and no account identifier the caller
 * did not itself supply. That is cheap to hold here because
 * `observer_source_operations` returns none of them — but it is written down
 * because the next field somebody adds will be added to the SQL first, and a
 * view that spread its row would inherit whatever arrived.
 * `SourceOperationsView` is therefore built field by field, never by spread.
 */

/* --- vocabulary ------------------------------------------------------------------ */

/**
 * The single classification a fleet list sorts and colours by.
 *
 * The ladder is documented at {@link classifyHealth}. Read that before adding a
 * member: the order is the whole design, and a value in the wrong place makes a
 * screen quietly stop reporting an outage.
 */
export type SourceHealth =
  | "archived"
  | "suspended"
  | "never_connected"
  | "connected_not_verified"
  | "quarantining"
  | "queue_pressure"
  | "healthy";

/**
 * The share of its own outbox a client must report before this is called
 * pressure.
 *
 * Eighty rather than ninety-something because the number has to leave an
 * operator time to act. An outbox at 95% of a 50 MB ceiling in a showroom that
 * has just lost its uplink is minutes from discarding events, and "minutes" is
 * not a window in which anybody drives to a building. Eighty is also high
 * enough that a queue merely doing its job — buffering a burst between flushes
 * — never trips it.
 */
export const QUEUE_PRESSURE_PERCENT = 80;

/**
 * How long the oldest unsent event may sit before the queue is called pressured
 * regardless of how full it is.
 *
 * The client's default flush interval is five seconds (`ClientConfig` in
 * `@observer/contracts/ue5`). An event that has been pending for an hour has
 * therefore watched roughly seven hundred flushes fail to take it, which is not
 * a burst and will not drain on its own.
 *
 * This exists as a second, independent trigger because bytes are the measure
 * most likely to be missing: a plugin that cannot size its outbox still knows
 * how old its head is, and a queue whose percentage is null must still be able
 * to report that it is stuck.
 */
export const QUEUE_PRESSURE_AGE_SECONDS = 3600;

/* --- the view -------------------------------------------------------------------- */

/**
 * What the client last said about its outbox.
 *
 * Every field is nullable and null means UNMEASURED, never zero. The facade
 * writes null for a heartbeat that omitted a field, and
 * `observer.heartbeat_count` exists precisely so that an absent key cannot
 * become a confident zero — a bug that once made every unreported counter read
 * as "nothing wrong here".
 *
 * The four refusal counters are CUMULATIVE for the life of the installation.
 * They are honest counts of events that no longer exist, and they never
 * decrease, so a large value is not by itself news. See {@link classifyHealth}
 * for what this read model can and cannot conclude from them.
 */
export interface QueueHealth {
  readonly eventCount: number | null;
  readonly bytesUsed: number | null;
  readonly bytesCeiling: number | null;
  /** `bytesUsed / bytesCeiling` as a percentage, or null. See {@link queuePercentUsed}. */
  readonly percentUsed: number | null;
  readonly oldestPendingAgeSeconds: number | null;
  readonly quarantineCount: number | null;
  readonly validationFailureCount: number | null;
  readonly capacityRefusalCount: number | null;
  readonly backendQuarantineCount: number | null;
  /** A code the client chose from a closed set. Never a message, never a stack. */
  readonly lastErrorCode: string | null;
}

/**
 * What the client says it is, as opposed to what it was registered as.
 *
 * Provenance, all of it, and none of it authoritative for anything. The
 * registered `environment` on the view is what every event this source sends is
 * filed under; `observedEnvironment` is only evidence that somebody built the
 * package wrong.
 */
export interface ObservedVersions {
  readonly appVersion: string | null;
  readonly plugin: string | null;
  readonly buildId: string | null;
  readonly engine: string | null;
  readonly environment: string | null;
}

/** One source, as an operator reads it. */
export interface SourceOperationsView {
  readonly sourceId: string;
  /** Within the account the caller supplied. Grouping, never authorisation. */
  readonly projectId: string;
  readonly sourceType: string;
  readonly label: string;
  /** THE REGISTERED environment. Authoritative for every event, per PD-25. */
  readonly environment: string;
  /** `active` | `suspended` | `archived`. */
  readonly state: string;

  /** A heartbeat has been received. */
  readonly connected: boolean;
  /** An event has reached storage, at least once, ever. */
  readonly ingestionVerified: boolean;

  readonly lastSeenAt: Instant | null;
  readonly lastHeartbeatAt: Instant | null;
  /**
   * The FIRST time this installation ever got an event into storage — set once
   * and never rewritten.
   *
   * Deliberately not called `lastIngestAt`, which is what a fleet screen wants
   * and what this facade cannot give it. `observer_source_operations` returns
   * `ingestion_verified_at` and nothing else about ingestion; the most-recent
   * instant is `project_sources.last_ingest_at` and is returned by
   * `observer_source_status`. Naming a first-ever instant "last ingest" would
   * put a commissioning date in a freshness column, where it would read as a
   * source that is ingesting right now for as long as it survives.
   */
  readonly ingestionVerifiedAt: Instant | null;

  readonly observed: ObservedVersions;
  /** The client reported an environment and it is not the registered one. */
  readonly environmentMismatch: boolean;

  readonly queue: QueueHealth;
  readonly health: SourceHealth;
}

/* --- the derivations -------------------------------------------------------------- */

/**
 * The queue's fill as a percentage, or null when it cannot be known.
 *
 * ## Why null rather than a number
 *
 * A percentage invented from a missing measurement is worse than an absent one,
 * because of what each looks like on a dashboard. An absent value renders as a
 * dash and an operator reads "we do not know". A fabricated value renders as a
 * confident number in the same typeface as every real one, and 0% is the most
 * reassuring number on the screen — so treating an unmeasured `bytesUsed` as
 * zero turns a plugin that cannot size its own outbox into the healthiest
 * source in the estate.
 *
 * Three cases, all null, for that one reason:
 *
 *   * `bytesUsed` null — nothing was measured. There is no numerator.
 *   * `bytesCeiling` null — the client did not say what full means, so a byte
 *     count is a magnitude and not a fraction of anything.
 *   * `bytesCeiling` zero or below — arithmetically this is a division by zero,
 *     and semantically a queue that may hold nothing is not a queue that is
 *     full. Either way there is no honest percentage. The check is `<= 0`
 *     rather than `=== 0` because the column's own constraint is the backstop,
 *     not this function, and a negative ceiling reaching here would otherwise
 *     produce a negative percentage rather than a dash.
 *
 * Over 100 is NOT clamped. A client that has written past its own ceiling is
 * reporting a real and interesting condition, and flattening 143% to 100%
 * hides the one number that says the ceiling is not being enforced.
 *
 * Rounded to one decimal place so that equal inputs produce an equal value and
 * a screen never renders sixteen significant figures of floating-point noise.
 */
export function queuePercentUsed(
  bytesUsed: number | null,
  bytesCeiling: number | null,
): number | null {
  if (bytesUsed === null || bytesCeiling === null) return null;
  if (bytesCeiling <= 0) return null;
  return Math.round((bytesUsed / bytesCeiling) * 1000) / 10;
}

/** True when a nullable cumulative counter says at least one event was lost. */
const lost = (count: number | null): boolean => count !== null && count > 0;

/**
 * THE HEALTH LADDER. First match wins, and the order is the design.
 *
 * Each rung answers "what would an operator do about this source next", and the
 * rungs are ordered so that the answer nearest the top is the one that makes
 * every answer below it moot.
 *
 * 1. `archived` — the source is out of the estate. Every observation under it
 *    is about a machine nobody is running any more, and reporting queue
 *    pressure on an archive would put a permanent alarm on a decision that was
 *    made deliberately.
 *
 * 2. `suspended` — an operator turned it off. **A suspended source with a full
 *    queue is suspended, not queue_pressure**: the queue is full *because* it
 *    was suspended, so "queue pressure" would report the consequence of the
 *    operator's own action back to them as a new problem, and the action they
 *    would take — resume it — is not the action that label suggests.
 *
 * 3. `never_connected` — no heartbeat has ever arrived. This sits above every
 *    measurement-based rung because there are no measurements: the queue
 *    columns are written by heartbeats, so for a source that has never sent one
 *    they are null by construction. A registered showroom that has never phoned
 *    home is also the single most common real fault in this system — a package
 *    shipped with no activation code, or one nobody pasted — and it is the
 *    fault a green dashboard is most likely to hide.
 *
 * 4. `connected_not_verified` — it is talking to us and no event has ever
 *    landed. Above both queue rungs, which is the ordering that took the most
 *    argument. Both of those describe an installation that *works* and has
 *    fallen behind, and asserting either of a source that has never delivered
 *    an event implies it once did: "queue pressure" invites an operator to wait
 *    for a backlog to drain, and this backlog will never drain, because
 *    whatever is stopping the first event will stop the rest. The counters
 *    explain the failure; they are not separate news.
 *
 * 5. `quarantining` — data this installation collected has been discarded.
 *    Above `queue_pressure` because loss outranks risk: pressure is events that
 *    might not arrive, and this is events that certainly will not. All four
 *    refusal counters feed it — quarantines, backend quarantines, validation
 *    failures and capacity refusals — because the difference between them is
 *    something an operator reads off the fields, not something the ladder
 *    should rank. Every one of them is a visitor who did something in a
 *    showroom that nobody will ever see.
 *
 *    **The honest limit, stated because the name overclaims.** These counters
 *    are cumulative and this read model holds one snapshot, so it cannot see a
 *    rate. This rung therefore means "has quarantined", not "is quarantining
 *    now", and a source that discarded one event during commissioning carries
 *    it until the installation is replaced. Distinguishing the two needs two
 *    snapshots and a stored history, which is a different table and a decision
 *    nobody has taken; inventing a rate from one sample would be the same
 *    dishonesty {@link queuePercentUsed} refuses.
 *
 * 6. `queue_pressure` — the outbox is nearly full, or its head is stale. Either
 *    trigger alone is enough; see {@link QUEUE_PRESSURE_PERCENT} and
 *    {@link QUEUE_PRESSURE_AGE_SECONDS} for why there are two. An unmeasured
 *    queue never trips this: a queue nobody could size is not a queue known to
 *    be under pressure, and a null must not become a symptom any more than it
 *    may become a percentage.
 *
 * 7. `healthy` — connected, verified, nothing lost, nothing backing up. Last,
 *    because it is the only rung that is an absence of findings, and a default
 *    of "healthy" is only safe when every finding above it has been checked.
 */
export function classifyHealth(view: Omit<SourceOperationsView, "health">): SourceHealth {
  if (view.state === "archived") return "archived";
  if (view.state === "suspended") return "suspended";
  if (!view.connected) return "never_connected";
  if (!view.ingestionVerified) return "connected_not_verified";

  const queue = view.queue;
  if (
    lost(queue.quarantineCount) ||
    lost(queue.backendQuarantineCount) ||
    lost(queue.validationFailureCount) ||
    lost(queue.capacityRefusalCount)
  ) {
    return "quarantining";
  }

  const percent = queue.percentUsed;
  if (percent !== null && percent >= QUEUE_PRESSURE_PERCENT) return "queue_pressure";

  const age = queue.oldestPendingAgeSeconds;
  if (age !== null && age >= QUEUE_PRESSURE_AGE_SECONDS) return "queue_pressure";

  return "healthy";
}

/**
 * One facade row, read.
 *
 * Pure, exported, and total: every branch is decided by the row and nothing
 * here reads a clock, so a classification is reproducible from a stored row a
 * week later. That is what lets the health ladder be argued about in review
 * against fixtures rather than against a live estate.
 *
 * Note the absence of a spread. Every field is named, so a column added to the
 * facade tomorrow arrives here as a compile-time choice rather than as an
 * extra key on somebody's screen.
 */
export function toOperationsView(row: SourceOperationsRow): SourceOperationsView {
  const queue: QueueHealth = {
    eventCount: row.queue_event_count,
    bytesUsed: row.queue_bytes_used,
    bytesCeiling: row.queue_bytes_ceiling,
    percentUsed: queuePercentUsed(row.queue_bytes_used, row.queue_bytes_ceiling),
    oldestPendingAgeSeconds: row.oldest_pending_age_seconds,
    quarantineCount: row.quarantine_count,
    validationFailureCount: row.validation_failure_count,
    capacityRefusalCount: row.capacity_refusal_count,
    backendQuarantineCount: row.backend_quarantine_count,
    lastErrorCode: row.last_error_code,
  };

  const withoutHealth: Omit<SourceOperationsView, "health"> = {
    sourceId: row.source_id,
    projectId: row.project_id,
    sourceType: row.source_type,
    label: row.display_label,
    environment: row.environment,
    state: row.state,
    /*
     * THE TWO INDEPENDENT FACTS, each derived from its own column and neither
     * from the other. Writing `ingestionVerified` as "has an event and is
     * connected" would be a plausible-looking simplification that destroys the
     * combination this whole module exists to show — an installation that has
     * ingested and then gone silent is exactly the case an operator must be
     * able to see, and it would report as never verified.
     */
    connected: row.last_heartbeat_at !== null,
    ingestionVerified: row.ingestion_verified_at !== null,
    lastSeenAt: row.last_seen_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    ingestionVerifiedAt: row.ingestion_verified_at,
    observed: {
      appVersion: row.observed_app_version,
      plugin: row.observed_plugin,
      buildId: row.observed_build_id,
      engine: row.observed_engine,
      environment: row.observed_environment,
    },
    environmentMismatch: row.environment_mismatch,
    queue,
  };

  return { ...withoutHealth, health: classifyHealth(withoutHealth) };
}

/* --- the service ------------------------------------------------------------------ */

/** Everything this module needs. One port, no clock, no environment. */
export interface OperationsDeps {
  readonly db: ObserverDb;
}

export interface OperationsScope {
  /** The tenant boundary. Supplied by the caller from its own session. */
  readonly account: string;
  /** Null means every project in the account. */
  readonly project: string | null;
}

export interface ObserverOperations {
  list(scope: OperationsScope): Promise<readonly SourceOperationsView[]>;
}

/**
 * Bind the read model to a database.
 *
 * The scope is an argument rather than state for the same reason
 * `observerAdmin` takes one: an account held on the object is an account that
 * outlives a request, and the failure mode of getting that wrong is one
 * tenant's estate on another tenant's screen.
 *
 * There is no refusal type here and no validation of `account`. A read has no
 * side effect to withhold, an account that matches nothing yields an empty
 * list, and an empty list is already indistinguishable from a real account with
 * no sources — which is precisely the answer a stranger should get. Argument
 * validation lives in `observerAdmin.sourceOperations`, which is the door an
 * operator surface calls; this is the shaping layer behind it.
 */
export function observerOperations(deps: OperationsDeps): ObserverOperations {
  return {
    async list(scope) {
      const rows = await deps.db.sourceOperations({
        account: scope.account,
        project: scope.project,
      });
      /*
       * Order is the facade's — `order by s.created_at desc` — and is preserved
       * rather than re-sorted by health. Sorting by severity here would make the
       * position of a row change when its queue filled, which is the behaviour
       * that makes an operator lose the row they were reading.
       */
      return rows.map(toOperationsView);
    },
  };
}
