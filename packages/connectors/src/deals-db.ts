import {
  CrmDealSchema,
  type ConnectorKind,
  type CrmDeal,
  type DealSnapshot,
  type DealStageChange,
} from "@observer/contracts";
import {
  asNumber,
  rows,
  rpc,
  rpcEveryRow,
  scalar,
  table,
  type PostgrestConfig,
  type SqlQuery,
} from "./db";
import type { DealStore, DealSyncOutcome } from "./deals";

/**
 * THE DEALS' DATABASE PORT, AND ITS TWO ADAPTERS.
 *
 * The same arrangement as the catalogue's (`db.ts`): every method is a
 * `security definer` façade in
 * `supabase/migrations/20260907180000_observer_deals.sql`, reached over
 * PostgREST in a deployment and over plain SQL in a PGlite test, and both
 * adapters call the same façade names with the same argument lists. Nothing
 * here logs, and nothing here ever holds a person: the deal rows carry a
 * subject key the application hashed before they were written.
 */

export const DEALS_FACADES = [
  "observer_deals_apply",
  "observer_deals_current",
  "observer_deal_changes",
  "observer_deal_sync_record",
  "observer_deal_sync_last",
] as const;
export type DealsFacade = (typeof DEALS_FACADES)[number];

export interface DealsApplyRow {
  readonly opened: number;
  readonly changed: number;
  readonly withdrawn: number;
}

export interface DealRow {
  readonly external_id: string;
  readonly deal: unknown;
  readonly fetched_at: string;
}

export interface DealChangeRow {
  readonly event_id: string;
  readonly connector: string;
  readonly external_id: string;
  readonly kind: string;
  readonly unit_code: string | null;
  readonly subject_key: string | null;
  readonly from_stage: string | null;
  readonly from_raw: string | null;
  readonly to_stage: string | null;
  readonly to_raw: string | null;
  readonly at: string;
  readonly observed_at: string;
  readonly recorded_at: string;
}

export interface DealSyncRecordInput {
  readonly outcome: string;
  readonly fetched: number;
  readonly opened: number;
  readonly changed: number;
  readonly withdrawn: number;
  readonly unmappedStages: readonly string[];
  readonly retryAfterSeconds: number | null;
  readonly detail: string;
}

export interface DealSyncLastRow {
  readonly connector: string;
  readonly started_at: string;
  readonly outcome: string;
  readonly fetched: number;
  readonly unmapped_stages: unknown;
  readonly detail: string;
}

export interface DealsDb {
  /** Null when the project is not the account's: nothing was written. */
  dealsApply(
    account: string,
    project: string,
    connector: ConnectorKind,
    fetchedAt: string,
    deals: readonly CrmDeal[],
    changes: readonly DealStageChange[],
  ): Promise<DealsApplyRow | null>;
  dealsCurrent(
    account: string,
    project: string,
    connector: ConnectorKind,
  ): Promise<readonly DealRow[]>;
  dealChanges(account: string, project: string, limit: number): Promise<readonly DealChangeRow[]>;
  dealSyncRecord(
    account: string,
    project: string,
    connector: ConnectorKind,
    record: DealSyncRecordInput,
  ): Promise<number | null>;
  dealSyncLast(account: string, project: string): Promise<readonly DealSyncLastRow[]>;
}

const applyRow = (row: unknown): DealsApplyRow | null => {
  const r = row as DealsApplyRow | undefined;
  return r === undefined
    ? null
    : {
        opened: asNumber(r.opened),
        changed: asNumber(r.changed),
        withdrawn: asNumber(r.withdrawn),
      };
};

const lastRow = (r: unknown): DealSyncLastRow => {
  const row = r as DealSyncLastRow;
  return { ...row, fetched: asNumber(row.fetched) };
};

export function sqlDealsDb(query: SqlQuery): DealsDb {
  return {
    async dealsApply(account, project, connector, fetchedAt, deals, changes) {
      const list = await table(
        query,
        "observer_deals_apply",
        "$1, $2, $3, $4::timestamptz, $5::jsonb, $6::jsonb",
        [account, project, connector, fetchedAt, JSON.stringify(deals), JSON.stringify(changes)],
      );
      return applyRow(list[0]);
    },
    async dealsCurrent(account, project, connector) {
      return (await table(query, "observer_deals_current", "$1, $2, $3", [
        account,
        project,
        connector,
      ])) as readonly DealRow[];
    },
    async dealChanges(account, project, limit) {
      return (await table(query, "observer_deal_changes", "$1, $2, $3", [
        account,
        project,
        limit,
      ])) as readonly DealChangeRow[];
    },
    async dealSyncRecord(account, project, connector, record) {
      const id = await scalar<number | string | null>(
        query,
        "observer_deal_sync_record",
        "$1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11",
        [
          account,
          project,
          connector,
          record.outcome,
          record.fetched,
          record.opened,
          record.changed,
          record.withdrawn,
          JSON.stringify(record.unmappedStages),
          record.retryAfterSeconds,
          record.detail,
        ],
      );
      return id === null ? null : asNumber(id);
    },
    async dealSyncLast(account, project) {
      return (await table(query, "observer_deal_sync_last", "$1, $2", [account, project])).map(
        lastRow,
      );
    },
  };
}

export function postgrestDealsDb(config: PostgrestConfig): DealsDb {
  return {
    async dealsApply(p_account, p_project, p_connector, p_fetched_at, p_deals, p_changes) {
      const list = rows(
        await rpc(config, "observer_deals_apply", {
          p_account,
          p_project,
          p_connector,
          p_fetched_at,
          p_deals,
          p_changes,
        }),
      );
      return applyRow(list[0]);
    },
    async dealsCurrent(p_account, p_project, p_connector) {
      return (await rpcEveryRow(
        config,
        "observer_deals_current",
        { p_account, p_project, p_connector },
        "external_id",
      )) as readonly DealRow[];
    },
    async dealChanges(p_account, p_project, p_limit) {
      return rows(
        await rpc(config, "observer_deal_changes", { p_account, p_project, p_limit }),
      ) as readonly DealChangeRow[];
    },
    async dealSyncRecord(p_account, p_project, p_connector, record) {
      const value = await rpc(config, "observer_deal_sync_record", {
        p_account,
        p_project,
        p_connector,
        p_outcome: record.outcome,
        p_fetched: record.fetched,
        p_opened: record.opened,
        p_changed: record.changed,
        p_withdrawn: record.withdrawn,
        p_unmapped: record.unmappedStages,
        p_retry_after: record.retryAfterSeconds,
        p_detail: record.detail,
      });
      return value === null || value === undefined ? null : asNumber(value);
    },
    async dealSyncLast(p_account, p_project) {
      return rows(await rpc(config, "observer_deal_sync_last", { p_account, p_project })).map(
        lastRow,
      );
    },
  };
}

/** `DealStore` over the port, for one account and one control-plane project. */
export function dbDealStore(db: DealsDb, account: string, projectUuid: string): DealStore {
  return {
    async readCurrent(scope) {
      const list = await db.dealsCurrent(account, projectUuid, scope.connector);
      const deals: CrmDeal[] = [];
      for (const row of list) {
        const parsed = CrmDealSchema.safeParse(row.deal);
        if (parsed.success) deals.push(parsed.data);
      }
      return deals;
    },
    async apply(snapshot: DealSnapshot, changes: readonly DealStageChange[]) {
      const applied = await db.dealsApply(
        account,
        projectUuid,
        snapshot.connector,
        snapshot.fetchedAt,
        snapshot.deals,
        changes,
      );
      if (applied === null)
        throw new Error("the project is not this account's; nothing was written");
    },
  };
}

/** Every attempt becomes a row, so the screen can say when and why. */
export async function recordDealSyncOutcome(
  db: DealsDb,
  account: string,
  projectUuid: string,
  connector: ConnectorKind,
  outcome: DealSyncOutcome,
): Promise<number | null> {
  const record: DealSyncRecordInput = outcome.ok
    ? {
        outcome: "ok",
        fetched: outcome.fetched,
        opened: outcome.changes.filter((c) => c.kind === "opened").length,
        changed: outcome.changes.filter((c) => c.kind === "stage_changed").length,
        withdrawn: outcome.changes.filter((c) => c.kind === "withdrawn").length,
        unmappedStages: outcome.unmappedStages,
        retryAfterSeconds: null,
        detail: "",
      }
    : {
        outcome: outcome.reason,
        fetched: 0,
        opened: 0,
        changed: 0,
        withdrawn: 0,
        unmappedStages: [],
        retryAfterSeconds: outcome.retryAfterSeconds,
        detail: outcome.detail,
      };
  return db.dealSyncRecord(account, projectUuid, connector, record);
}
