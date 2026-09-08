import "server-only";

import type { ShowroomSession } from "@observer/contracts";
import {
  postgrestSessionsDb,
  refusal,
  sqlSessionsDb,
  supabaseShowroomFetchSessions,
  type FetchContext,
  type Http,
  type SessionsDb,
  type SupabaseFetchOutcome,
} from "@observer/connectors";
import { SHOWROOM_SOURCE_KINDS, type ShowroomSourceKind } from "@observer/contracts";
import type { CatalogueDb, PostgrestConfig, SqlQuery } from "@observer/connectors";

import {
  SESSION_SOURCE_CONFIG_SCHEMAS,
  SESSION_SOURCE_CREDENTIAL_SCHEMAS,
  SESSION_SOURCE_NAMES,
  isShowroomSourceKind,
  sessionSourceCredentialTail,
  type SupabaseShowroomConfig,
} from "./session-source-configs";
import { encryptionConfigured, open, seal, type EnvSource } from "@/lib/credentials/envelope";

/**
 * THE SHOWROOM-TELEMETRY-SOURCE SERVICE — the mirror of `connectorService`,
 * scoped to `ShowroomSourceKind` instead of `ConnectorKind`.
 *
 * Same shape deliberately: configure → seal → sync → record, over the same
 * kind of injected dependencies. Kept in its own file and its own factory
 * because a session source is architecturally a different thing from a CRM
 * connector (it delivers `ShowroomSession`s to `sessionsApply`, not units to
 * `catalogueApply`), even though both share the generic config/credential
 * columns and the same crypto envelope.
 */

export interface SessionServiceDeps {
  readonly db: CatalogueDb;
  readonly sessions?: SessionsDb;
  readonly http: Http;
  readonly env: EnvSource;
  readonly now: () => Date;
  readonly account: string;
}

export interface SessionSourceSummary {
  readonly kind: ShowroomSourceKind;
  readonly name: string;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly config: Record<string, unknown>;
  readonly hasCredential: boolean;
  readonly credentialTail: string | null;
  readonly updatedAt: string | null;
  readonly lastSync: {
    readonly at: string;
    readonly outcome: string;
    readonly fetched: number;
    readonly accepted: number;
    readonly rejected: number;
    readonly detail: string;
  } | null;
}

export type SessionRefused = {
  readonly ok: false;
  readonly problem: string;
  readonly field?: string;
};

function binding(account: string, projectUuid: string, kind: ShowroomSourceKind) {
  return { accountId: account, provider: `session-source:${kind}:${projectUuid}` };
}

export function sessionSourceService(deps: SessionServiceDeps) {
  const { db, account } = deps;

  async function list(projectUuid: string): Promise<SessionSourceSummary[]> {
    const rows = await db.connectorConfigs(account, projectUuid);
    const byKind = new Map(rows.map((r) => [r.connector, r]));
    const syncs =
      deps.sessions === undefined ? [] : await deps.sessions.sessionsSyncLast(account, projectUuid);
    const syncByKind = new Map(syncs.map((s) => [s.connector, s]));
    return SHOWROOM_SOURCE_KINDS.map((kind) => {
      const row = byKind.get(kind);
      const sync = syncByKind.get(kind);
      return {
        kind,
        name: SESSION_SOURCE_NAMES[kind],
        configured: row !== undefined,
        enabled: row?.enabled ?? false,
        config: row?.config ?? {},
        hasCredential: row?.has_credential ?? false,
        credentialTail: row?.credential_last_four ?? null,
        updatedAt: row?.updated_at ?? null,
        lastSync:
          sync === undefined
            ? null
            : {
                at: sync.started_at,
                outcome: sync.outcome,
                fetched: sync.fetched,
                accepted: sync.accepted,
                rejected: sync.rejected,
                detail: sync.detail,
              },
      };
    });
  }

  async function save(
    projectUuid: string,
    kind: string,
    rawConfig: unknown,
    rawCredential: unknown | null,
    enabled: boolean,
  ): Promise<{ readonly ok: true } | SessionRefused> {
    if (!isShowroomSourceKind(kind)) {
      return { ok: false, problem: "Unknown telemetry source kind." };
    }
    const config = SESSION_SOURCE_CONFIG_SCHEMAS[kind].safeParse(rawConfig);
    if (!config.success) {
      const issue = config.error.issues[0];
      return {
        ok: false,
        problem: `The ${SESSION_SOURCE_NAMES[kind]} settings could not be read: ${
          issue === undefined ? "the value does not match what this source needs" : issue.message
        }.`,
        field: issue?.path.map(String).join("."),
      };
    }

    if (rawCredential !== null) {
      if (!encryptionConfigured(deps.env)) {
        return {
          ok: false,
          problem:
            "This server holds no credential key, so a source credential cannot be stored here. Nothing was saved.",
        };
      }
      const credential = SESSION_SOURCE_CREDENTIAL_SCHEMAS[kind].safeParse(rawCredential);
      if (!credential.success) {
        const issue = credential.error.issues[0];
        return {
          ok: false,
          problem: `The credential could not be read: ${
            issue === undefined ? "the value does not match what this source needs" : issue.message
          }.`,
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
        lastFour: sessionSourceCredentialTail(credential.data),
        revision: deps.now().getTime(),
      });
      if (!written)
        return { ok: false, problem: "The project could not be found, so nothing was saved." };
    }

    const written = await db.connectorConfigSet(account, projectUuid, kind, config.data, enabled);
    if (!written)
      return { ok: false, problem: "The project could not be found, so nothing was saved." };
    return { ok: true };
  }

  async function removeCredential(projectUuid: string, kind: ShowroomSourceKind): Promise<boolean> {
    return db.connectorCredentialRemove(account, projectUuid, kind);
  }

  async function openCredential(
    projectUuid: string,
    kind: ShowroomSourceKind,
  ): Promise<Record<string, unknown> | null> {
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
    const parsed = SESSION_SOURCE_CREDENTIAL_SCHEMAS[kind].safeParse(JSON.parse(plaintext));
    return parsed.success ? parsed.data : null;
  }

  /**
   * A stable agent id for this source. `select` deliberately does not read
   * `sales_person` (the mapper's own docblock: nothing this table's row
   * carries beyond `session_id`/`created_at`/`session_data` is read at
   * all), and `docs/16-showroom-intelligence-audit.md` §2.1 already
   * confirmed every row in this data is one presenter — so one fixed id
   * for the whole source, not a guess derived from a field never fetched.
   */
  const DEMO_AGENT_ID = "agt_demo_akhilesh";

  async function sync(
    projectUuid: string,
    kind: ShowroomSourceKind,
    readModelProjectId: string,
  ): Promise<{ readonly ok: true; readonly outcome: SupabaseFetchOutcome } | SessionRefused> {
    if (deps.sessions === undefined) {
      return { ok: false, problem: "This server's database predates session-source storage." };
    }
    const rows = await db.connectorConfigs(account, projectUuid);
    const row = rows.find((r) => r.connector === kind);
    if (row === undefined) {
      return {
        ok: false,
        problem: `${SESSION_SOURCE_NAMES[kind]} is not configured for this project.`,
      };
    }
    const config = SESSION_SOURCE_CONFIG_SCHEMAS[kind].safeParse(row.config);
    if (!config.success) {
      return {
        ok: false,
        problem: `The stored ${SESSION_SOURCE_NAMES[kind]} settings are incomplete.`,
      };
    }

    let credential: Record<string, unknown> | null;
    try {
      credential = await openCredential(projectUuid, kind);
    } catch {
      const outcome = refusal(
        "misconfigured",
        "The stored credential could not be opened on this server. Paste it again.",
      );
      await deps.sessions.sessionsSyncRecord(account, projectUuid, kind, {
        outcome: outcome.reason,
        fetched: 0,
        accepted: 0,
        rejected: 0,
        retryAfterSeconds: outcome.retryAfterSeconds,
        detail: outcome.detail,
      });
      return { ok: true, outcome };
    }
    if (credential === null) {
      return { ok: false, problem: `${SESSION_SOURCE_NAMES[kind]} has no credential stored.` };
    }

    const ctx: FetchContext = { http: deps.http, now: deps.now };
    const outcome = await supabaseShowroomFetchSessions(
      { token: (credential as { token: string }).token },
      config.data as SupabaseShowroomConfig,
      readModelProjectId,
      DEMO_AGENT_ID,
      ctx,
    );

    if (!outcome.ok) {
      await deps.sessions.sessionsSyncRecord(account, projectUuid, kind, {
        outcome: outcome.reason,
        fetched: 0,
        accepted: 0,
        rejected: 0,
        retryAfterSeconds: outcome.retryAfterSeconds,
        detail: outcome.detail,
      });
      return { ok: true, outcome };
    }

    const fetchedAt = deps.now().toISOString().replace("Z", "+00:00");
    await deps.sessions.sessionsApply(account, projectUuid, kind, fetchedAt, outcome.accepted);
    await deps.sessions.sessionsSyncRecord(account, projectUuid, kind, {
      outcome: "ok",
      fetched: outcome.fetched,
      accepted: outcome.accepted.length,
      rejected: outcome.rejected,
      retryAfterSeconds: null,
      detail: "",
    });
    return { ok: true, outcome };
  }

  async function currentSessions(
    projectUuid: string,
    kind: ShowroomSourceKind,
  ): Promise<readonly ShowroomSession[]> {
    if (deps.sessions === undefined) return [];
    const current = await deps.sessions.sessionsCurrent(account, projectUuid, kind);
    return current?.sessions ?? [];
  }

  return { list, save, removeCredential, sync, currentSessions };
}

export type SessionSourceService = ReturnType<typeof sessionSourceService>;

export function sqlSessionsDbFrom(query: SqlQuery): SessionsDb {
  return sqlSessionsDb(query);
}

export function postgrestSessionsDbFrom(config: PostgrestConfig): SessionsDb {
  return postgrestSessionsDb(config);
}
