import "server-only";

import type { ProjectSummary } from "@observer/readmodels";
import { isComplete, projectDirectoryAdmin, type ProjectDirectoryRow } from "@observer/sources";

import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";
import { observerDepsAsync } from "@/lib/sources/deps";

import { uuidFromDirectoryId } from "./identity";

/**
 * THE ESTATE'S PROJECTS, READ ONCE, AND THE ONE ANSWER TO "WHICH ROW IS THIS".
 *
 * Four places used to find the control-plane row behind a read-model project by
 * matching its slug and then its name: the three live sources and the sync
 * action. A project created in administration needs none of that, because its
 * read-model id IS its uuid rewritten (`identity.ts`), and four copies of a
 * name match are four places for a fresh project called "ISTER TOWER" to be
 * mistaken for the fixture of that name.
 *
 * So there is one function, and it asks the id first. The name match survives
 * for exactly what it was written for: a fixture whose twin an operator created
 * before projects had settings. A COMPLETE row is never offered to it — a
 * complete row is its own project, and answers only to its own id.
 */

const MEMO_MS = 30_000;
let memo: { readonly until: number; readonly rows: readonly ProjectDirectoryRow[] } | null = null;

/**
 * Every active project of the estate, complete or not.
 *
 * On a database that stops before `observer_project_directory` the read fails;
 * the older account-wide list then answers, with no settings, so the fixtures'
 * twins keep resolving on a deployment whose operator has not applied the newest
 * migration yet. Nothing is complete there, which is the truth.
 *
 * ponytail: one memo per process, thirty seconds. A grant or a project made on
 * another instance shows up to that much later; `forgetDirectoryRows` makes it
 * immediate on the instance that made it.
 */
export async function directoryRows(): Promise<readonly ProjectDirectoryRow[]> {
  if (memo !== null && memo.until > Date.now()) return memo.rows;

  let rows: readonly ProjectDirectoryRow[];
  try {
    const deps = await observerDepsAsync();
    if (deps === null) throw new Error("no control plane");
    const read = await projectDirectoryAdmin(deps).directory({ account: CONTROL_PLANE_ACCOUNT });
    rows = read.ok ? read.value : [];
  } catch (error: unknown) {
    /* With no control plane at all the older list is empty too, and says nothing. */
    rows = await legacyRows();
    if (rows.length > 0) {
      console.error(
        "[observer.directory] the project directory could not be read; projects made in administration are not shown —",
        error instanceof Error ? error.name : "unknown error",
      );
    }
  }
  memo = { until: Date.now() + MEMO_MS, rows };
  return rows;
}

async function legacyRows(): Promise<readonly ProjectDirectoryRow[]> {
  const plane = await controlPlane();
  if (!plane.ok) return [];
  const projects = await plane.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT });
  if (!projects.ok) return [];
  /* Every row, as the name match always read them: this path changes nothing for such a database. */
  return projects.value.map((row) => ({
    project_id: row.project_id,
    name: row.name,
    slug: row.slug,
    tenant_id: null,
    tenant_name: null,
    tenant_slug: null,
    currency: null,
    locale: null,
    time_zone: null,
    created_at: row.created_at,
  }));
}

export function forgetDirectoryRows(): void {
  memo = null;
}

function normalised(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The control-plane uuid that stands behind a read-model project, or null. */
export async function controlPlaneProjectFor(
  project: Pick<ProjectSummary, "id" | "slug" | "name">,
): Promise<string | null> {
  const rows = await directoryRows();

  const own = uuidFromDirectoryId(project.id as string);
  if (own !== null) {
    return rows.some((row) => row.project_id === own && isComplete(row)) ? own : null;
  }

  const twins = rows.filter((row) => !isComplete(row));
  const twin =
    twins.find((row) => row.slug !== null && row.slug === project.slug) ??
    twins.find((row) => normalised(row.name) === normalised(project.name)) ??
    null;
  return twin?.project_id ?? null;
}
