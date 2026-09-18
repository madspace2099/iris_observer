import "server-only";

import type {
  DirectoryEntries,
  ProjectDirectory,
  ProjectSource,
  ProjectSummary,
  SourceKind,
  TenantSummary,
  Viewer,
} from "@observer/readmodels";
import { isComplete, observerAdmin, type CompleteProjectRow } from "@observer/sources";

import { liveConnectorService } from "@/lib/connectors/live";
import { CONTROL_PLANE_ACCOUNT } from "@/lib/sources/control-plane";
import { observerDepsAsync } from "@/lib/sources/deps";

import { projectIdFromUuid, tenantIdFromUuid } from "./identity";
import { directoryRows, forgetDirectoryRows } from "./rows";

/**
 * THE PROJECT DIRECTORY THE PRODUCT IS COMPOSED WITH.
 *
 * Every COMPLETE project of the estate, as the read models want it: a developer,
 * an address, a currency, a locale, a time zone, and the four feeds stated one
 * by one. Asked by the repository on every resolve, behind the same thirty
 * seconds the other live sources keep.
 *
 * Nothing here may break a page. Whatever cannot be read is `null` or a feed
 * marked not connected, said once to the server log, and the product is then
 * the synthetic world as it was.
 */

const MEMO_MS = 30_000;
let memo: { readonly until: number; readonly value: DirectoryEntries | null } | null = null;

const FEED_NAMES: Readonly<Record<SourceKind, string>> = {
  showroom: "Showroom",
  webiris: "WEB IRIS",
  crm: "CRM",
  catalogue: "Unit catalogue",
};

function notConnected(kind: SourceKind): ProjectSource {
  return {
    id: `feed_${kind}`,
    displayName: FEED_NAMES[kind],
    kind,
    connected: false,
    lastSeenAt: null,
  };
}

interface ShowroomRow {
  readonly source_id: string;
  readonly project_id: string;
  readonly display_label: string;
  readonly last_seen_at: string | null;
}

/** Every active showroom of the estate in one read, grouped by project. */
async function showroomsByProject(): Promise<ReadonlyMap<string, readonly ShowroomRow[]>> {
  const deps = await observerDepsAsync();
  if (deps === null) return new Map();
  const read = await observerAdmin(deps).sourceOperations({
    account: CONTROL_PLANE_ACCOUNT,
    project: null,
  });
  if (!read.ok) return new Map();

  const grouped = new Map<string, ShowroomRow[]>();
  for (const row of read.value) {
    if (row.source_type !== "showroom_ue5" || row.state !== "active") continue;
    grouped.set(row.project_id, [...(grouped.get(row.project_id) ?? []), row]);
  }
  return grouped;
}

/**
 * The CRM's and the catalogue's state for one project.
 *
 * Connected means what the two live sources mean by it: an enabled connector
 * whose last sync of that kind succeeded. Anything less is not connected, which
 * is what the ladder and the building will then say.
 *
 * ponytail: two reads per project, so 2N behind the memo. Fine for an estate of
 * tens; an account-wide connector summary facade is the upgrade when it is not.
 */
async function connectorFeeds(projectUuid: string): Promise<readonly ProjectSource[]> {
  const service = await liveConnectorService();
  if (service === null) return [notConnected("crm"), notConnected("catalogue")];

  const [connectors, deals] = await Promise.all([
    service.list(projectUuid),
    service.dealSummary(projectUuid),
  ]);
  const catalogue = connectors.find((c) => c.enabled && c.lastSync?.outcome === "ok");
  const crm = connectors.find((c) => c.enabled && deals.get(c.kind)?.outcome === "ok");

  return [
    crm === undefined
      ? notConnected("crm")
      : {
          id: `feed_crm_${crm.kind}`,
          displayName: crm.name,
          kind: "crm",
          connected: true,
          lastSeenAt: deals.get(crm.kind)?.at ?? null,
        },
    catalogue === undefined
      ? notConnected("catalogue")
      : {
          id: `feed_catalogue_${catalogue.kind}`,
          displayName: catalogue.name,
          kind: "catalogue",
          connected: true,
          lastSeenAt: catalogue.lastSync?.at ?? null,
        },
  ];
}

async function summarise(
  row: CompleteProjectRow,
  showrooms: readonly ShowroomRow[],
): Promise<ProjectSummary> {
  /*
   * A showroom is connected once it has been heard from. An installation that
   * was created and never activated is listed, as not connected, with no last
   * instant: that is the state the operator is looking at it to see.
   */
  const showroomFeeds: readonly ProjectSource[] =
    showrooms.length === 0
      ? [notConnected("showroom")]
      : showrooms.map((s) => ({
          id: s.source_id,
          displayName: s.display_label,
          kind: "showroom" as const,
          connected: s.last_seen_at !== null,
          lastSeenAt: s.last_seen_at,
        }));

  let feeds: readonly ProjectSource[];
  try {
    feeds = await connectorFeeds(row.project_id);
  } catch (error: unknown) {
    console.error(
      "[observer.directory] a project's connectors could not be read; they are shown as not connected —",
      error instanceof Error ? error.name : "unknown error",
    );
    feeds = [notConnected("crm"), notConnected("catalogue")];
  }

  const sources = [...showroomFeeds, notConnected("webiris"), ...feeds];
  const connectedSources = (["showroom", "webiris", "crm", "catalogue"] as const).filter((kind) =>
    sources.some((s) => s.kind === kind && s.connected),
  );

  return {
    id: projectIdFromUuid(row.project_id),
    tenantId: tenantIdFromUuid(row.tenant_id),
    slug: row.slug,
    name: row.name,
    currency: row.currency,
    locale: row.locale,
    timeZone: row.time_zone,
    connectedSources,
    sources,
  };
}

async function read(): Promise<DirectoryEntries | null> {
  const complete = (await directoryRows()).filter(isComplete);
  if (complete.length === 0) return { tenants: [], projects: [] };

  const showrooms = await showroomsByProject();
  const tenants = new Map<string, TenantSummary>();
  for (const row of complete) {
    tenants.set(row.tenant_id, {
      id: tenantIdFromUuid(row.tenant_id),
      slug: row.tenant_slug,
      name: row.tenant_name,
    });
  }
  const projects = await Promise.all(
    complete.map((row) => summarise(row, showrooms.get(row.project_id) ?? [])),
  );
  return { tenants: [...tenants.values()], projects };
}

export const liveProjectDirectory: ProjectDirectory = {
  async entries() {
    if (memo !== null && memo.until > Date.now()) return memo.value;

    let value: DirectoryEntries | null = null;
    try {
      value = await read();
    } catch (error: unknown) {
      console.error(
        "[observer.directory] the project directory could not be composed; only the synthetic world is shown —",
        error instanceof Error ? error.name : "unknown error",
      );
    }
    memo = { until: Date.now() + MEMO_MS, value };
    return value;
  },
};

/** Forgets everything memoised here and beneath: for tests, and after administration changes something. */
export function forgetDirectoryMemo(): void {
  memo = null;
  forgetDirectoryRows();
}

/* --- who may see what -------------------------------------------------------- */

/**
 * A viewer with the grants administration has made merged in.
 *
 * The repository decides access against `viewer.tenantIds` and
 * `viewer.projectIds` and nowhere else (ADR-0029). So a grant on a project made
 * in administration reaches the product by being IN those lists when the viewer
 * is built, once, on the server — not by a second rule somewhere downstream that
 * every tool, route and read model would each have to remember.
 *
 * A MADSPACE administrator holds every complete project of the estate, because
 * administration is who made them. Anybody else holds what they were granted.
 * A failure to read grants leaves the viewer exactly as it was: closed.
 */
export async function withDirectoryGrants(accountId: string, viewer: Viewer): Promise<Viewer> {
  try {
    const complete = (await directoryRows()).filter(isComplete);
    if (complete.length === 0) return viewer;

    let held = complete;
    if (viewer.role !== "madspace_admin") {
      const deps = await observerDepsAsync();
      if (deps === null) return viewer;
      const granted = new Set(
        (
          await deps.db.projectsForViewer({ account: CONTROL_PLANE_ACCOUNT, viewer: accountId })
        ).map((row) => row.project_id),
      );
      held = complete.filter((row) => granted.has(row.project_id));
    }
    if (held.length === 0) return viewer;

    const tenantIds = new Set([
      ...viewer.tenantIds,
      ...held.map((r) => tenantIdFromUuid(r.tenant_id)),
    ]);
    const projectIds = new Set([
      ...viewer.projectIds,
      ...held.map((r) => projectIdFromUuid(r.project_id)),
    ]);
    return { ...viewer, tenantIds: [...tenantIds], projectIds: [...projectIds] };
  } catch (error: unknown) {
    console.error(
      "[observer.directory] grants could not be read; the account keeps only what it already held —",
      error instanceof Error ? error.name : "unknown error",
    );
    return viewer;
  }
}
