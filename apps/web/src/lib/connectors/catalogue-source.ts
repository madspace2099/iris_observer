import "server-only";

import type { CatalogueSource, DeliveredCatalogue, ProjectSummary } from "@observer/readmodels";

import { controlPlaneProjectFor } from "@/lib/directory/rows";

import { CONFIG_SCHEMAS } from "./configs";
import { liveConnectorService } from "./live";

/**
 * THE CATALOGUE SOURCE THE PRODUCT IS COMPOSED WITH.
 *
 * Asked by the repository before every view. It finds the control-plane
 * project that stands for the read-model project — by slug, else by name —
 * takes the one enabled connector whose last sync succeeded, and hands over
 * that connector's current units with its orientation mapping. Anything
 * short of that is `null`, and `null` means the synthetic catalogue: a
 * disabled connector, a refused last sync, a control plane that would not
 * open, a project with no twin.
 *
 * Nothing here may break a page. Every failure is caught, said once to the
 * server log without a value that could be a secret, and answered as `null`.
 *
 * A thirty-second memo per project keeps the three or four repository calls
 * a page makes from re-reading the control plane each time; a sync that
 * lands within that window shows on the next page after it.
 */

const MEMO_MS = 30_000;
const memo = new Map<
  string,
  { readonly until: number; readonly value: DeliveredCatalogue | null }
>();

async function resolve(project: ProjectSummary): Promise<DeliveredCatalogue | null> {
  const projectUuid = await controlPlaneProjectFor(project);
  if (projectUuid === null) return null;

  const service = await liveConnectorService();
  if (service === null) return null;

  const connectors = await service.list(projectUuid);
  const active = connectors.find((c) => c.enabled && c.lastSync?.outcome === "ok") ?? null;
  if (active === null) return null;

  const units = await service.currentUnits(projectUuid, active.kind);
  if (units.length === 0) return null;

  const config = CONFIG_SCHEMAS[active.kind].safeParse(active.config);
  return {
    connector: active.kind,
    units,
    orientationMap: config.success ? config.data.orientationMap : {},
    statusObservedAt: await statusObservedAt(service, projectUuid, active.kind, units),
  };
}

/**
 * WHEN A SYNC SAW A FLAT'S AVAILABILITY CHANGE (ADR-0049), the deals' rule
 * (`deal-source.ts`) applied to the catalogue: only a change WITNESSED between
 * two syncs onto the status the flat still has. A flat first seen already sold
 * was `added`, and its instant is when the connector was switched on. The
 * façade answers newest first, so the first status change met for a flat is
 * its latest; a thousand rows is one page, and an older change stays undated.
 */
async function statusObservedAt(
  service: NonNullable<Awaited<ReturnType<typeof liveConnectorService>>>,
  projectUuid: string,
  kind: DeliveredCatalogue["connector"],
  units: DeliveredCatalogue["units"],
): Promise<Record<string, string>> {
  const standing = new Map(units.map((u) => [u.code, u.status]));
  const met = new Set<string>();
  const out: Record<string, string> = {};
  for (const change of await service.recentChanges(projectUuid, 1000)) {
    if (change.connector !== kind || change.kind !== "changed" || met.has(change.code)) continue;
    const fields = Array.isArray(change.changed_fields) ? (change.changed_fields as unknown[]) : [];
    if (!fields.includes("status")) continue;
    met.add(change.code);
    const after = (change.after_unit as { readonly status?: unknown } | null)?.status;
    if (after === standing.get(change.code)) out[change.code] = change.fetched_at;
  }
  return out;
}

export const liveCatalogueSource: CatalogueSource = {
  async catalogueFor(project) {
    const key = project.id as string;
    const cached = memo.get(key);
    if (cached !== undefined && cached.until > Date.now()) return cached.value;

    let value: DeliveredCatalogue | null = null;
    try {
      value = await resolve(project);
    } catch (error: unknown) {
      console.error(
        "[observer.catalogue] a connector catalogue could not be read; the synthetic one is shown —",
        error instanceof Error ? error.name : "unknown error",
      );
    }
    memo.set(key, { until: Date.now() + MEMO_MS, value });
    return value;
  },
};

/** Test-only. Forgets every memoised answer. */
export function forgetCatalogueMemo(): void {
  memo.clear();
}
