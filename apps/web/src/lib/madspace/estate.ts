import "server-only";

import type { ObserverAdmin, SourceOperationsRow } from "@observer/sources";

import { CONTROL_PLANE_ACCOUNT } from "@/lib/sources/control-plane";

/**
 * What the operations screens read that `control-plane.ts` does not already
 * give them.
 *
 * Both shapes are account-scoped, because `observer.projects` and
 * `observer.project_sources` are owned by a role nobody can log in as and every
 * facade takes the account as its first argument.
 *
 * Projects are enumerated through `observer_projects_for_account` (migration
 * `20260902140000`), and that facade exists because of this screen. Before it,
 * the only account-wide read enumerated SOURCES, which had two consequences:
 *
 *   - a project could be listed only by its UUID, because no readable surface
 *     carried its name — and inventing a display name client-side would be the
 *     fabrication the doctrine forbids;
 *   - a project holding NO sources was invisible entirely, which is exactly
 *     the state left behind if a process dies between creating a project and
 *     creating its first source.
 *
 * A missing read is fixed with a read rather than with a fallback.
 */

export interface ProjectSummary {
  /**
   * The project's own name, e.g. ISTER TOWER.
   *
   * Present because migration `20260902140000` added the read that can see it.
   * Before that this screen rendered a UUID and said so — which was honest, and
   * unusable: an operator does not know their estate by identifier. Inventing a
   * label client-side would have been worse than the UUID, so the fix was a
   * facade rather than a fallback.
   */
  readonly name: string;
  readonly status: string;
  readonly projectId: string;
  /** Every source under the project, including archived ones. */
  readonly sourceCount: number;
  /** Sources whose `last_heartbeat_at` is set. Freshness is judged per source. */
  readonly connectedCount: number;
  /** Sources that have proved an event reached storage at least once. */
  readonly verifiedCount: number;
  /** The most recent of any operational instant across the project's sources. */
  readonly lastActivity: string | null;
}

/**
 * Every project this account has a source in, newest activity first.
 *
 * One round trip. An earlier shape called `sourceStatus` per project as well,
 * which was a second read of the same rows through a narrower facade — and the
 * counts this screen shows all come from the operations row anyway.
 */
export async function projectSummaries(admin: ObserverAdmin): Promise<readonly ProjectSummary[]> {
  const result = await admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT });
  if (!result.ok) return [];

  /*
   * One read, and the counts arrive already computed by the same scan that
   * found the projects — so the three numbers cannot disagree with each other,
   * and a project holding no sources still appears. Grouping operations rows
   * client-side could do neither: it could not name a project, and a project
   * with nothing in it produced no rows to group.
   */
  return result.value.map((row) => ({
    projectId: row.project_id,
    name: row.name,
    status: row.status,
    sourceCount: Number(row.source_count),
    connectedCount: Number(row.connected_count),
    verifiedCount: Number(row.verified_count),
    lastActivity: row.last_activity_at,
  }));
}

/**
 * Which project a source belongs to, or null.
 *
 * Source Detail is reached by `source_id` alone, and every read beneath it is
 * project-scoped, so the project has to be resolved first. Null covers "no such
 * source", "another account's source" and "not a well-formed identifier"
 * together, deliberately: `ObserverAdmin` conflates them for the same reason,
 * and a screen that told them apart would be an existence oracle for somebody
 * else's estate.
 */
export async function locateSource(
  admin: ObserverAdmin,
  sourceId: string,
): Promise<SourceOperationsRow | null> {
  const result = await admin.sourceOperations({ account: CONTROL_PLANE_ACCOUNT, project: null });
  if (!result.ok) return null;
  return result.value.find((row) => row.source_id === sourceId) ?? null;
}
