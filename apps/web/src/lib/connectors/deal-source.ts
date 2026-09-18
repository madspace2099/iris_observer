import "server-only";

import type { DealSource, DeliveredDeals, ProjectSummary } from "@observer/readmodels";

import { controlPlaneProjectFor } from "@/lib/directory/rows";

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

async function resolve(project: ProjectSummary): Promise<DeliveredDeals | null> {
  const projectUuid = await controlPlaneProjectFor(project);
  if (projectUuid === null) return null;

  const service = await liveConnectorService();
  if (service === null) return null;

  const connectors = await service.list(projectUuid);
  const syncs = await service.dealSummary(projectUuid);
  const active = connectors.find((c) => c.enabled && syncs.get(c.kind)?.outcome === "ok") ?? null;
  if (active === null) return null;
  const last = syncs.get(active.kind);
  if (last === undefined) return null;

  const deals = await service.currentDeals(projectUuid, active.kind);

  /*
   * WHEN OBSERVER SAW A DEAL ARRIVE WHERE IT STANDS, for the deals whose CRM
   * states no stage instant (ADR-0039). Only a move it WITNESSED counts: a
   * `stage_changed` between two syncs, onto the stage the deal is still on. A
   * deal first seen already there is `opened`, and its instant is when the
   * connector was switched on, which would date every historical sale to the day
   * of the first sync and call a showing last week the reason for a sale last
   * year.
   *
   * The façade answers newest first, so the first row met for a deal is its
   * latest move. A thousand rows is one PostgREST page and far more recent
   * moves than the fallback needs; older ones stay unplaced, which is the
   * honest reading of a sale nobody dated.
   */
  const standing = new Map(deals.map((d) => [d.externalId, d.stage]));
  const stageObservedAt: Record<string, string> = {};
  for (const change of await service.recentDealChanges(projectUuid, 1000)) {
    if (change.connector !== active.kind || change.kind !== "stage_changed") continue;
    if (stageObservedAt[change.external_id] !== undefined) continue;
    if (standing.get(change.external_id) !== change.to_stage) continue;
    stageObservedAt[change.external_id] = change.observed_at;
  }

  return { connector: active.kind, deals, fetchedAt: last.at, stageObservedAt };
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
