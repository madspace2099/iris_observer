import type { CrmDeal, DealScope, DealStage } from "@observer/contracts";
import {
  dealFieldReader,
  dealFromRecord,
  type DealColumnMapping,
  type DealFetchOutcome,
  type StageMap,
} from "./deals";
import { refusal, refusalForStatus, type FetchContext } from "./http";
import { REALPAD_BASE_URL, type RealpadCredential } from "./realpad";
import { nonEmpty } from "./shared";
import { readWorkbookRows } from "./xlsx";

/**
 * REALPAD'S BUSINESS CASES, THROUGH DATA TAKEOUT.
 *
 * Read on 2026-09-07 at `dev.realpadsoftware.com/integrations/data-takeout`
 * (ADR-0036, amended the same day). What that page fixes, this adapter
 * uses; what it leaves unpublished, a person configures:
 *
 * - `POST /list-excel-business-cases`, form-encoded login and password like
 *   every v10 call; one row per Deal; an Excel file back. `xlsx=1` asks for
 *   the `.xlsx` container; `headermode=ids` asks for the header row REALPAD
 *   guarantees stable ("a deliberate, versioned identifier that will not be
 *   renamed") instead of the localised titles a user's language changes.
 * - `projectids=<one id>` narrows the export to the project, which is the
 *   documented way past the five-minute cooldown ("1 Project, or fulltext
 *   ≥ 6 chars"). A `429` still carries `Retry-After` and is a refusal.
 * - The Deal's Status is an enum the page publishes: 1 ACTIVE, 2 LOST,
 *   3 WON, 4 SLEEPING. WON is a purchase and LOST is lost — fixed here, the
 *   one mapping that is REALPAD's and not the tenant's.
 * - The Lifecycle is an enum the page does not publish. Its ids are the
 *   tenant's vocabulary and go through the stage table on the integrations
 *   screen, exactly as a Lomnio stage code or a Monday label does
 *   (ADR-0036 decision 4).
 * - **The stable header ids themselves are not published anywhere.** They
 *   are read off one real export (the inspection script prints them beside
 *   their labels) and typed into the column table — the same step Monday's
 *   column ids and a spreadsheet's headers take. Nothing here names a
 *   column it has not been told.
 * - The export carries no email and no phone (customers are a separate
 *   export), so a REALPAD deal has no subject key unless a person maps a
 *   column that holds one, in which case it is hashed like every other.
 */

export interface RealpadDealColumns extends DealColumnMapping {
  /** The header id of the Status column. Without it, no deal is won or lost by REALPAD's word. */
  readonly status?: string;
}

export interface RealpadDealsConfig {
  readonly projectId: number;
  readonly columns: RealpadDealColumns;
  readonly stageMap: StageMap;
  readonly baseUrl?: string;
}

/** Deal Status ids, as REALPAD's Data Takeout page publishes them. Anything else is unknown. */
export const REALPAD_DEAL_STATUS: Readonly<Record<string, string>> = {
  "1": "ACTIVE",
  "2": "LOST",
  "3": "WON",
  "4": "SLEEPING",
};

/** REALPAD's two terminal words, mapped by REALPAD's own meaning rather than by a tenant's table. */
const TERMINAL: Readonly<Record<string, DealStage>> = { WON: "purchase", LOST: "lost" };

/**
 * A deal from one export row, by the configured header ids.
 *
 * The stage word is WON or LOST when the Status says so, otherwise the
 * Lifecycle id — or, with no Lifecycle column named, the Status word
 * itself (ACTIVE, SLEEPING), which the tenant's table may map or leave
 * counted as unmapped. A row without a deal id, or with no word at all, is
 * refused with its reason.
 */
export function realpadDeal(
  lookup: (headerId: string) => string | null | undefined,
  config: RealpadDealsConfig,
  pepper: string,
): CrmDeal | { readonly reason: string } {
  const statusRaw =
    config.columns.status === undefined ? null : nonEmpty(lookup(config.columns.status));
  const statusWord = statusRaw === null ? null : (REALPAD_DEAL_STATUS[statusRaw] ?? statusRaw);
  const base = dealFieldReader(config.columns, lookup);
  const lifecycle = base("stage");
  const word =
    statusWord !== null && statusWord in TERMINAL ? statusWord : (lifecycle ?? statusWord);
  if (word === null) return { reason: "no stage" };

  const read = (field: keyof DealColumnMapping) => (field === "stage" ? word : base(field));
  const deal = dealFromRecord(read, { columns: config.columns, stageMap: config.stageMap }, pepper);
  if ("reason" in deal) return deal;
  const terminal = TERMINAL[word];
  return {
    ...deal,
    stage: terminal ?? deal.stage,
    won: statusWord === null ? null : statusWord === "WON",
    lost: statusWord === null ? null : statusWord === "LOST",
  };
}

export interface RealpadDealsOutcome {
  readonly deals: CrmDeal[];
  readonly rejected: readonly { readonly line: number; readonly reason: string }[];
}

/**
 * The deals of a `headermode=ids` export: the first row is the header ids,
 * every later row a Deal. Null when the bytes are not a workbook.
 */
export function realpadDealsFromWorkbook(
  bytes: Uint8Array,
  config: RealpadDealsConfig,
  pepper: string,
): RealpadDealsOutcome | null {
  const rows = readWorkbookRows(bytes);
  if (rows === null) return null;
  const header = rows[0];
  if (header === undefined) return { deals: [], rejected: [] };
  const index = new Map(header.map((h, i) => [h.trim(), i] as const));
  const deals: CrmDeal[] = [];
  const rejected: { line: number; reason: string }[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    if (row.every((cell) => cell.trim().length === 0)) return;
    const deal = realpadDeal(
      (headerId) => {
        const at = index.get(headerId.trim());
        return at === undefined ? null : row[at];
      },
      config,
      pepper,
    );
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

function form(fields: Readonly<Record<string, string>>): string {
  return new URLSearchParams(fields).toString();
}

export async function realpadFetchDeals(
  credential: RealpadCredential,
  config: RealpadDealsConfig,
  scope: Pick<DealScope, "tenantId" | "projectId">,
  ctx: FetchContext,
  pepper: string,
): Promise<DealFetchOutcome> {
  const base = config.baseUrl ?? REALPAD_BASE_URL;
  const response = await ctx.http({
    url: `${base}/list-excel-business-cases`,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({
      login: credential.login,
      password: credential.password,
      projectids: String(config.projectId),
      headermode: "ids",
      xlsx: "1",
    }),
    binary: true,
  });
  const refused = refusalForStatus(response.status, response.headers);
  if (refused !== null) return refused;
  if (response.bytes === undefined) {
    return refusal("malformed", "The business-case export arrived without a file to read.");
  }
  const outcome = realpadDealsFromWorkbook(response.bytes, config, pepper);
  if (outcome === null) {
    return refusal("malformed", "The business-case export could not be read as a workbook.");
  }
  return {
    ok: true,
    snapshot: {
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      connector: "realpad",
      fetchedAt: ctx.now().toISOString().replace("Z", "+00:00"),
      deals: outcome.deals,
    },
  };
}
