import {
  CatalogueUnitSchema,
  type CatalogueSnapshot,
  type CatalogueUnit,
  type ConnectorKind,
  type UnitChange,
} from "@observer/contracts";
import type { CatalogueStore, SyncOutcome } from "./sync";

/**
 * THE CATALOGUE'S DATABASE PORT, AND ITS TWO ADAPTERS.
 *
 * The same arrangement `@observer/sources` uses for the ingestion boundary,
 * for the same reason: every function below is a `security definer` façade in
 * `supabase/migrations/20260907100000_observer_catalogue_and_connectors.sql`,
 * reached over PostgREST in a deployment and over plain SQL in a PGlite test,
 * and the thing that makes the local proof mean something is that both
 * adapters call the same façade names with the same argument lists.
 *
 * One method per façade, argument names written out beside the façade they
 * belong to. Nothing here logs, and no error carries a response body — a
 * PostgREST error can quote the failing statement, and the credential façades
 * carry ciphertext that must not reach a log line.
 */

export const CATALOGUE_FACADES = [
  "observer_connector_config_set",
  "observer_connector_configs",
  "observer_connector_credential_set",
  "observer_connector_credential_read",
  "observer_connector_credential_remove",
  "observer_catalogue_apply",
  "observer_catalogue_current",
  "observer_catalogue_changes",
  "observer_catalogue_sync_record",
] as const;
export type CatalogueFacade = (typeof CATALOGUE_FACADES)[number];

/* --- rows the façades return -------------------------------------------------- */

export interface ConnectorConfigRow {
  readonly connector: string;
  readonly config: Record<string, unknown>;
  readonly enabled: boolean;
  readonly has_credential: boolean;
  readonly credential_last_four: string | null;
  readonly updated_at: string;
  readonly last_sync_at: string | null;
  readonly last_sync_outcome: string | null;
  readonly last_sync_fetched: number | null;
  readonly last_sync_detail: string | null;
}

export interface SealedCredentialRow {
  readonly key_version: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly auth_tag: string;
  readonly revision: number;
}

export interface SealedCredentialInput {
  readonly keyVersion: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly authTag: string;
  readonly lastFour: string;
  readonly revision: number;
}

export interface CatalogueApplyRow {
  readonly added: number;
  readonly changed: number;
  readonly withdrawn: number;
}

export interface CatalogueUnitRow {
  readonly code: string;
  readonly unit: unknown;
  readonly fetched_at: string;
}

export interface CatalogueChangeRow {
  readonly connector: string;
  readonly code: string;
  readonly kind: string;
  readonly changed_fields: unknown;
  readonly before_unit: unknown;
  readonly after_unit: unknown;
  readonly fetched_at: string;
  readonly recorded_at: string;
}

export interface SyncRecordInput {
  readonly outcome: string;
  readonly fetched: number;
  readonly added: number;
  readonly changed: number;
  readonly withdrawn: number;
  readonly unknownStatuses: readonly string[];
  readonly retryAfterSeconds: number | null;
  readonly detail: string;
}

export interface CatalogueDb {
  connectorConfigSet(
    account: string,
    project: string,
    connector: ConnectorKind,
    config: Record<string, unknown>,
    enabled: boolean,
  ): Promise<boolean>;
  connectorConfigs(account: string, project: string): Promise<readonly ConnectorConfigRow[]>;
  connectorCredentialSet(
    account: string,
    project: string,
    connector: ConnectorKind,
    sealed: SealedCredentialInput,
  ): Promise<boolean>;
  connectorCredentialRead(
    account: string,
    project: string,
    connector: ConnectorKind,
  ): Promise<SealedCredentialRow | null>;
  connectorCredentialRemove(
    account: string,
    project: string,
    connector: ConnectorKind,
  ): Promise<boolean>;
  /** Null when the project is not the account's: nothing was written. */
  catalogueApply(
    account: string,
    project: string,
    connector: ConnectorKind,
    fetchedAt: string,
    units: readonly CatalogueUnit[],
    changes: readonly UnitChange[],
  ): Promise<CatalogueApplyRow | null>;
  catalogueCurrent(
    account: string,
    project: string,
    connector: ConnectorKind,
  ): Promise<readonly CatalogueUnitRow[]>;
  catalogueChanges(
    account: string,
    project: string,
    limit: number,
  ): Promise<readonly CatalogueChangeRow[]>;
  catalogueSyncRecord(
    account: string,
    project: string,
    connector: ConnectorKind,
    record: SyncRecordInput,
  ): Promise<number | null>;
}

/* --- over SQL ------------------------------------------------------------------ */

export type SqlQuery = (sql: string, params: readonly unknown[]) => Promise<{ rows: unknown[] }>;

function arity(name: string, args: string, params: readonly unknown[]): void {
  const written = args.match(/\$\d+/g)?.length ?? 0;
  if (written !== params.length) {
    throw new Error(
      `${name}: the argument list names ${String(written)} parameter(s), but ${String(params.length)} were supplied`,
    );
  }
}

/** `select * from public.<façade>(…)`, shared with the deals port. */
export async function table(
  query: SqlQuery,
  name: string,
  args: string,
  params: readonly unknown[],
): Promise<readonly unknown[]> {
  arity(name, args, params);
  return (await query(`select * from public.${name}(${args})`, params)).rows;
}

/** `select public.<façade>(…) as value`, shared with the deals port. */
export async function scalar<T>(
  query: SqlQuery,
  name: string,
  args: string,
  params: readonly unknown[],
): Promise<T> {
  arity(name, args, params);
  const row = (await query(`select public.${name}(${args}) as value`, params)).rows[0];
  if (row === undefined)
    throw new Error(`${name} returned no row, which a scalar function cannot do`);
  return (row as { readonly value: T }).value;
}

export const asNumber = (value: unknown): number =>
  typeof value === "string" ? Number(value) : (value as number);

function sealedRow(row: unknown): SealedCredentialRow | null {
  if (row === undefined || row === null) return null;
  const r = row as SealedCredentialRow;
  return { ...r, revision: asNumber(r.revision) };
}

export function sqlCatalogueDb(query: SqlQuery): CatalogueDb {
  return {
    async connectorConfigSet(account, project, connector, config, enabled) {
      return scalar<boolean>(query, "observer_connector_config_set", "$1, $2, $3, $4::jsonb, $5", [
        account,
        project,
        connector,
        JSON.stringify(config),
        enabled,
      ]);
    },
    async connectorConfigs(account, project) {
      const rows = await table(query, "observer_connector_configs", "$1, $2", [account, project]);
      return rows.map((r) => {
        const row = r as ConnectorConfigRow;
        return {
          ...row,
          last_sync_fetched:
            row.last_sync_fetched === null ? null : asNumber(row.last_sync_fetched),
        };
      });
    },
    async connectorCredentialSet(account, project, connector, sealed) {
      return scalar<boolean>(
        query,
        "observer_connector_credential_set",
        "$1, $2, $3, $4, $5, $6, $7, $8, $9",
        [
          account,
          project,
          connector,
          sealed.keyVersion,
          sealed.nonce,
          sealed.ciphertext,
          sealed.authTag,
          sealed.lastFour,
          sealed.revision,
        ],
      );
    },
    async connectorCredentialRead(account, project, connector) {
      const rows = await table(query, "observer_connector_credential_read", "$1, $2, $3", [
        account,
        project,
        connector,
      ]);
      return sealedRow(rows[0]);
    },
    async connectorCredentialRemove(account, project, connector) {
      return scalar<boolean>(query, "observer_connector_credential_remove", "$1, $2, $3", [
        account,
        project,
        connector,
      ]);
    },
    async catalogueApply(account, project, connector, fetchedAt, units, changes) {
      const rows = await table(
        query,
        "observer_catalogue_apply",
        "$1, $2, $3, $4::timestamptz, $5::jsonb, $6::jsonb",
        [account, project, connector, fetchedAt, JSON.stringify(units), JSON.stringify(changes)],
      );
      const row = rows[0] as CatalogueApplyRow | undefined;
      return row === undefined
        ? null
        : {
            added: asNumber(row.added),
            changed: asNumber(row.changed),
            withdrawn: asNumber(row.withdrawn),
          };
    },
    async catalogueCurrent(account, project, connector) {
      return (await table(query, "observer_catalogue_current", "$1, $2, $3", [
        account,
        project,
        connector,
      ])) as readonly CatalogueUnitRow[];
    },
    async catalogueChanges(account, project, limit) {
      return (await table(query, "observer_catalogue_changes", "$1, $2, $3", [
        account,
        project,
        limit,
      ])) as readonly CatalogueChangeRow[];
    },
    async catalogueSyncRecord(account, project, connector, record) {
      const id = await scalar<number | string | null>(
        query,
        "observer_catalogue_sync_record",
        "$1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11",
        [
          account,
          project,
          connector,
          record.outcome,
          record.fetched,
          record.added,
          record.changed,
          record.withdrawn,
          JSON.stringify(record.unknownStatuses),
          record.retryAfterSeconds,
          record.detail,
        ],
      );
      return id === null ? null : asNumber(id);
    },
  };
}

/* --- over PostgREST ------------------------------------------------------------- */

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface PostgrestConfig {
  readonly url: string;
  readonly key: string;
  readonly fetch: FetchLike;
}

export class CatalogueFacadeError extends Error {
  readonly facade: string;
  readonly status: number;
  constructor(facade: string, status: number) {
    super(`${facade} refused over PostgREST — HTTP ${status}`);
    this.name = "CatalogueFacadeError";
    this.facade = facade;
    this.status = status;
  }
}

/** One PostgREST RPC to a façade, shared with the deals port. */
export async function rpc(
  config: PostgrestConfig,
  facade: string,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const base = config.url.replace(/\/+$/, "");
  const response = await config.fetch(`${base}/rest/v1/rpc/${facade}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new CatalogueFacadeError(facade, response.status);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new CatalogueFacadeError(facade, response.status);
  }
}

export const rows = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

export function postgrestCatalogueDb(config: PostgrestConfig): CatalogueDb {
  return {
    async connectorConfigSet(p_account, p_project, p_connector, p_config, p_enabled) {
      const value = await rpc(config, "observer_connector_config_set", {
        p_account,
        p_project,
        p_connector,
        p_config,
        p_enabled,
      });
      return value === true;
    },
    async connectorConfigs(p_account, p_project) {
      return rows(await rpc(config, "observer_connector_configs", { p_account, p_project })).map(
        (r) => {
          const row = r as ConnectorConfigRow;
          return {
            ...row,
            last_sync_fetched:
              row.last_sync_fetched === null ? null : asNumber(row.last_sync_fetched),
          };
        },
      );
    },
    async connectorCredentialSet(p_account, p_project, p_connector, sealed) {
      const value = await rpc(config, "observer_connector_credential_set", {
        p_account,
        p_project,
        p_connector,
        p_key_version: sealed.keyVersion,
        p_nonce: sealed.nonce,
        p_ciphertext: sealed.ciphertext,
        p_auth_tag: sealed.authTag,
        p_last_four: sealed.lastFour,
        p_revision: sealed.revision,
      });
      return value === true;
    },
    async connectorCredentialRead(p_account, p_project, p_connector) {
      const list = rows(
        await rpc(config, "observer_connector_credential_read", {
          p_account,
          p_project,
          p_connector,
        }),
      );
      return sealedRow(list[0]);
    },
    async connectorCredentialRemove(p_account, p_project, p_connector) {
      const value = await rpc(config, "observer_connector_credential_remove", {
        p_account,
        p_project,
        p_connector,
      });
      return value === true;
    },
    async catalogueApply(p_account, p_project, p_connector, p_fetched_at, p_units, p_changes) {
      const list = rows(
        await rpc(config, "observer_catalogue_apply", {
          p_account,
          p_project,
          p_connector,
          p_fetched_at,
          p_units,
          p_changes,
        }),
      );
      const row = list[0] as CatalogueApplyRow | undefined;
      return row === undefined
        ? null
        : {
            added: asNumber(row.added),
            changed: asNumber(row.changed),
            withdrawn: asNumber(row.withdrawn),
          };
    },
    async catalogueCurrent(p_account, p_project, p_connector) {
      return rows(
        await rpc(config, "observer_catalogue_current", { p_account, p_project, p_connector }),
      ) as readonly CatalogueUnitRow[];
    },
    async catalogueChanges(p_account, p_project, p_limit) {
      return rows(
        await rpc(config, "observer_catalogue_changes", { p_account, p_project, p_limit }),
      ) as readonly CatalogueChangeRow[];
    },
    async catalogueSyncRecord(p_account, p_project, p_connector, record) {
      const value = await rpc(config, "observer_catalogue_sync_record", {
        p_account,
        p_project,
        p_connector,
        p_outcome: record.outcome,
        p_fetched: record.fetched,
        p_added: record.added,
        p_changed: record.changed,
        p_withdrawn: record.withdrawn,
        p_unknown: record.unknownStatuses,
        p_retry_after: record.retryAfterSeconds,
        p_detail: record.detail,
      });
      return value === null || value === undefined ? null : asNumber(value);
    },
  };
}

/* --- the store the sync loop runs against ---------------------------------------- */

/**
 * `CatalogueStore` over the port, for one account and one project.
 *
 * `projectUuid` is the control plane's identity for the project
 * (`observer.projects.project_id`), which is not the read models' `prj_…`
 * identifier; the snapshot carries the latter and the row carries the former,
 * and the mapping between them is the caller's to know.
 */
export function dbCatalogueStore(
  db: CatalogueDb,
  account: string,
  projectUuid: string,
): CatalogueStore {
  return {
    async readCurrent(_scope, connector) {
      const rows = await db.catalogueCurrent(account, projectUuid, connector);
      const units: CatalogueUnit[] = [];
      for (const row of rows) {
        const parsed = CatalogueUnitSchema.safeParse(row.unit);
        if (parsed.success) units.push(parsed.data);
      }
      return units;
    },
    async apply(snapshot: CatalogueSnapshot, changes: readonly UnitChange[]) {
      const applied = await db.catalogueApply(
        account,
        projectUuid,
        snapshot.connector,
        snapshot.fetchedAt,
        snapshot.units,
        changes,
      );
      if (applied === null)
        throw new Error("the project is not this account's; nothing was written");
    },
  };
}

/** Every attempt becomes a row, so the screen can say when and why. */
export async function recordSyncOutcome(
  db: CatalogueDb,
  account: string,
  projectUuid: string,
  connector: ConnectorKind,
  outcome: SyncOutcome,
): Promise<number | null> {
  const record: SyncRecordInput = outcome.ok
    ? {
        outcome: "ok",
        fetched: outcome.fetched,
        added: outcome.changes.filter((c) => c.kind === "added").length,
        changed: outcome.changes.filter((c) => c.kind === "changed").length,
        withdrawn: outcome.changes.filter((c) => c.kind === "withdrawn").length,
        unknownStatuses: outcome.unknownStatuses,
        retryAfterSeconds: null,
        detail: "",
      }
    : {
        outcome: outcome.reason,
        fetched: 0,
        added: 0,
        changed: 0,
        withdrawn: 0,
        unknownStatuses: [],
        retryAfterSeconds: outcome.retryAfterSeconds,
        detail: outcome.detail,
      };
  return db.catalogueSyncRecord(account, projectUuid, connector, record);
}
