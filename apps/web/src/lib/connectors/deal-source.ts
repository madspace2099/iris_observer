import "server-only";

import type { DealSource, DeliveredDeals, ProjectSummary } from "@observer/readmodels";

import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";

import { liveConnectorService } from "./live";

/**
 * THE DEAL SOURCE THE PRODUCT IS COMPOSED WITH.
 *
 * The same shape as `liveCatalogueSource`, asked by the repository before
 * every view: the control-plane twin of the read-model project, the one
 * enabled connector whose last deal sync succeeded, and that connector's
 * current deals. Anything short of that is `null`, and `null` means the
 * ladder says the CRM is not connected: a disabled connector, a refused
 * last sync, a project with no twin, a server without the deals store.
 *
 * Nothing here may break a page, and nothing here holds a person: the
 * deals carry subject keys, never an email or a number. A thirty-second
 * memo per project, as the catalogue's.
 */

const MEMO_MS = 30_000;
const memo = new Map<string, { readonly until: number; readonly value: DeliveredDeals | null }>();

function normalised(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function resolve(project: ProjectSummary): Promise<DeliveredDeals | null> {
  const plane = await controlPlane();
  if (!plane.ok) return null;
  const projects = await plane.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT });
  if (!projects.ok) return null;
  const twin =
    projects.value.find((row) => row.slug !== null && row.slug === project.slug) ??
    projects.value.find((row) => normalised(row.name) === normalised(project.name)) ??
    null;
  if (twin === null) return null;

  const service = await liveConnectorService();
  if (service === null) return null;

  const connectors = await service.list(twin.project_id);
  const syncs = await service.dealSummary(twin.project_id);
  const active = connectors.find((c) => c.enabled && syncs.get(c.kind)?.outcome === "ok") ?? null;
  if (active === null) return null;
  const last = syncs.get(active.kind);
  if (last === undefined) return null;

  const deals = await service.currentDeals(twin.project_id, active.kind);
  return { connector: active.kind, deals, fetchedAt: last.at };
}

export const liveDealSource: DealSource = {
  async dealsFor(project) {
    const key = project.id as string;
    const cached = memo.get(key);
    if (cached !== undefined && cached.until > Date.now()) return cached.value;

    let value: DeliveredDeals | null = null;
    try {
      value = await resolve(project);
    } catch (error: unknown) {
      console.error(
        "[observer.deals] a connector's deals could not be read; the ladder says not connected —",
        error instanceof Error ? error.name : "unknown error",
      );
    }
    memo.set(key, { until: Date.now() + MEMO_MS, value });
    return value;
  },
};

/** Test-only. Forgets every memoised answer. */
export function forgetDealMemo(): void {
  memo.clear();
}
