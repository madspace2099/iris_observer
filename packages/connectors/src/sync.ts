import {
  diffCatalogue,
  type CatalogueSnapshot,
  type CatalogueUnit,
  type ConnectorKind,
  type UnitChange,
} from "@observer/contracts";
import type { ConnectorRefusal } from "./http";

/**
 * ONE SYNC: FETCH THE WHOLE CATALOGUE, DIFF IT, KEEP THE DIFFERENCE.
 *
 * The same loop for every connector (ADR-0036 decision 2). The adapter
 * produces a snapshot or a refusal; the store answers what it held before
 * and is handed the snapshot together with the changes, in one call, so a
 * store that can be transactional is, and one that cannot at least sees both
 * halves together.
 */

/** The branded tenant and project a snapshot belongs to — the schema's own types, never bare strings. */
export type CatalogueScope = Pick<CatalogueSnapshot, "tenantId" | "projectId">;

export type FetchOutcome =
  { readonly ok: true; readonly snapshot: CatalogueSnapshot } | ConnectorRefusal;

export interface CatalogueStore {
  readCurrent(scope: CatalogueScope, connector: ConnectorKind): Promise<readonly CatalogueUnit[]>;
  apply(snapshot: CatalogueSnapshot, changes: readonly UnitChange[]): Promise<void>;
}

export interface SyncReport {
  readonly ok: true;
  readonly connector: ConnectorKind;
  readonly fetched: number;
  readonly changes: readonly UnitChange[];
  /** Raw status words that mapped to `unknown`, distinct, for the mapping table. */
  readonly unknownStatuses: readonly string[];
  readonly fetchedAt: string;
}

export type SyncOutcome = SyncReport | ConnectorRefusal;

export async function runCatalogueSync(
  fetchSnapshot: () => Promise<FetchOutcome>,
  store: CatalogueStore,
  scope: CatalogueScope,
  connector: ConnectorKind,
): Promise<SyncOutcome> {
  const outcome = await fetchSnapshot();
  if (!outcome.ok) return outcome;

  const { snapshot } = outcome;
  const previous = await store.readCurrent(scope, connector);
  const changes = diffCatalogue(previous, snapshot.units);
  await store.apply(snapshot, changes);

  const unknownStatuses = [
    ...new Set(snapshot.units.filter((u) => u.status === "unknown").map((u) => u.statusRaw)),
  ].sort((a, b) => a.localeCompare(b));

  return {
    ok: true,
    connector,
    fetched: snapshot.units.length,
    changes,
    unknownStatuses,
    fetchedAt: snapshot.fetchedAt,
  };
}

/** A store that remembers one snapshot per scope and connector, for tests and the local control plane. */
export function memoryCatalogueStore(): CatalogueStore & {
  readonly snapshots: Map<string, CatalogueSnapshot>;
  readonly history: UnitChange[];
} {
  const snapshots = new Map<string, CatalogueSnapshot>();
  const history: UnitChange[] = [];
  const key = (scope: CatalogueScope, connector: ConnectorKind): string =>
    `${scope.tenantId}/${scope.projectId}/${connector}`;
  return {
    snapshots,
    history,
    async readCurrent(scope, connector) {
      return snapshots.get(key(scope, connector))?.units ?? [];
    },
    async apply(snapshot, changes) {
      snapshots.set(key(snapshot, snapshot.connector), snapshot);
      history.push(...changes);
    },
  };
}
