import "server-only";

import type { ObserverAdmin, SourceOperationsRow } from "@observer/sources";

import {
  CONTROL_PLANE_ACCOUNT,
  heartbeatIsFresh,
  queueFill,
  type SourceHealth,
} from "@/lib/sources/control-plane";
import { count, duration, percent } from "@/lib/madspace/format";

/**
 * What the Diagnostics screen reads.
 *
 * ## Two reads, account-wide, and nothing else
 *
 * `observer_source_operations` with a null project is the only facade that
 * spans the account, and it already carries every column this screen shows:
 * the two instants, the queue pair, the four refusal counters and the last
 * error CODE. So the whole screen is one read plus `projectsForAccount`, which
 * exists solely so a row can be labelled with the project's NAME rather than
 * with its uuid.
 *
 * Nothing here reaches for a per-source read. An earlier sketch called
 * `sourceViews` once per project to get the shared `classifyHealth`, which is
 * a credential round trip per SOURCE on a screen whose entire point is to be
 * readable in five seconds on a bad day.
 *
 * ## Why the verdict is derived here rather than imported
 *
 * `classifyHealth` takes a `SourceStatusRow`. The account-wide facade returns
 * `SourceOperationsRow`, which carries every column that verdict actually reads
 * — `state`, `last_heartbeat_at`, `ingestion_verified_at`, the two quarantine
 * counts and the queue pair — but not `created_at`, which `SourceStatusRow`
 * declares non-null. Satisfying that type would mean inventing a timestamp, and
 * a fabricated value smuggled in to satisfy a compiler is still a fabricated
 * value. {@link healthOf} therefore restates the SAME precedence over the row
 * this screen actually has, and the vocabulary itself (`SourceHealth`,
 * `HEALTH_LABEL`) is still the shared one, so the words cannot drift even
 * though the two derivations are separate functions.
 *
 * ## What is deliberately absent
 *
 * No visitor subject, no agent, no event property, no raw error body, no stack,
 * no credential, no verifier, no selector, no token. If a field is not in
 * `SourceOperationsRow` or `ProjectSummaryRow` it does not appear on this
 * screen, and the shape below is the enforcement of that: every value a section
 * renders is reachable only through {@link DiagnosticSource.row}.
 */

/* --- the filter ------------------------------------------------------------------ */

/**
 * The narrowing, as it arrives in the URL.
 *
 * In the query string rather than in component state, so a filtered view is a
 * link. An operator who finds the one wrong row pastes the address into a
 * support conversation and the person reading it sees the same estate.
 *
 * Null means "not narrowed" and is never a sentinel string: an environment
 * literally named `all` would otherwise be unselectable.
 */
export interface DiagnosticsFilter {
  readonly project: string | null;
  readonly environment: string | null;
  readonly health: SourceHealth | null;
}

/** The query keys, in one place so the page and the control agree. */
export const FILTER_KEYS = {
  project: "project",
  environment: "environment",
  health: "health",
} as const;

/**
 * Every verdict, worst first.
 *
 * This order is the screen's sort key and the filter's option order, and it is
 * a judgement rather than an enumeration: OFFLINE outranks NEEDS ATTENTION
 * because an installation saying nothing at all is worse than one whose events
 * are partly being refused, and SUSPENDED sits below both because it is a state
 * somebody chose. ARCHIVED is last because nothing further is expected of it.
 */
export const HEALTH_ORDER: readonly SourceHealth[] = [
  "offline",
  "attention",
  "suspended",
  "not_verified",
  "never_connected",
  "healthy",
  "archived",
];

/** The verdicts section one exists for. Anything else is not a problem today. */
const REQUIRES_ATTENTION: readonly SourceHealth[] = ["offline", "attention", "suspended"];

function severity(health: SourceHealth): number {
  const index = HEALTH_ORDER.indexOf(health);
  return index === -1 ? HEALTH_ORDER.length : index;
}

/** A query value, or null. Repeated keys take the first, which is what a form sends. */
function one(value: string | readonly string[] | undefined): string | null {
  if (value === undefined) return null;
  const first = typeof value === "string" ? value : value[0];
  if (first === undefined) return null;
  const trimmed = first.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Reads the filter out of the query string.
 *
 * A health that is not one of the seven words is discarded rather than
 * preserved, because a filter nobody can satisfy renders an empty screen that
 * looks exactly like a healthy estate. Project and environment are NOT
 * validated here — they are matched against the rows, so an unknown one
 * narrows to nothing and the screen says so in words.
 */
export function parseFilter(
  params: Readonly<Record<string, string | string[] | undefined>>,
): DiagnosticsFilter {
  const health = one(params[FILTER_KEYS.health]);
  return {
    project: one(params[FILTER_KEYS.project]),
    environment: one(params[FILTER_KEYS.environment]),
    health: HEALTH_ORDER.find((candidate) => candidate === health) ?? null,
  };
}

/** True when the URL narrows anything at all. */
export function filterIsNarrowed(filter: DiagnosticsFilter): boolean {
  return filter.project !== null || filter.environment !== null || filter.health !== null;
}

/* --- one source, as this screen needs it ------------------------------------------- */

export interface DiagnosticSource {
  /** The persisted row. Every rendered value comes from here or from the project name. */
  readonly row: SourceOperationsRow;
  /**
   * The owning project's name, or null when the project read did not return it.
   *
   * Null rather than the uuid: a screen that silently substitutes an identifier
   * for a name teaches the reader that the two are interchangeable, and they
   * are not. The markup says "Project not named" and shows the identifier
   * beside it where that happens.
   */
  readonly projectName: string | null;
  readonly health: SourceHealth;
  readonly heartbeatFresh: boolean;
  readonly queueFillPercent: number | null;
  /**
   * Local plus backend quarantine, or null when NEITHER was reported.
   *
   * Null and zero are different facts: a plugin that could not count its
   * quarantine has not told us it is empty. When one of the two is reported the
   * sum is the reported part, because that much is measured.
   */
  readonly quarantined: number | null;
  /**
   * Why this source is on the attention list, in a sentence — or null when it
   * is not on it. Composed from the same columns the verdict reads, so the
   * reason and the word can never disagree.
   */
  readonly reason: string | null;
}

/** How old the last heartbeat is, in seconds, or null when there has never been one. */
function heartbeatAgeSeconds(at: string | null, now: Date): number | null {
  if (at === null) return null;
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((now.getTime() - parsed) / 1000));
}

/**
 * The verdict, from the operations row alone.
 *
 * Read top to bottom: the first line that matches wins. The precedence is the
 * one `classifyHealth` documents — lifecycle beats liveness because a suspended
 * source is switched off deliberately; never-connected beats offline because a
 * source created a minute ago has not failed at anything; quarantine beats
 * queue pressure because a rising quarantine means events are being REFUSED
 * while a full outbox only means they have not been sent yet.
 */
export function healthOf(row: SourceOperationsRow, now: Date): SourceHealth {
  if (row.state === "archived") return "archived";
  if (row.state === "suspended") return "suspended";
  if (row.last_heartbeat_at === null) return "never_connected";
  if (!heartbeatIsFresh(row.last_heartbeat_at, now)) return "offline";

  const quarantined = (row.quarantine_count ?? 0) + (row.backend_quarantine_count ?? 0);
  if (quarantined > 0) return "attention";

  const fill = queueFill(row.queue_bytes_used, row.queue_bytes_ceiling);
  if (fill !== null && fill >= 80) return "attention";

  if (row.ingestion_verified_at === null) return "not_verified";
  return "healthy";
}

/**
 * The reason, in words, for a source that is on the attention list.
 *
 * Never a colour and never a code. The operator reading this line is deciding
 * whether to open the source or to leave it, and "Needs attention" alone does
 * not let them decide. Each clause names the persisted fact that produced the
 * verdict, in the units the plugin reported it in.
 */
function reasonFor(row: SourceOperationsRow, health: SourceHealth, now: Date): string | null {
  if (health === "suspended") {
    return "Suspended by an operator. What this installation sends is refused until somebody resumes it, so its silence is expected rather than a fault.";
  }

  if (health === "offline") {
    const age = heartbeatAgeSeconds(row.last_heartbeat_at, now);
    const span = age === null ? "some time" : duration(age);
    return `No heartbeat for ${span}. The installation has connected before and has said nothing since, which is longer than the fifteen minutes this surface judges Connected by.`;
  }

  if (health !== "attention") return null;

  /*
   * Both causes can hold at once, and when they do the operator is told both:
   * clearing a full outbox does nothing about events the backend already
   * refused, and the two fixes are different people's work.
   */
  const clauses: string[] = [];
  const local = row.quarantine_count ?? 0;
  const backend = row.backend_quarantine_count ?? 0;
  if (local + backend > 0) {
    /*
     * Through `count` and `percent`, which hold the one pinned `Intl` these
     * screens share. Interpolated raw, a four-figure quarantine printed "1024"
     * in this sentence and "1,024" in the table cell beside it, which is the
     * same measurement written two ways on one row.
     */
    const parts: string[] = [];
    if (local > 0) parts.push(`${count(local).text} held in the installation's own quarantine`);
    if (backend > 0) parts.push(`${count(backend).text} refused at the backend`);
    clauses.push(
      `Quarantine rising: ${parts.join(", ")}. Counts from this source are incomplete until it is cleared.`,
    );
  }

  const fill = queueFill(row.queue_bytes_used, row.queue_bytes_ceiling);
  if (fill !== null && fill >= 80) {
    clauses.push(
      `Outbox at ${percent(fill).text} of its ceiling. If the fill keeps climbing, events start being refused for capacity.`,
    );
  }

  /* The verdict said attention, so at least one clause holds; this is the floor. */
  return clauses.length === 0
    ? "Needs attention. The operational counters moved past the thresholds this surface watches."
    : clauses.join(" ");
}

/* --- the estate ------------------------------------------------------------------- */

export interface DiagnosticsEstate {
  /** Every source under the account, before the filter. */
  readonly all: readonly DiagnosticSource[];
  /** What the filter left, worst first. Every section reads this. */
  readonly shown: readonly DiagnosticSource[];
  /** Project id and name, for the filter control. Only projects holding sources. */
  readonly projects: readonly { readonly id: string; readonly name: string }[];
  /** Environments actually present in the estate, so the control cannot offer a dead option. */
  readonly environments: readonly string[];
  /** Verdicts actually present, worst first, so the control cannot offer a dead option. */
  readonly healths: readonly SourceHealth[];
}

/**
 * Worst first, and the tie-breaks are deliberate.
 *
 * Severity decides; then PRODUCTION before staging, because a broken showroom
 * in front of buyers outranks a broken test rig; then the stalest heartbeat,
 * because among two equally broken sources the one that has been silent longest
 * has been wrong for longest. A source that has never been heard from sorts
 * after ones that have, since it has no staleness to measure.
 */
function worstFirst(a: DiagnosticSource, b: DiagnosticSource, now: Date): number {
  const bySeverity = severity(a.health) - severity(b.health);
  if (bySeverity !== 0) return bySeverity;

  const production =
    Number(b.row.environment === "production") - Number(a.row.environment === "production");
  if (production !== 0) return production;

  const ageA = heartbeatAgeSeconds(a.row.last_heartbeat_at, now);
  const ageB = heartbeatAgeSeconds(b.row.last_heartbeat_at, now);
  if (ageA === null && ageB === null) return a.row.display_label.localeCompare(b.row.display_label);
  if (ageA === null) return 1;
  if (ageB === null) return -1;
  return ageB - ageA;
}

/**
 * Reads the estate and applies the filter.
 *
 * Returns an estate with no sources when either read fails, which the page
 * distinguishes from an empty account by checking the control plane itself —
 * telling an operator their estate is empty when the database would not open is
 * the worst available answer, because it is the one they might believe.
 */
export async function diagnosticsEstate(
  admin: ObserverAdmin,
  filter: DiagnosticsFilter,
  now: Date,
): Promise<DiagnosticsEstate> {
  const [operations, projects] = await Promise.all([
    admin.sourceOperations({ account: CONTROL_PLANE_ACCOUNT, project: null }),
    admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT }),
  ]);

  const rows = operations.ok ? operations.value : [];
  const names = new Map(
    (projects.ok ? projects.value : []).map((project) => [project.project_id, project.name]),
  );

  const all = rows.map((row) => {
    const health = healthOf(row, now);
    const local = row.quarantine_count;
    const backend = row.backend_quarantine_count;
    return {
      row,
      projectName: names.get(row.project_id) ?? null,
      health,
      heartbeatFresh: heartbeatIsFresh(row.last_heartbeat_at, now),
      queueFillPercent: queueFill(row.queue_bytes_used, row.queue_bytes_ceiling),
      quarantined: local === null && backend === null ? null : (local ?? 0) + (backend ?? 0),
      reason: reasonFor(row, health, now),
    } satisfies DiagnosticSource;
  });

  const shown = all
    .filter((source) => {
      if (filter.project !== null && source.row.project_id !== filter.project) return false;
      if (filter.environment !== null && source.row.environment !== filter.environment)
        return false;
      if (filter.health !== null && source.health !== filter.health) return false;
      return true;
    })
    .sort((a, b) => worstFirst(a, b, now));

  /*
   * The control offers what the estate holds, not what the vocabulary allows.
   * A select listing seven verdicts over an estate of one source is five
   * choices that lead to an empty screen, and an empty screen with a filter on
   * it is the commonest way an operations surface tells a quiet lie.
   */
  const environments = [...new Set(all.map((source) => source.row.environment))].sort();
  const present = new Set(all.map((source) => source.health));
  const healths = HEALTH_ORDER.filter((health) => present.has(health));

  return {
    all,
    shown,
    projects: [...names]
      .filter(([id]) => all.some((source) => source.row.project_id === id))
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    environments,
    healths,
  };
}

/* --- the sections ------------------------------------------------------------------ */

/** How many rows a recency section shows before it stops being scannable. */
export const RECENT_LIMIT = 8;

/** Section one: everything whose verdict is a problem, worst first. */
export function requiringAttention(estate: DiagnosticsEstate): readonly DiagnosticSource[] {
  return estate.shown.filter((source) => REQUIRES_ATTENTION.includes(source.health));
}

/** An instant, as a sortable number. Absent and unparseable both sort last. */
function at(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** Section two: the sources that have said anything at all, most recent first. */
export function recentHeartbeats(estate: DiagnosticsEstate): readonly DiagnosticSource[] {
  return estate.shown
    .filter((source) => source.row.last_heartbeat_at !== null)
    .sort((a, b) => at(b.row.last_heartbeat_at) - at(a.row.last_heartbeat_at))
    .slice(0, RECENT_LIMIT);
}

/** Section three: the sources that have proved an event reaches storage. */
export function recentVerifications(estate: DiagnosticsEstate): readonly DiagnosticSource[] {
  return estate.shown
    .filter((source) => source.row.ingestion_verified_at !== null)
    .sort((a, b) => at(b.row.ingestion_verified_at) - at(a.row.ingestion_verified_at))
    .slice(0, RECENT_LIMIT);
}

/**
 * Section four: the fullest outboxes.
 *
 * Only sources whose fill could actually be computed. A source that reported
 * neither number is not at 0% and must not be ranked as though it were — the
 * count of those is reported separately by {@link queueUnmeasured} so the
 * absence is stated instead of disappearing.
 */
export function queuePressure(estate: DiagnosticsEstate): readonly DiagnosticSource[] {
  return estate.shown
    .filter((source) => source.queueFillPercent !== null)
    .sort((a, b) => (b.queueFillPercent ?? 0) - (a.queueFillPercent ?? 0))
    .slice(0, RECENT_LIMIT);
}

/** How many connected sources could not report a usable outbox measurement. */
export function queueUnmeasured(estate: DiagnosticsEstate): number {
  return estate.shown.filter(
    (source) => source.queueFillPercent === null && source.row.last_heartbeat_at !== null,
  ).length;
}

/**
 * Section five: everything with a refusal on the record.
 *
 * A source whose counters are all null is NOT here, because it has not reported
 * an empty quarantine — it has reported nothing, and putting it in a table of
 * zeroes would turn an unmeasured source into a clean one.
 */
export function quarantineActivity(estate: DiagnosticsEstate): readonly DiagnosticSource[] {
  return estate.shown
    .filter((source) => source.quarantined !== null && source.quarantined > 0)
    .sort((a, b) => (b.quarantined ?? 0) - (a.quarantined ?? 0));
}

/** Section six: the last safe error CODE each source reported. Never a message. */
export function recentErrorCodes(estate: DiagnosticsEstate): readonly DiagnosticSource[] {
  return estate.shown
    .filter((source) => source.row.last_error_code !== null)
    .sort((a, b) => at(b.row.last_seen_at) - at(a.row.last_seen_at))
    .slice(0, RECENT_LIMIT);
}
