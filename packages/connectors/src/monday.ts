import type { CatalogueSnapshot, CatalogueUnit } from "@observer/contracts";
import { refusal, refusalForStatus, type FetchContext } from "./http";
import { fieldReader, unitFromRecord, type RecordConfig } from "./record";
import type { CatalogueScope, FetchOutcome } from "./sync";

/**
 * MONDAY — `api.monday.com/v2`, GraphQL, read on 2026-09-07 (ADR-0036).
 *
 * A board is whatever the client made it, so nothing about a unit is fixed:
 * the configuration names which column is the code, the count, the price and
 * the status, and the mapping from there is the manual path's own
 * (`record.ts`). `items_page` walks the board by opaque cursor, 500 items at
 * a time; a null cursor ends the walk.
 */

export interface MondayCredential {
  readonly token: string;
}

export interface MondayConfig extends RecordConfig {
  readonly boardId: string;
  readonly baseUrl?: string;
}

export const MONDAY_BASE_URL = "https://api.monday.com/v2";
const PAGE_SIZE = 500;
const MAX_PAGES = 200;

const QUERY = `query ($board: [ID!], $cursor: String) {
  boards(ids: $board) {
    items_page(limit: ${PAGE_SIZE}, cursor: $cursor) {
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

/**
 * The item's name is the board's first column and is what people call the
 * row; it is offered under the reserved column id `name` so a client whose
 * unit codes live there can say so without an extra column.
 */
export function mondayUnit(item: MondayItem, config: MondayConfig): CatalogueUnit | null {
  const cells = new Map<string, string | null>();
  for (const c of item.column_values ?? []) if (c.id !== undefined) cells.set(c.id, c.text ?? null);
  const read = fieldReader(config.columns, (columnId) =>
    columnId === "name" ? (item.name ?? null) : cells.get(columnId),
  );
  const unit = unitFromRecord(read, config);
  if ("reason" in unit) return null;
  const externalId =
    item.id !== undefined && config.columns.externalId === undefined ? item.id : unit.externalId;
  return { ...unit, externalId };
}

export async function mondayFetchSnapshot(
  credential: MondayCredential,
  config: MondayConfig,
  scope: CatalogueScope,
  ctx: FetchContext,
): Promise<FetchOutcome> {
  const units: CatalogueUnit[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await ctx.http({
      url: config.baseUrl ?? MONDAY_BASE_URL,
      method: "POST",
      headers: { authorization: credential.token, "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { board: [config.boardId], cursor } }),
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
        "Monday rejected the board query. The board id or the token's permissions need checking.",
      );
    }
    const pageData = body.data?.boards?.[0]?.items_page;
    if (pageData === undefined) {
      return refusal("misconfigured", "The board was not found by this token.");
    }
    for (const item of pageData.items ?? []) {
      const unit = mondayUnit(item, config);
      if (unit !== null) units.push(unit);
    }
    cursor = pageData.cursor ?? null;
    if (cursor === null) break;
  }
  const snapshot: CatalogueSnapshot = {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    connector: "monday",
    fetchedAt: ctx.now().toISOString().replace("Z", "+00:00"),
    units,
  };
  return { ok: true, snapshot };
}
