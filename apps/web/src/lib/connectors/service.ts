import "server-only";

import {
  CatalogueSnapshotSchema,
  CatalogueUnitSchema,
  ProjectIdSchema,
  TenantIdSchema,
  placementOf,
  type CatalogueSnapshot,
  type CatalogueUnit,
  type ConnectorKind,
} from "@observer/contracts";
import {
  csvCatalogue,
  dbCatalogueStore,
  lomnioFetchSnapshot,
  lowerCaseHeaders,
  mondayFetchSnapshot,
  realpadFetchSnapshot,
  recordSyncOutcome,
  refusal,
  runCatalogueSync,
  verifyLomnioSignature,
  type CatalogueDb,
  type FetchOutcome,
  type Http,
  type SyncOutcome,
} from "@observer/connectors";

import {
  CONFIG_SCHEMAS,
  CONNECTOR_NAMES,
  CREDENTIAL_SCHEMAS,
  credentialTail,
  type CsvConfig,
  type LomnioConfig,
  type MondayConfig,
  type RealpadConfig,
} from "./configs";
import { encryptionConfigured, open, seal, type EnvSource } from "@/lib/credentials/envelope";

/**
 * THE CONNECTOR SERVICE: CONFIGURE, SEAL, SYNC, RECORD.
 *
 * Everything the integrations screen and the scheduled sync do, over injected
 * dependencies — the catalogue port, an HTTP function, the environment and a
 * clock — so the whole of it runs in a test against a fake CRM and a PGlite,
 * and so `fetch` and `process.env` each appear in exactly one place above.
 *
 * ## The credential's path through this file
 *
 * Pasted → validated by the connector's own schema → serialised → sealed
 * under the master key with the account, project and connector bound into
 * the tag → stored. On a sync it is read back, opened, parsed, handed to the
 * adapter and dropped. It is never logged, never returned to a screen and
 * never placed on a context object. The screen sees four characters.
 */

export interface ServiceDeps {
  readonly db: CatalogueDb;
  readonly http: Http;
  readonly env: EnvSource;
  readonly now: () => Date;
  /** The account every façade is scoped to. Never from a request. */
  readonly account: string;
}

export interface LastSync {
  readonly at: string;
  readonly outcome: string;
  readonly fetched: number | null;
  readonly detail: string;
}

export interface ConnectorSummary {
  readonly kind: ConnectorKind;
  readonly name: string;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly config: Record<string, unknown>;
  readonly hasCredential: boolean;
  readonly credentialTail: string | null;
  readonly updatedAt: string | null;
  readonly lastSync: LastSync | null;
}

export type Refused = { readonly ok: false; readonly problem: string; readonly field?: string };

/**
 * The read models' identifiers for a control-plane project.
 *
 * The control plane keys a project by uuid; the catalogue snapshot carries
 * the branded `tnt_`/`prj_` identifiers the read models use. Derived, and
 * deterministically, from the uuid and the account, so the same project
 * always yields the same pair. A later milestone that maps control-plane
 * projects onto read-model projects replaces this function and nothing else.
 */
export function scopeFor(
  account: string,
  projectUuid: string,
): Pick<CatalogueSnapshot, "tenantId" | "projectId"> {
  const tenantBody = account
    .toLowerCase()
    .replace(/[^0-9a-z]/g, "")
    .padEnd(8, "0")
    .slice(0, 40);
  const projectBody = projectUuid
    .toLowerCase()
    .replace(/[^0-9a-z]/g, "")
    .slice(0, 32);
  return {
    tenantId: TenantIdSchema.parse(`tnt_${tenantBody}`),
    projectId: ProjectIdSchema.parse(`prj_${projectBody}`),
  };
}

function binding(account: string, projectUuid: string, kind: ConnectorKind) {
  return { accountId: account, provider: `connector:${kind}:${projectUuid}` };
}

export function connectorService(deps: ServiceDeps) {
  const { db, account } = deps;

  async function list(projectUuid: string): Promise<ConnectorSummary[]> {
    const rows = await db.connectorConfigs(account, projectUuid);
    const byKind = new Map(rows.map((r) => [r.connector, r]));
    return (Object.keys(CONNECTOR_NAMES) as ConnectorKind[]).map((kind) => {
      const row = byKind.get(kind);
      return {
        kind,
        name: CONNECTOR_NAMES[kind],
        configured: row !== undefined,
        enabled: row?.enabled ?? false,
        config: row?.config ?? {},
        hasCredential: row?.has_credential ?? false,
        credentialTail: row?.credential_last_four ?? null,
        updatedAt: row?.updated_at ?? null,
        lastSync:
          row?.last_sync_at === null || row?.last_sync_at === undefined
            ? null
            : {
                at: row.last_sync_at,
                outcome: row.last_sync_outcome ?? "ok",
                fetched: row.last_sync_fetched,
                detail: row.last_sync_detail ?? "",
              },
      };
    });
  }

  async function save(
    projectUuid: string,
    kind: ConnectorKind,
    rawConfig: unknown,
    rawCredential: unknown | null,
    enabled: boolean,
  ): Promise<{ readonly ok: true } | Refused> {
    const config = CONFIG_SCHEMAS[kind].safeParse(rawConfig);
    if (!config.success) {
      const issue = config.error.issues[0];
      return {
        ok: false,
        problem: `The ${CONNECTOR_NAMES[kind]} settings could not be read: ${issue?.message ?? "a value is missing"}.`,
        field: issue?.path.map(String).join("."),
      };
    }

    if (rawCredential !== null) {
      const schema = CREDENTIAL_SCHEMAS[kind];
      if (schema === null) {
        return { ok: false, problem: "A spreadsheet has no credential to store." };
      }
      if (!encryptionConfigured(deps.env)) {
        return {
          ok: false,
          problem:
            "This server holds no credential key, so a CRM credential cannot be stored here. Nothing was saved.",
        };
      }
      const credential = schema.safeParse(rawCredential);
      if (!credential.success) {
        const issue = credential.error.issues[0];
        return {
          ok: false,
          problem: `The credential could not be read: ${issue?.message ?? "a value is missing"}.`,
          field: issue?.path.map(String).join("."),
        };
      }
      const sealed = seal(
        JSON.stringify(credential.data),
        binding(account, projectUuid, kind),
        deps.env,
      );
      const written = await db.connectorCredentialSet(account, projectUuid, kind, {
        keyVersion: sealed.version,
        nonce: sealed.nonce,
        ciphertext: sealed.ciphertext,
        authTag: sealed.tag,
        lastFour: credentialTail(kind, credential.data),
        revision: deps.now().getTime(),
      });
      if (!written) {
        return { ok: false, problem: "The project could not be found, so nothing was saved." };
      }
    }

    const written = await db.connectorConfigSet(account, projectUuid, kind, config.data, enabled);
    if (!written) {
      return { ok: false, problem: "The project could not be found, so nothing was saved." };
    }
    return { ok: true };
  }

  async function removeCredential(projectUuid: string, kind: ConnectorKind): Promise<boolean> {
    return db.connectorCredentialRemove(account, projectUuid, kind);
  }

  /** The stored credential, opened for one sync and returned to nobody else. */
  async function openCredential(
    projectUuid: string,
    kind: ConnectorKind,
  ): Promise<Record<string, unknown> | null> {
    const schema = CREDENTIAL_SCHEMAS[kind];
    if (schema === null) return null;
    const sealed = await db.connectorCredentialRead(account, projectUuid, kind);
    if (sealed === null) return null;
    const plaintext = open(
      {
        version: sealed.key_version,
        nonce: sealed.nonce,
        ciphertext: sealed.ciphertext,
        tag: sealed.auth_tag,
      },
      binding(account, projectUuid, kind),
      deps.env,
    );
    const parsed = schema.safeParse(JSON.parse(plaintext));
    return parsed.success ? parsed.data : null;
  }

  function fetcherFor(
    kind: ConnectorKind,
    config: unknown,
    credential: Record<string, unknown> | null,
    projectUuid: string,
  ): (() => Promise<FetchOutcome>) | Refused {
    const scope = scopeFor(account, projectUuid);
    const ctx = { http: deps.http, now: deps.now };
    switch (kind) {
      case "realpad": {
        if (credential === null) return { ok: false, problem: "REALPAD has no credential stored." };
        const c = config as RealpadConfig;
        const k = credential as { login: string; password: string };
        return () => realpadFetchSnapshot(k, { ...c, currency: c.currency }, scope, ctx);
      }
      case "lomnio": {
        if (credential === null) return { ok: false, problem: "Lomnio has no credential stored." };
        const c = config as LomnioConfig;
        const k = credential as { token: string };
        return () => lomnioFetchSnapshot(k, c, scope, ctx);
      }
      case "monday": {
        if (credential === null) return { ok: false, problem: "Monday has no credential stored." };
        const c = config as MondayConfig;
        const k = credential as { token: string };
        return () => mondayFetchSnapshot(k, c, scope, ctx);
      }
      case "csv":
        return {
          ok: false,
          problem: "A spreadsheet is uploaded, not fetched. Use the upload on this screen.",
        };
    }
  }

  async function sync(
    projectUuid: string,
    kind: ConnectorKind,
  ): Promise<{ readonly ok: true; readonly outcome: SyncOutcome } | Refused> {
    const rows = await db.connectorConfigs(account, projectUuid);
    const row = rows.find((r) => r.connector === kind);
    if (row === undefined) {
      return { ok: false, problem: `${CONNECTOR_NAMES[kind]} is not configured for this project.` };
    }
    const config = CONFIG_SCHEMAS[kind].safeParse(row.config);
    if (!config.success) {
      return { ok: false, problem: `The stored ${CONNECTOR_NAMES[kind]} settings are incomplete.` };
    }

    let credential: Record<string, unknown> | null;
    try {
      credential = await openCredential(projectUuid, kind);
    } catch {
      const outcome = refusal(
        "misconfigured",
        "The stored credential could not be opened on this server. Paste it again.",
      );
      await recordSyncOutcome(db, account, projectUuid, kind, outcome);
      return { ok: true, outcome };
    }

    const fetcher = fetcherFor(kind, config.data, credential, projectUuid);
    if ("problem" in fetcher) return fetcher;

    const outcome = await runCatalogueSync(
      fetcher,
      dbCatalogueStore(db, account, projectUuid),
      scopeFor(account, projectUuid),
      kind,
    );
    await recordSyncOutcome(db, account, projectUuid, kind, outcome);
    return { ok: true, outcome };
  }

  async function importCsv(
    projectUuid: string,
    text: string,
  ): Promise<
    | {
        readonly ok: true;
        readonly outcome: SyncOutcome;
        readonly rejected: readonly { readonly line: number; readonly reason: string }[];
      }
    | Refused
  > {
    const rows = await db.connectorConfigs(account, projectUuid);
    const row = rows.find((r) => r.connector === "csv");
    if (row === undefined) {
      return { ok: false, problem: "Name the spreadsheet's columns before uploading it." };
    }
    const config = CONFIG_SCHEMAS.csv.safeParse(row.config);
    if (!config.success) return { ok: false, problem: "The stored column names are incomplete." };

    const parsed = csvCatalogue(text, config.data as CsvConfig);
    const snapshot = CatalogueSnapshotSchema.parse({
      ...scopeFor(account, projectUuid),
      connector: "csv",
      fetchedAt: deps.now().toISOString().replace("Z", "+00:00"),
      units: parsed.units,
    });
    const outcome = await runCatalogueSync(
      async () => ({ ok: true, snapshot }),
      dbCatalogueStore(db, account, projectUuid),
      scopeFor(account, projectUuid),
      "csv",
    );
    await recordSyncOutcome(db, account, projectUuid, "csv", outcome);
    return { ok: true, outcome, rejected: parsed.rejected };
  }

  /** The newest changes any connector recorded for the project, for the screen's register. */
  async function recentChanges(projectUuid: string, limit = 20) {
    return db.catalogueChanges(account, projectUuid, limit);
  }

  /** The catalogue a connector currently holds, parsed; rows that do not parse are dropped. */
  async function currentUnits(projectUuid: string, kind: ConnectorKind): Promise<CatalogueUnit[]> {
    const rows = await db.catalogueCurrent(account, projectUuid, kind);
    const units: CatalogueUnit[] = [];
    for (const row of rows) {
      const parsed = CatalogueUnitSchema.safeParse(row.unit);
      if (parsed.success) units.push(parsed.data);
    }
    return units;
  }

  /**
   * How much of a delivered catalogue the product draws, why not the rest,
   * and what the drawn units are shown without.
   *
   * Both lists are grouped and counted so the screen can say "9 have an
   * orientation code that is not mapped" beside the mapping field that fixes
   * it, instead of listing forty-eight rows. A unit is not drawn only for a
   * status the surfaces have no word for; a missing floor, count, area, price
   * or aspect is a gap the surfaces say in words, and it is counted here so
   * the operator knows what the source left out.
   */
  async function placement(
    projectUuid: string,
    kind: ConnectorKind,
  ): Promise<{
    readonly total: number;
    readonly placed: number;
    readonly reasons: readonly { readonly reason: string; readonly count: number }[];
    readonly gaps: readonly { readonly reason: string; readonly count: number }[];
  }> {
    const rows = await db.connectorConfigs(account, projectUuid);
    const config = CONFIG_SCHEMAS[kind].safeParse(rows.find((r) => r.connector === kind)?.config);
    const orientationMap = config.success ? config.data.orientationMap : {};
    const units = await currentUnits(projectUuid, kind);
    const reasons = new Map<string, number>();
    const gaps = new Map<string, number>();
    let placed = 0;
    for (const unit of units) {
      const verdict = placementOf(unit, orientationMap);
      if (verdict.ok) {
        placed += 1;
        for (const gap of verdict.gaps) gaps.set(gap, (gaps.get(gap) ?? 0) + 1);
        continue;
      }
      for (const reason of verdict.reasons) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    const counted = (map: Map<string, number>) =>
      [...map.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);
    return { total: units.length, placed, reasons: counted(reasons), gaps: counted(gaps) };
  }

  /**
   * Whether a Lomnio webhook body was signed by this project's secret.
   *
   * The secret is opened here and compared here; the route sees a verdict.
   * `no_secret` is its own answer because a project that never pasted a
   * signing secret cannot accept push at all, and a 401 would send the
   * operator looking for a forgery when the fix is a field on the screen.
   */
  async function verifyLomnioWebhook(
    projectUuid: string,
    rawBody: string,
    signatureHeader: string | null,
  ): Promise<"ok" | "rejected" | "no_secret"> {
    let credential: Record<string, unknown> | null;
    try {
      credential = await openCredential(projectUuid, "lomnio");
    } catch {
      return "no_secret";
    }
    const secret = credential?.["signingSecret"];
    if (typeof secret !== "string" || secret.length === 0) return "no_secret";
    return verifyLomnioSignature(rawBody, signatureHeader, secret) ? "ok" : "rejected";
  }

  return {
    list,
    save,
    removeCredential,
    sync,
    importCsv,
    recentChanges,
    currentUnits,
    placement,
    verifyLomnioWebhook,
  };
}

export type ConnectorService = ReturnType<typeof connectorService>;

/** The platform's `fetch` as the connectors' `Http`, with a ceiling on how long a CRM may take. */
export function platformHttp(timeoutMs = 30_000): Http {
  return async (request) => {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      status: response.status,
      headers: lowerCaseHeaders(response.headers),
      text: await response.text(),
    };
  };
}
