import "server-only";

import type { DeliveredSessions, ProjectSummary, ShowroomSessionSource } from "@observer/readmodels";
import { SHOWROOM_SOURCE_KINDS } from "@observer/contracts";
import { PROJECTS } from "@observer/synthetic";

import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";

import { liveSessionSourceService } from "./live";

/**
 * THE SESSION SOURCE THE PRODUCT IS COMPOSED WITH.
 *
 * The same shape as `liveDealSource`: the control-plane twin of the
 * read-model project, an enabled telemetry source whose last sync
 * succeeded, and that source's current sessions. Anything short of that is
 * `null`, and `null` means the synthetic generator answers for the project
 * as before — a disabled source, a refused last sync, a project with no
 * twin, a server without the sessions store.
 */

const MEMO_MS = 30_000;
const memo = new Map<string, { readonly until: number; readonly value: DeliveredSessions | null }>();

function normalised(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function resolve(project: ProjectSummary): Promise<DeliveredSessions | null> {
  const plane = await controlPlane();
  if (!plane.ok) return null;
  const projects = await plane.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT });
  if (!projects.ok) return null;
  const twin =
    projects.value.find((row) => row.slug !== null && row.slug === project.slug) ??
    projects.value.find((row) => normalised(row.name) === normalised(project.name)) ??
    null;
  if (twin === null) return null;

  const service = await liveSessionSourceService();
  if (service === null) return null;

  const sources = await service.list(twin.project_id);
  const active = sources.find((s) => s.enabled && s.lastSync?.outcome === "ok") ?? null;
  if (active === null) return null;
  const last = active.lastSync;
  if (last === null) return null;

  const sessions = await service.currentSessions(twin.project_id, active.kind);
  return { connector: active.kind, sessions, fetchedAt: last.at };
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

/** Test-only. Forgets every memoised answer. */
export function forgetSessionMemo(): void {
  memo.clear();
}

/** So a caller can tell a telemetry-source kind from a `ConnectorKind` without importing contracts twice. */
export const SESSION_SOURCE_KIND_LIST = SHOWROOM_SOURCE_KINDS;

/**
 * The read-model project id for a control-plane project row, or `null`.
 *
 * The MADSPACE Integrations screen syncs by control-plane project UUID, but
 * `supabaseShowroomFetchSessions` stamps the READ-MODEL project id onto every
 * `ShowroomSession` it produces — the same identity `overlaySessions` keys its
 * delivery by. This is `resolve`'s own twin match, run in the other direction,
 * so the two stay one rule rather than two that could drift apart. `null`
 * means no synthetic-world project answers to this row yet, which the sync
 * action turns into a sentence rather than stamping a wrong or invented id.
 */
export function readModelProjectIdFor(twin: {
  readonly slug: string | null;
  readonly name: string;
}): string | null {
  const project =
    PROJECTS.find((p) => twin.slug !== null && p.slug === twin.slug) ??
    PROJECTS.find((p) => normalised(p.name) === normalised(twin.name)) ??
    null;
  return project === null ? null : (project.id as string);
}
