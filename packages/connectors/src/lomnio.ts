import { createHmac, timingSafeEqual } from "node:crypto";
import { parseDisposition, type CatalogueSnapshot, type CatalogueUnit } from "@observer/contracts";
import { refusal, refusalForStatus, type FetchContext } from "./http";
import {
  mapStatus,
  nonEmpty,
  rawStatus,
  readInstant,
  readInteger,
  readNumber,
  readOrientation,
  type StatusMap,
} from "./shared";
import type { CatalogueScope, FetchOutcome } from "./sync";

/**
 * LOMNIO — `app.lomnio.com/api/v1`, OpenAPI 3.1, read on 2026-09-07 (ADR-0036).
 *
 * A bearer token per project, JSON, Laravel pagination, and outbound webhooks
 * signed with an HMAC under a per-project secret. The pull is the source of
 * truth; a verified webhook only brings the next pull forward.
 */

export interface LomnioCredential {
  readonly token: string;
}

export interface LomnioConfig {
  readonly statusMap: StatusMap;
  readonly currency: string | null;
  readonly baseUrl?: string;
}

export const LOMNIO_BASE_URL = "https://app.lomnio.com/api";
const PAGE_SIZE = 500;
const MAX_PAGES = 100;

interface LomnioUnit {
  readonly id?: number | string;
  readonly code?: string;
  readonly external_id?: string | null;
  readonly status?: { readonly code?: string; readonly label?: string } | null;
  readonly type?: string | null;
  readonly layout_type?: string | null;
  readonly room_count?: number | null;
  readonly orientation?: readonly string[] | null;
  readonly pricing?: {
    readonly price_with_vat?: number | null;
    readonly price_without_vat?: number | null;
  } | null;
  readonly areas?: {
    readonly area?: number | null;
    readonly area_gross?: number | null;
  } | null;
  readonly building?: { readonly name?: string | null } | null;
  readonly floor?: { readonly number?: number | null } | null;
  readonly available_from?: string | null;
  readonly updated_at?: string | null;
}

interface LomnioPage {
  readonly data?: readonly LomnioUnit[];
  readonly links?: { readonly next?: string | null };
  readonly meta?: { readonly current_page?: number; readonly last_page?: number };
}

export function lomnioUnit(raw: LomnioUnit, config: LomnioConfig): CatalogueUnit | null {
  const code = nonEmpty(raw.code);
  const id = nonEmpty(raw.id);
  if (code === null || id === null) return null;
  const layout = nonEmpty(raw.layout_type);
  const disposition = parseDisposition(layout);
  const roomCount = raw.room_count ?? null;
  const statusCode = raw.status?.code ?? null;
  const currency = config.currency?.toUpperCase() ?? null;

  return {
    code,
    externalId: nonEmpty(raw.external_id) ?? id,
    building: nonEmpty(raw.building?.name),
    floor: readInteger(raw.floor?.number ?? null),
    rooms: roomCount !== null && Number.isInteger(roomCount) ? roomCount : disposition.rooms,
    layout,
    kitchen: disposition.kitchen,
    unitType: nonEmpty(raw.type),
    areas: {
      interiorSqm: readNumber(raw.areas?.area ?? null),
      exteriorSqm: null,
      grossSqm: readNumber(raw.areas?.area_gross ?? null),
    },
    price: {
      withVat: readNumber(raw.pricing?.price_with_vat ?? null),
      withoutVat: readNumber(raw.pricing?.price_without_vat ?? null),
      currency: currency !== null && /^[A-Z]{3}$/.test(currency) ? currency : null,
    },
    orientation: readOrientation(raw.orientation ?? null),
    status: mapStatus(statusCode, config.statusMap),
    statusRaw: rawStatus(statusCode),
    availableFrom: readInstant(raw.available_from),
    updatedAt: readInstant(raw.updated_at),
  };
}

export async function lomnioFetchSnapshot(
  credential: LomnioCredential,
  config: LomnioConfig,
  scope: CatalogueScope,
  ctx: FetchContext,
): Promise<FetchOutcome> {
  const base = config.baseUrl ?? LOMNIO_BASE_URL;
  const units: CatalogueUnit[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await ctx.http({
      url: `${base}/v1/units?per_page=${PAGE_SIZE}&page=${page}`,
      method: "GET",
      headers: { authorization: `Bearer ${credential.token}`, accept: "application/json" },
    });
    const refused = refusalForStatus(response.status, response.headers);
    if (refused !== null) return refused;

    let body: LomnioPage;
    try {
      body = JSON.parse(response.text) as LomnioPage;
    } catch {
      return refusal("malformed", "The unit list could not be read as JSON.");
    }
    if (!Array.isArray(body.data)) {
      return refusal("malformed", "The unit list did not carry a data array.");
    }
    for (const raw of body.data) {
      const unit = lomnioUnit(raw, config);
      if (unit !== null) units.push(unit);
    }
    const lastPage = body.meta?.last_page ?? page;
    const hasNext = body.links?.next !== null && body.links?.next !== undefined;
    if (page >= lastPage || !hasNext) break;
  }
  const snapshot: CatalogueSnapshot = {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    connector: "lomnio",
    fetchedAt: ctx.now().toISOString().replace("Z", "+00:00"),
    units,
  };
  return { ok: true, snapshot };
}

/* --- webhooks --------------------------------------------------------------- */

/**
 * `X-Lomnio-Signature: sha256=<hmac>` over the raw body under the project's
 * signing secret. The URL is not secret; this is the whole of authenticity.
 * Constant-time, and false for a header of the wrong shape rather than a
 * throw, so a probe learns nothing from the failure mode.
 */
export function verifyLomnioSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (signatureHeader === null || signatureHeader === undefined) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if (match === null) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const got = Buffer.from(match[1] as string, "hex");
  const want = Buffer.from(expected, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export const LOMNIO_EVENTS = [
  "unit.created",
  "unit.updated",
  "unit.deleted",
  "lead.created",
  "lead.stage_changed",
  "webhook.test",
] as const;
export type LomnioEvent = (typeof LOMNIO_EVENTS)[number];

export interface LomnioWebhook {
  readonly event: LomnioEvent;
  readonly occurredAt: string | null;
  /** The unit as delivered, mapped; null for lead events and deletions. */
  readonly unit: CatalogueUnit | null;
  readonly code: string | null;
  /** Deleted, or unpublished from the website. Either way: reconcile now. */
  readonly withdrawn: boolean;
}

export function parseLomnioWebhook(rawBody: string, config: LomnioConfig): LomnioWebhook | null {
  let body: {
    readonly event?: string;
    readonly occurred_at?: string;
    readonly external_id?: string | null;
    readonly deleted?: boolean;
    readonly visible?: boolean;
    readonly unit?: LomnioUnit | null;
  };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return null;
  }
  const event = LOMNIO_EVENTS.find((e) => e === body.event);
  if (event === undefined) return null;
  const unit = body.unit ? lomnioUnit(body.unit, config) : null;
  return {
    event,
    occurredAt: readInstant(body.occurred_at),
    unit,
    code: unit?.code ?? nonEmpty(body.external_id),
    withdrawn: body.deleted === true || body.visible === false,
  };
}
