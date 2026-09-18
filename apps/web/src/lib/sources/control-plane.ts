import "server-only";

import type { MarkTone } from "@/components/madspace/StatusMark";

import {
  observerAdmin,
  type CredentialStatusRow,
  type ObserverAdmin,
  type SourceOperationsRow,
  type SourceStatusRow,
} from "@observer/sources";

import { observerDepsAsync } from "./deps";
import { localControlPlaneEnabled } from "./local-db";

/**
 * What the MADSPACE operations screens read and write.
 *
 * A thin seam over `observerAdmin`, and thin on purpose: every rule about who
 * may see what already lives in the SQL facades, which take an account and
 * scope every row to it. Re-deciding any of that here would be a second answer
 * to a question the database already answers, and the two would disagree the
 * first time one of them was edited.
 *
 * What this file does add is the part a screen needs and a service does not: a
 * single account to operate as, one shape that carries both the identity row
 * and the operational row for a source, and a derived health verdict that is a
 * function of persisted state rather than a badge somebody set.
 */

/**
 * The account these screens administer.
 *
 * ONE account, and that is a scope decision rather than a simplification.
 * MADSPACE administration eventually spans every customer account, and the
 * facades are already account-scoped for it — but a screen that can pick an
 * account needs an account registry, a membership model and an audit of who
 * switched to whom, none of which exists yet and none of which this milestone
 * is meant to invent.
 *
 * So the local control plane administers the MADSPACE demonstration estate and
 * says so in the interface. The moment a real registry lands, this constant
 * becomes a parameter and nothing else here changes.
 */
export const CONTROL_PLANE_ACCOUNT = "acct_madspace_demo";

/** The label a screen shows for {@link CONTROL_PLANE_ACCOUNT}. */
export const CONTROL_PLANE_ACCOUNT_NAME = "MADSPACE Demo";

/**
 * Why the control plane is unavailable, in words a reader can act on.
 *
 * Never "something went wrong". A deployment without a database and a
 * development machine that has not set the flag are different problems with
 * different fixes, and the screen should say which one it is.
 */
export type ControlPlaneAbsence =
  { readonly kind: "not_enabled" } | { readonly kind: "failed"; readonly detail: string };

export type ControlPlane =
  | { readonly ok: true; readonly admin: ObserverAdmin }
  | { readonly ok: false; readonly absence: ControlPlaneAbsence };

export async function controlPlane(): Promise<ControlPlane> {
  try {
    const deps = await observerDepsAsync();
    if (deps === null) return { ok: false, absence: { kind: "not_enabled" } };
    return { ok: true, admin: observerAdmin(deps) };
  } catch (error: unknown) {
    /*
     * The message, not the stack, and only because this surface is MADSPACE's
     * own. A failure here is almost always a migration that will not apply or
     * a directory that cannot be written, and both are unreadable without the
     * sentence Postgres produced.
     */
    return {
      ok: false,
      absence: { kind: "failed", detail: error instanceof Error ? error.message : String(error) },
    };
  }
}

/** True when this process is running the development database rather than a hosted one. */
export function runningLocally(): boolean {
  return localControlPlaneEnabled();
}

/* --- the three states, derived rather than stored --------------------------------- */

/**
 * The three facts an operator is actually asking about, kept apart.
 *
 * ACTIVATED means a credential relationship exists — the source completed an
 * exchange. CONNECTED means a heartbeat has been accepted. INGESTION VERIFIED
 * means a `diagnostic.test` reached storage.
 *
 * They are independent, all four combinations occur, and collapsing any two of
 * them loses the state this product exists to surface: a showroom whose plugin
 * is healthy and whose events have never landed looks identical to a working
 * one behind a single green dot.
 *
 * Each is derived from one persisted column and nothing else. There is no
 * inference, no "probably connected because it activated recently", and no
 * value a screen can set.
 */
export interface SourceStates {
  readonly activated: boolean;
  readonly connected: boolean;
  readonly ingestionVerified: boolean;
}

/**
 * How old a heartbeat may be before Connected stops meaning anything.
 *
 * Fifteen minutes, and it is a display decision rather than a protocol one: the
 * plugin's flush interval is five seconds, so a source that has said nothing
 * for fifteen minutes is not merely quiet. The backend does not expire
 * anything — `last_heartbeat_at` keeps its value for ever — so this threshold
 * belongs here, where it can be read beside the timestamp it judges.
 */
export const HEARTBEAT_FRESH_MS = 15 * 60 * 1000;

/**
 * One source, as a screen needs it: identity, operations, and the derived verdicts.
 *
 * The two rows come from two facades and are joined by `source_id` rather than
 * merged in SQL, because they answer different questions and are read by
 * different screens. `operations` is null for a source that has never been
 * heard from, which is a real state and not a missing row.
 */
export interface SourceView {
  readonly status: SourceStatusRow;
  readonly operations: SourceOperationsRow | null;
  readonly states: SourceStates;
  readonly health: SourceHealth;
  readonly heartbeatFresh: boolean;
  readonly queueFillPercent: number | null;
}

/**
 * One word for the row, and a strict precedence.
 *
 * The order matters more than the vocabulary. A suspended source with a full
 * queue reads as SUSPENDED, because that is the actionable fact — the queue is
 * a consequence of the suspension, and telling an operator to clear it would
 * send them to fix a symptom. Likewise a source that has never connected is
 * not "attention", it is waiting for its first heartbeat, and saying so avoids
 * an alarm on every newly created source.
 */
export type SourceHealth =
  | "archived"
  | "suspended"
  | "never_connected"
  | "offline"
  | "not_verified"
  | "attention"
  | "healthy";

/**
 * The three states, each from its own column and nothing else.
 *
 * The first draft of this derived `activated` from `last_ingest_at` or
 * `last_heartbeat_at` being set, which is precisely the collapse this whole
 * surface exists to prevent: it made ACTIVATED a consequence of CONNECTED, so
 * the one state an operator most needs to see — activated, and never heard from
 * since — could not be rendered at all. `ObserverAdmin.credentialStatus` was
 * added so this could read the authoritative answer instead of inferring one.
 *
 * `credential` is the credential's lifecycle row, or null when the source has
 * never completed an exchange. A REVOKED or SUPERSEDED credential still means
 * the source was activated: the operator needs "activated, then revoked" to
 * look different from "never activated", and a row exists in the first case.
 */
export function classifyStates(
  credential: CredentialStatusRow | null,
  operations: SourceOperationsRow | null,
): SourceStates {
  return {
    activated: credential !== null,
    connected: operations?.last_heartbeat_at != null,
    ingestionVerified: operations?.ingestion_verified_at != null,
  };
}

/** Whether a heartbeat is recent enough for Connected to still mean something. */
export function heartbeatIsFresh(at: string | null, now: Date): boolean {
  if (at === null) return false;
  const seen = Date.parse(at);
  return Number.isFinite(seen) && now.getTime() - seen <= HEARTBEAT_FRESH_MS;
}

/**
 * How full the outbox is, or null.
 *
 * Null when either number is missing, and never a zero standing in for one. A
 * percentage invented from an absent measurement renders as a confident figure
 * on a dashboard and nobody asks where it came from — the doctrine's rule about
 * never rendering an absent value as zero, applied to the one number here most
 * likely to be fabricated.
 */
export function queueFill(used: number | null, ceiling: number | null): number | null {
  if (used === null || ceiling === null || ceiling <= 0) return null;
  return Math.min(100, (used / ceiling) * 100);
}

/**
 * One word for a source, by strict precedence.
 *
 * Read top to bottom: the first line that matches wins, and the order is the
 * decision. Lifecycle beats liveness because a suspended source is not
 * unhealthy, it is switched off deliberately. Never-connected beats offline
 * because a source created a minute ago has not failed at anything. And
 * quarantine beats queue pressure because a growing quarantine means events are
 * being refused, while a full queue only means they have not been sent yet.
 */
export function classifyHealth(
  status: SourceStatusRow,
  operations: SourceOperationsRow | null,
  states: SourceStates,
  fresh: boolean,
): SourceHealth {
  if (status.state === "archived") return "archived";
  if (status.state === "suspended") return "suspended";
  if (!states.connected) return "never_connected";
  if (!fresh) return "offline";

  const quarantined =
    (operations?.quarantine_count ?? 0) + (operations?.backend_quarantine_count ?? 0);
  if (quarantined > 0) return "attention";

  const fill = queueFill(
    operations?.queue_bytes_used ?? null,
    operations?.queue_bytes_ceiling ?? null,
  );
  if (fill !== null && fill >= 80) return "attention";

  if (!states.ingestionVerified) return "not_verified";
  return "healthy";
}

/** The label an operator reads for each verdict. Never only a colour. */
export const HEALTH_LABEL: Readonly<Record<SourceHealth, string>> = {
  archived: "Archived",
  suspended: "Suspended",
  never_connected: "Awaiting first heartbeat",
  offline: "Offline",
  not_verified: "Ingestion not verified",
  attention: "Needs attention",
  healthy: "Healthy",
};

/**
 * The MARK each verdict wears, decided once.
 *
 * Two screens declared this table for themselves and disagreed about three of
 * the seven. Diagnostics drew "Needs attention" as the amber ring and "Offline"
 * as the red triangle; Source detail drew them the other way round, and drew
 * "Awaiting first heartbeat" as a ring where Diagnostics drew the neutral bar.
 * One installation therefore had two different shapes depending on which screen
 * an operator opened, which is precisely what the design system's rule that the
 * mark is produced by ONE function exists to prevent. It sits beside
 * `HEALTH_LABEL` because a verdict's word and its shape are the same decision.
 *
 * The readings, and why each shape:
 *
 *   offline           we are WAITING on the installation. A showroom machine
 *                     switched off overnight is offline and nothing is wrong,
 *                     so this is the ring, not the triangle.
 *   attention         it is refusing, quarantining or filling its outbox.
 *                     Something is wrong and somebody has work to do: triangle.
 *   never_connected   also waiting, and the most important thing on the screen:
 *                     a credential exists and the machine has never spoken. Not
 *                     the neutral bar, which means no measurement exists at all.
 *   not_verified      connected, and no event has proved the path. Waiting.
 *   suspended         a person decided this and a person can undo it: diamond.
 *   archived          terminal and accepted: square.
 *   healthy           the filled circle, and the only one that gets it.
 */
export const HEALTH_TONE: Readonly<Record<SourceHealth, MarkTone>> = {
  archived: "settled",
  suspended: "operator",
  never_connected: "await",
  offline: "await",
  not_verified: "await",
  attention: "wrong",
  healthy: "good",
};

/* --- assembling what a screen renders --------------------------------------------- */

/** Every source in a project, with its operations row and its verdicts. */
export async function sourceViews(
  admin: ObserverAdmin,
  project: string,
  now: Date,
): Promise<readonly SourceView[]> {
  const [statuses, operations] = await Promise.all([
    admin.sourceStatus({ account: CONTROL_PLANE_ACCOUNT, project }),
    admin.sourceOperations({ account: CONTROL_PLANE_ACCOUNT, project }),
  ]);
  if (!statuses.ok) return [];

  const byId = new Map((operations.ok ? operations.value : []).map((o) => [o.source_id, o]));

  /*
   * One credential read per source. Sequential reads would be a round trip each
   * on a screen that already has two, so they go together — and the account is
   * the same on every one of them, which is what keeps the fan-out from being a
   * way to ask about somebody else's estate.
   */
  const credentials = await Promise.all(
    statuses.value.map((s) =>
      admin.credentialStatus({ account: CONTROL_PLANE_ACCOUNT, source: s.source_id }),
    ),
  );

  return statuses.value.map((status, index) => {
    const ops = byId.get(status.source_id) ?? null;
    const credentialResult = credentials[index];
    const credential = credentialResult?.ok === true ? credentialResult.value : null;
    const states = classifyStates(credential, ops);
    const fresh = heartbeatIsFresh(ops?.last_heartbeat_at ?? null, now);
    return {
      status,
      operations: ops,
      states,
      health: classifyHealth(status, ops, states, fresh),
      heartbeatFresh: fresh,
      queueFillPercent: queueFill(ops?.queue_bytes_used ?? null, ops?.queue_bytes_ceiling ?? null),
    };
  });
}
