import type { ShowroomSession } from "@observer/contracts";
import { asNumber, rows, rpc, scalar, table, type PostgrestConfig, type SqlQuery } from "./db";

/**
 * THE SHOWROOM SESSIONS' DATABASE PORT.
 *
 * The same arrangement as the catalogue's and the deals' (`db.ts`,
 * `deals-db.ts`): every method is a `security definer` façade in
 * `supabase/migrations/20260908230000_observer_showroom_sessions.sql`,
 * reached over PostgREST in a deployment and over plain SQL in a PGlite
 * test, both adapters calling the same façade names with the same argument
 * lists. Simpler than the deals port on purpose: a session snapshot is
 * replaced wholesale on each sync (no per-record change log), because
 * "the source's current statement" is what a telemetry pull actually is —
 * there is no stage a session moves through the way a deal does.
 */

export const SESSIONS_FACADES = [
  "observer_sessions_apply",
  "observer_sessions_current",
  "observer_sessions_sync_record",
  "observer_sessions_sync_last",
] as const;
export type SessionsFacade = (typeof SESSIONS_FACADES)[number];

export interface SessionsApplyRow {
  readonly stored: number;
}

export interface SessionSyncRecordInput {
  readonly outcome: string;
  readonly fetched: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly retryAfterSeconds: number | null;
  readonly detail: string;
}

export interface SessionSyncLastRow {
  readonly connector: string;
  readonly started_at: string;
  readonly outcome: string;
  readonly fetched: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly detail: string;
}

export interface SessionsDb {
  /** Null when the project is not this account's: nothing was written. */
  sessionsApply(
    account: string,
    project: string,
    connector: string,
    fetchedAt: string,
    sessions: readonly ShowroomSession[],
  ): Promise<SessionsApplyRow | null>;
  /** Null when nothing has ever been stored for this project and connector. */
  sessionsCurrent(
    account: string,
    project: string,
    connector: string,
  ): Promise<{ readonly sessions: readonly ShowroomSession[]; readonly fetchedAt: string } | null>;
  sessionsSyncRecord(
    account: string,
    project: string,
    connector: string,
    record: SessionSyncRecordInput,
  ): Promise<number | null>;
  sessionsSyncLast(account: string, project: string): Promise<readonly SessionSyncLastRow[]>;
}

const applyRow = (row: unknown): SessionsApplyRow | null => {
  const r = row as SessionsApplyRow | undefined;
  return r === undefined ? null : { stored: asNumber(r.stored) };
};

const lastRow = (r: unknown): SessionSyncLastRow => {
  const row = r as SessionSyncLastRow;
  return { ...row, fetched: asNumber(row.fetched), accepted: asNumber(row.accepted), rejected: asNumber(row.rejected) };
};

export function sqlSessionsDb(query: SqlQuery): SessionsDb {
  return {
    async sessionsApply(account, project, connector, fetchedAt, sessions) {
      const list = await table(
        query,
        "observer_sessions_apply",
        "$1, $2, $3, $4::timestamptz, $5::jsonb",
        [account, project, connector, fetchedAt, JSON.stringify(sessions)],
      );
      return applyRow(list[0]);
    },
    async sessionsCurrent(account, project, connector) {
      const list = await table(query, "observer_sessions_current", "$1, $2, $3", [
        account,
        project,
        connector,
      ]);
      const row = list[0] as { readonly sessions: unknown; readonly fetched_at: string } | undefined;
      if (row === undefined || !Array.isArray(row.sessions)) return null;
      return { sessions: row.sessions as readonly ShowroomSession[], fetchedAt: row.fetched_at };
    },
    async sessionsSyncRecord(account, project, connector, record) {
      const id = await scalar<number | string | null>(
        query,
        "observer_sessions_sync_record",
        "$1, $2, $3, $4, $5, $6, $7, $8, $9",
        [
          account,
          project,
          connector,
          record.outcome,
          record.fetched,
          record.accepted,
          record.rejected,
          record.retryAfterSeconds,
          record.detail,
        ],
      );
      return id === null ? null : asNumber(id);
    },
    async sessionsSyncLast(account, project) {
      return (await table(query, "observer_sessions_sync_last", "$1, $2", [account, project])).map(
        lastRow,
      );
    },
  };
}

export function postgrestSessionsDb(config: PostgrestConfig): SessionsDb {
  return {
    async sessionsApply(p_account, p_project, p_connector, p_fetched_at, p_sessions) {
      const list = rows(
        await rpc(config, "observer_sessions_apply", {
          p_account,
          p_project,
          p_connector,
          p_fetched_at,
          p_sessions,
        }),
      );
      return applyRow(list[0]);
    },
    async sessionsCurrent(p_account, p_project, p_connector) {
      const list = rows(
        await rpc(config, "observer_sessions_current", { p_account, p_project, p_connector }),
      );
      const row = list[0] as { readonly sessions: unknown; readonly fetched_at: string } | undefined;
      if (row === undefined || !Array.isArray(row.sessions)) return null;
      return { sessions: row.sessions as readonly ShowroomSession[], fetchedAt: row.fetched_at };
    },
    async sessionsSyncRecord(p_account, p_project, p_connector, record) {
      const value = await rpc(config, "observer_sessions_sync_record", {
        p_account,
        p_project,
        p_connector,
        p_outcome: record.outcome,
        p_fetched: record.fetched,
        p_accepted: record.accepted,
        p_rejected: record.rejected,
        p_retry_after: record.retryAfterSeconds,
        p_detail: record.detail,
      });
      return value === null || value === undefined ? null : asNumber(value);
    },
    async sessionsSyncLast(p_account, p_project) {
      return rows(await rpc(config, "observer_sessions_sync_last", { p_account, p_project })).map(
        lastRow,
      );
    },
  };
}
