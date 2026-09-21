import { createHash, createHmac } from "node:crypto";
import {
  dealEventKey,
  diffDeals,
  mapStage,
  type CrmDeal,
  type DealChange,
  type DealScope,
  type DealSnapshot,
  type DealStage,
  type DealStageChange,
} from "@observer/contracts";
import { parseCsv } from "./csv";
import { refusal, refusalForStatus, type ConnectorRefusal, type FetchContext } from "./http";
import { nonEmpty, readInstant } from "./shared";

/**
 * DEALS: THE CRM'S LADDER, PULLED AND DIFFED.
 *
 * The same shape as the catalogue path — a snapshot, a diff, an append-only
 * set of facts — because the sources offer the same thing: their current
 * statement, with no history worth relying on. Three adapters map into one
 * `CrmDeal`: Lomnio's `/v1/leads`, a Monday board whose columns a person
 * named, and a spreadsheet with the same named columns (the manual path,
 * which must always work). REALPAD's business cases arrive only as an Excel
 * export through Data Takeout with a five-minute cooldown, and their
 * Lifecycle vocabulary is not published (ADR-0036, open rule); that adapter
 * waits for one real export and is not guessed at here.
 *
 * Nothing about a person leaves this module: the customer's email or phone
 * becomes `subjectKey`, a keyed hash, before a deal exists.
 */

/* --- the subject key: email first, phone second, never the value ----------- */

/**
 * The buyer's key: HMAC-SHA256 of the normalised email under the subject
 * pepper, or of the normalised phone when there is no email, or null when
 * the source stated neither. Keyed, so a list of plausible addresses cannot
 * be confirmed against the stream without the pepper; peppered per
 * deployment, so two deployments never share a key for one person.
 */
export function subjectKey(
  email: string | null | undefined,
  phone: string | null | undefined,
  pepper: string,
): string | null {
  if (pepper.length === 0) throw new TypeError("subjectKey needs the subject pepper");
  const mail = nonEmpty(email)?.trim().toLowerCase() ?? null;
  if (mail !== null) return createHmac("sha256", pepper).update(`email:${mail}`).digest("hex");
  const tel = nonEmpty(phone)?.replace(/[^\d+]/g, "") ?? null;
  if (tel !== null && tel.replace(/\D/g, "").length >= 6) {
    return createHmac("sha256", pepper).update(`phone:${tel}`).digest("hex");
  }
  return null;
}

/** The fact's id: SHA-256 of what the contract says goes in. */
export function dealEventId(scope: DealScope, change: DealChange): string {
  return createHash("sha256").update(dealEventKey(scope, change)).digest("hex");
}

/* --- the sync loop ----------------------------------------------------------- */

export type DealFetchOutcome =
  { readonly ok: true; readonly snapshot: DealSnapshot } | ConnectorRefusal;

export interface DealStore {
  readCurrent(scope: DealScope): Promise<readonly CrmDeal[]>;
  apply(snapshot: DealSnapshot, changes: readonly DealStageChange[]): Promise<void>;
}

export interface DealSyncReport {
  readonly ok: true;
  readonly connector: DealScope["connector"];
  readonly fetched: number;
  readonly changes: readonly DealStageChange[];
  /** Raw stage words that mapped to nothing, distinct, for the mapping table. */
  readonly unmappedStages: readonly string[];
  readonly fetchedAt: string;
}

export type DealSyncOutcome = DealSyncReport | ConnectorRefusal;

export async function runDealSync(
  fetchSnapshot: () => Promise<DealFetchOutcome>,
  store: DealStore,
  scope: DealScope,
): Promise<DealSyncOutcome> {
  const outcome = await fetchSnapshot();
  if (!outcome.ok) return outcome;
  const { snapshot } = outcome;
  const previous = await store.readCurrent(scope);
  const changes = diffDeals(previous, snapshot.deals, snapshot.fetchedAt).map((change) => ({
    ...change,
    eventId: dealEventId(scope, change),
  }));
  await store.apply(snapshot, changes);
  const unmappedStages = [
    ...new Set(snapshot.deals.filter((d) => d.stage === null).map((d) => d.stageRaw)),
  ].sort();
  return {
    ok: true,
    connector: scope.connector,
    fetched: snapshot.deals.length,
    changes,
    unmappedStages,
    fetchedAt: snapshot.fetchedAt,
  };
}

/** A store in memory, for tests and for a dry run. */
export function memoryDealStore(): DealStore & {
  readonly current: Map<string, readonly CrmDeal[]>;
  readonly facts: DealStageChange[];
} {
  const current = new Map<string, readonly CrmDeal[]>();
  const facts: DealStageChange[] = [];
  const key = (s: DealScope) => `${s.tenantId}/${s.projectId}/${s.connector}`;
  return {
    current,
    facts,
    async readCurrent(scope) {
      return current.get(key(scope)) ?? [];
    },
    async apply(snapshot, changes) {
      current.set(key(snapshot), snapshot.deals);
      for (const change of changes) {
        if (!facts.some((f) => f.eventId === change.eventId)) facts.push(change);
      }
    },
  };
}

/* --- a deal from named fields: the step Monday and a spreadsheet share ------- */

export type StageMap = Readonly<Record<string, DealStage>>;

export interface DealColumnMapping {
  readonly externalId: string;
  readonly stage: string;
  readonly unitCode?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly stageEnteredAt?: string;
  readonly openedAt?: string;
  readonly updatedAt?: string;
}

export type DealColumnField = keyof DealColumnMapping;

export interface DealRecordConfig {
  readonly columns: DealColumnMapping;
  readonly stageMap: StageMap;
}

export type DealFieldReader = (field: DealColumnField) => string | null;

export function dealFieldReader(
  columns: DealColumnMapping,
  lookup: (columnName: string) => string | null | undefined,
): DealFieldReader {
  return (field) => {
    const name = columns[field];
    if (name === undefined) return null;
    return nonEmpty(lookup(name));
  };
}

export function dealFromRecord(
  read: DealFieldReader,
  config: DealRecordConfig,
  pepper: string,
): CrmDeal | { readonly reason: string } {
  const externalId = read("externalId");
  if (externalId === null) return { reason: "no deal id" };
  const stageRaw = read("stage");
  if (stageRaw === null) return { reason: "no stage" };
  return {
    externalId,
    unitCode: read("unitCode"),
    subjectKey: subjectKey(read("email"), read("phone"), pepper),
    stage: mapStage(stageRaw, config.stageMap),
    stageRaw,
    stageEnteredAt: readInstant(read("stageEnteredAt")),
    openedAt: readInstant(read("openedAt")),
    updatedAt: readInstant(read("updatedAt")),
    won: null,
    lost: null,
  };
}

/* --- the manual path: a deals sheet ------------------------------------------ */

export interface CsvDealsOutcome {
  readonly deals: CrmDeal[];
  readonly rejected: readonly { readonly line: number; readonly reason: string }[];
}

/**
 * A sheet of deals by the client's own column names. A row without a deal
 * id or a stage is rejected by line number; a duplicated id is a question
 * for the person, not a coin toss for the importer. The email and phone
 * columns are read and hashed on the way in; the sheet's values never leave
 * this function.
 */
export function csvDeals(text: string, config: DealRecordConfig, pepper: string): CsvDealsOutcome {
  const rows = parseCsv(text);
  const header = rows[0];
  if (header === undefined) return { deals: [], rejected: [] };
  const index = new Map(header.map((h, i) => [h.trim().toLowerCase(), i] as const));
  const deals: CrmDeal[] = [];
  const rejected: { line: number; reason: string }[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const read = dealFieldReader(config.columns, (name) => {
      const at = index.get(name.trim().toLowerCase());
      return at === undefined ? null : row[at];
    });
    const deal = dealFromRecord(read, config, pepper);
    if ("reason" in deal) {
      rejected.push({ line, reason: deal.reason });
      return;
    }
    if (seen.has(deal.externalId)) {
      rejected.push({ line, reason: `duplicate deal id ${deal.externalId}` });
      return;
    }
    seen.add(deal.externalId);
    deals.push(deal);
  });
  return { deals, rejected };
}

/* --- Lomnio: GET /v1/leads --------------------------------------------------- */

export interface LomnioDealsConfig {
  readonly stageMap: StageMap;
  readonly baseUrl?: string;
}

interface LomnioLead {
  readonly id?: number | string;
  readonly external_id?: string | null;
  readonly stage?: {
    readonly id?: number | string;
    readonly code?: string | null;
    readonly name?: string | null;
    readonly is_won?: boolean;
    readonly is_lost?: boolean;
    readonly entered_at?: string | null;
  } | null;
  readonly is_won?: boolean | null;
  readonly is_lost?: boolean | null;
  readonly customer?: {
    readonly email?: string | null;
    readonly phone?: string | null;
    readonly phone_e164?: string | null;
  } | null;
  readonly unit?: { readonly code?: string | null } | null;
  readonly unit_code?: string | null;
  readonly created_at?: string | null;
  readonly updated_at?: string | null;
}

interface LomnioLeadPage {
  readonly data?: readonly LomnioLead[];
  readonly links?: { readonly next?: string | null };
  readonly meta?: { readonly current_page?: number; readonly last_page?: number };
}

const LOMNIO_BASE = "https://app.lomnio.com/api";
const PAGE_SIZE = 500;
const MAX_PAGES = 100;

/** A lead as a deal. The stage word is the tenant's `stage.code`, falling back to its name. */
export function lomnioDeal(
  raw: LomnioLead,
  config: LomnioDealsConfig,
  pepper: string,
): CrmDeal | null {
  const id = nonEmpty(raw.id);
  if (id === null) return null;
  const stageRaw = nonEmpty(raw.stage?.code) ?? nonEmpty(raw.stage?.name);
  if (stageRaw === null) return null;
  return {
    externalId: nonEmpty(raw.external_id) ?? id,
    unitCode: nonEmpty(raw.unit?.code) ?? nonEmpty(raw.unit_code),
    subjectKey: subjectKey(
      raw.customer?.email,
      raw.customer?.phone_e164 ?? raw.customer?.phone,
      pepper,
    ),
    stage: mapStage(stageRaw, config.stageMap),
    stageRaw,
    stageEnteredAt: readInstant(raw.stage?.entered_at),
    openedAt: readInstant(raw.created_at),
    updatedAt: readInstant(raw.updated_at),
    won: raw.is_won ?? raw.stage?.is_won ?? null,
    lost: raw.is_lost ?? raw.stage?.is_lost ?? null,
  };
}

export async function lomnioFetchDeals(
  credential: { readonly token: string },
  config: LomnioDealsConfig,
  scope: Pick<DealScope, "tenantId" | "projectId">,
  ctx: FetchContext,
  pepper: string,
): Promise<DealFetchOutcome> {
  const base = config.baseUrl ?? LOMNIO_BASE;
  const deals: CrmDeal[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await ctx.http({
      url: `${base}/v1/leads?per_page=${PAGE_SIZE}&page=${page}`,
      method: "GET",
      headers: { authorization: `Bearer ${credential.token}`, accept: "application/json" },
    });
    const refused = refusalForStatus(response.status, response.headers);
    if (refused !== null) return refused;
    let body: LomnioLeadPage;
    try {
      body = JSON.parse(response.text) as LomnioLeadPage;
    } catch {
      return refusal("malformed", "The lead list could not be read as JSON.");
    }
    if (!Array.isArray(body.data)) {
      return refusal("malformed", "The lead list did not carry a data array.");
    }
    for (const raw of body.data) {
      const deal = lomnioDeal(raw, config, pepper);
      if (deal !== null) deals.push(deal);
    }
    const lastPage = body.meta?.last_page ?? page;
    const hasNext = body.links?.next !== null && body.links?.next !== undefined;
    if (page >= lastPage || !hasNext) break;
  }
  return {
    ok: true,
    snapshot: {
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      connector: "lomnio",
      fetchedAt: ctx.now().toISOString().replace("Z", "+00:00"),
      deals,
    },
  };
}

/* --- Monday: a deals board --------------------------------------------------- */

export interface MondayDealsConfig extends DealRecordConfig {
  readonly boardId: string;
  readonly baseUrl?: string;
}

const MONDAY_BASE = "https://api.monday.com/v2";
const MONDAY_PAGE = 500;
const MONDAY_MAX_PAGES = 200;
const MONDAY_QUERY = `query ($board: [ID!], $cursor: String) {
  boards(ids: $board) {
    items_page(limit: ${MONDAY_PAGE}, cursor: $cursor) {
      cursor
      items { id name column_values { id text } }
    }
  }
}`;

interface MondayItem {
  readonly id?: string;
  readonly name?: string;
  readonly column_values?: readonly { readonly id?: string; readonly text?: string | null }[];
}

interface MondayResponse {
  readonly data?: {
    readonly boards?: readonly {
      readonly items_page?: {
        readonly cursor?: string | null;
        readonly items?: readonly MondayItem[];
      };
    }[];
  };
  readonly errors?: readonly { readonly message?: string }[];
}

/** An item as a deal; the item's own id is the deal id unless a column is named for it. */
export function mondayDeal(
  item: MondayItem,
  config: MondayDealsConfig,
  pepper: string,
): CrmDeal | null {
  const cells = new Map<string, string | null>();
  for (const c of item.column_values ?? []) if (c.id !== undefined) cells.set(c.id, c.text ?? null);
  const read = dealFieldReader(config.columns, (columnId) =>
    columnId === "name"
      ? (item.name ?? null)
      : columnId === "id"
        ? (item.id ?? null)
        : cells.get(columnId),
  );
  const deal = dealFromRecord(read, config, pepper);
  return "reason" in deal ? null : deal;
}

export async function mondayFetchDeals(
  credential: { readonly token: string },
  config: MondayDealsConfig,
  scope: Pick<DealScope, "tenantId" | "projectId">,
  ctx: FetchContext,
  pepper: string,
): Promise<DealFetchOutcome> {
  const deals: CrmDeal[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MONDAY_MAX_PAGES; page += 1) {
    const response = await ctx.http({
      url: config.baseUrl ?? MONDAY_BASE,
      method: "POST",
      headers: { authorization: credential.token, "content-type": "application/json" },
      body: JSON.stringify({
        query: MONDAY_QUERY,
        variables: { board: [config.boardId], cursor },
      }),
    });
    const refused = refusalForStatus(response.status, response.headers);
    if (refused !== null) return refused;
    let body: MondayResponse;
    try {
      body = JSON.parse(response.text) as MondayResponse;
    } catch {
      return refusal("malformed", "The board answer could not be read as JSON.");
    }
    if (body.errors !== undefined && body.errors.length > 0) {
      const text = body.errors
        .map((e) => e.message ?? "")
        .join(" ")
        .toLowerCase();
      if (text.includes("not authenticated") || text.includes("unauthorized")) {
        return refusal("unauthorised", "The Monday token was refused.");
      }
      return refusal(
        "misconfigured",
        "Monday rejected the deals board query. The board id or the token's permissions need checking.",
      );
    }
    const pageData = body.data?.boards?.[0]?.items_page;
    if (pageData === undefined) {
      return refusal("misconfigured", "The deals board was not found by this token.");
    }
    for (const item of pageData.items ?? []) {
      const deal = mondayDeal(item, config, pepper);
      if (deal !== null) deals.push(deal);
    }
    cursor = pageData.cursor ?? null;
    if (cursor === null) break;
  }
  return {
    ok: true,
    snapshot: {
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      connector: "monday",
      fetchedAt: ctx.now().toISOString().replace("Z", "+00:00"),
      deals,
    },
  };
}
