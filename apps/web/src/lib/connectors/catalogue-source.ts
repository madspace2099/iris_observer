import "server-only";

import type {
  CatalogueSource,
  CatalogueStatusChange,
  DeliveredCatalogue,
  ProjectSummary,
} from "@observer/readmodels";

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
  /* An optional date: a failure to read it leaves the flats undated, never the catalogue unread. */
  let changes: Record<string, CatalogueStatusChange> = {};
  try {
    changes = await statusChanges(service, projectUuid, active.kind, units);
  } catch (error: unknown) {
    console.error(
      "[observer.catalogue] availability changes could not be read; no flat is dated —",
      error instanceof Error ? error.name : "unknown error",
    );
  }
  return {
    connector: active.kind,
    units,
    orientationMap: config.success ? config.data.orientationMap : {},
    statusChanges: changes,
  };
}

const OFF_MARKET = new Set<unknown>(["reserved", "sold"]);

const field = (unit: unknown, key: "status" | "statusRaw"): unknown =>
  (unit as Readonly<Record<string, unknown>> | null)?.[key];

/**
 * WHEN A FLAT LEFT THE MARKET (ADR-0049), the deals' rule (`deal-source.ts`)
 * applied to the catalogue: only a move WITNESSED between two syncs counts, and
 * only the move off the market, so a flat reserved on the 5th and sold on the
 * 15th is dated by the 5th. Walking a flat's status changes newest first, a
 * change from reserved to sold steps further back; the change from a status
 * the mapping knows (available, pre-reserved, …) dates it. Undated instead:
 *
 * - a flat first seen already sold — it was `added`, on the day the connector
 *   was switched on;
 * - a change from `unknown`, or with the CRM's own word unchanged — that is a
 *   status word mapped, or a map fixed, and every old sale would move with it;
 * - a run whose start lies beyond the thousand rows read, or whose rows do not
 *   chain.
 *
 * `seenBefore` is the newest sync instant among the rows read that precedes
 * the move. The sync log is not on the façade, so a sync that changed nothing
 * is invisible and the interval this gives is never narrower than the truth.
 */
async function statusChanges(
  service: NonNullable<Awaited<ReturnType<typeof liveConnectorService>>>,
  projectUuid: string,
  kind: DeliveredCatalogue["connector"],
  units: DeliveredCatalogue["units"],
): Promise<Record<string, CatalogueStatusChange>> {
  const rows = (await service.recentChanges(projectUuid, 1000)).filter((c) => c.connector === kind);
  const syncs = [...new Set(rows.map((r) => r.fetched_at))].sort(
    (a, b) => Date.parse(b) - Date.parse(a),
  );
  const moves = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    const fields = Array.isArray(row.changed_fields) ? (row.changed_fields as unknown[]) : [];
    if (row.kind !== "changed" || !fields.includes("status")) continue;
    moves.set(row.code, [...(moves.get(row.code) ?? []), row]);
  }

  const out: Record<string, CatalogueStatusChange> = {};
  for (const unit of units) {
    let expected: unknown = unit.status;
    if (!OFF_MARKET.has(expected)) continue;
    for (const row of moves.get(unit.code) ?? []) {
      if (field(row.after_unit, "status") !== expected) break;
      const raw = field(row.before_unit, "statusRaw");
      if (raw !== undefined && raw === field(row.after_unit, "statusRaw")) break;
      const before = field(row.before_unit, "status");
      if (OFF_MARKET.has(before)) {
        expected = before;
        continue;
      }
      if (typeof before !== "string" || before === "unknown") break;
      const seenBefore = syncs.find((t) => Date.parse(t) < Date.parse(row.fetched_at));
      if (seenBefore !== undefined) {
        out[unit.code] = {
          at: row.fetched_at,
          to: expected === "sold" ? "sold" : "reserved",
          seenBefore,
        };
      }
      break;
    }
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
