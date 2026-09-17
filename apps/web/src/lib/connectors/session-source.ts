import "server-only";

import type {
  DeliveredSessions,
  ProjectSummary,
  ShowroomSessionSource,
} from "@observer/readmodels";
import { SHOWROOM_SOURCE_KINDS } from "@observer/contracts";
import { foldUe5Sessions } from "@observer/connectors";
import { readProjectEvents } from "@observer/sources";

import { controlPlaneProjectFor } from "@/lib/directory/rows";
import { CONTROL_PLANE_ACCOUNT } from "@/lib/sources/control-plane";
import { observerDepsAsync } from "@/lib/sources/deps";

import { liveSessionSourceService } from "./live";

/**
 * THE SESSION SOURCE THE PRODUCT IS COMPOSED WITH.
 *
 * The same shape as `liveDealSource`: the control-plane twin of the
 * read-model project, and then two places its real sessions can come from —
 * the events its showrooms sent through `/ingest`, and an enabled telemetry
 * connector whose last sync succeeded. Neither answering is `null`, and
 * `null` means the synthetic generator answers for the project as before — a
 * project with no twin, no events, a disabled source, a refused last sync.
 */

const MEMO_MS = 30_000;
const memo = new Map<
  string,
  { readonly until: number; readonly value: DeliveredSessions | null }
>();

async function resolve(project: ProjectSummary): Promise<DeliveredSessions | null> {
  const projectUuid = await controlPlaneProjectFor(project);
  if (projectUuid === null) return null;

  const [ingested, connected] = await Promise.all([
    ingestedSessions(projectUuid, project.id as string),
    connectorSessions(projectUuid),
  ]);
  if (ingested === null) return connected;
  if (connected === null) return ingested;

  /* Both answered. An id the showroom sent itself wins over the same id pulled from a legacy table. */
  const own = new Set(ingested.sessions.map((s) => s.sessionId));
  return {
    connector: ingested.connector,
    sessions: [...connected.sessions.filter((s) => !own.has(s.sessionId)), ...ingested.sessions],
    fetchedAt: ingested.fetchedAt > connected.fetchedAt ? ingested.fetchedAt : connected.fetchedAt,
  };
}

/** A configured telemetry connector's last good snapshot, as before V2 ingestion existed. */
async function connectorSessions(projectUuid: string): Promise<DeliveredSessions | null> {
  const service = await liveSessionSourceService();
  if (service === null) return null;

  const sources = await service.list(projectUuid);
  const active = sources.find((s) => s.enabled && s.lastSync?.outcome === "ok") ?? null;
  if (active === null) return null;
  const last = active.lastSync;
  if (last === null) return null;

  const sessions = await service.currentSessions(projectUuid, active.kind);
  return { connector: active.kind, sessions, fetchedAt: last.at };
}

/**
 * The sessions this project's showrooms sent through `/ingest`, folded from the
 * event store. `null` when none have arrived — and when the read itself fails,
 * which it will on a database whose migrations stop before
 * `observer_events_for_project`: that must cost this path only, never the
 * connector's sessions beside it.
 *
 * ponytail: read a page at a time and folded, behind the 30 s memo. Materialise
 * at ingest when a project's event count makes this slow.
 */
async function ingestedSessions(
  projectUuid: string,
  readModelProjectId: string,
): Promise<DeliveredSessions | null> {
  try {
    const deps = await observerDepsAsync();
    if (deps === null) return null;
    const { events, complete } = await readProjectEvents(deps.db, {
      account: CONTROL_PLANE_ACCOUNT,
      project: projectUuid,
    });
    if (!complete) {
      console.error(
        "[observer.sessions] a project's events were read in part; its newest meetings are missing until sessions are materialised at ingest",
      );
    }
    const sessions = foldUe5Sessions(events, readModelProjectId);
    if (sessions.length === 0) return null;
    const fetchedAt = events.reduce((max, e) => (e.ingested_at > max ? e.ingested_at : max), "");
    return { connector: "ue5_events", sessions, fetchedAt };
  } catch (error: unknown) {
    console.error(
      "[observer.sessions] the event store could not be read for sessions —",
      error instanceof Error ? error.name : "unknown error",
    );
    return null;
  }
}

export const liveSessionSource: ShowroomSessionSource = {
  async sessionsFor(project) {
    const key = project.id as string;
    const cached = memo.get(key);
    if (cached !== undefined && cached.until > Date.now()) return cached.value;

    let value: DeliveredSessions | null = null;
    try {
      value = await resolve(project);
    } catch (error: unknown) {
      console.error(
        "[observer.sessions] a source's sessions could not be read; the synthetic world answers instead —",
        error instanceof Error ? error.name : "unknown error",
      );
    }
    memo.set(key, { until: Date.now() + MEMO_MS, value });
    return value;
  },
};

/** Forgets every memoised answer: for tests, and for the review harness after it sends a meeting. */
export function forgetSessionMemo(): void {
  memo.clear();
}

/** So a caller can tell a telemetry-source kind from a `ConnectorKind` without importing contracts twice. */
export const SESSION_SOURCE_KIND_LIST = SHOWROOM_SOURCE_KINDS;
