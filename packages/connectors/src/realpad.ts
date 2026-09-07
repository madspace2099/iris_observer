import { XMLParser } from "fast-xml-parser";
import {
  parseDisposition,
  type CatalogueSnapshot,
  type CatalogueStatus,
  type CatalogueUnit,
} from "@observer/contracts";
import { refusal, refusalForStatus, type ConnectorRefusal, type FetchContext } from "./http";
import { nonEmpty, readInteger, readNumber, readOrientation, sumOrNull } from "./shared";
import type { CatalogueScope, FetchOutcome } from "./sync";

/**
 * REALPAD — `cms.realpad.eu/ws/v10`, read on 2026-09-07 (ADR-0036).
 *
 * A form-encoded, login-and-password web service that answers XML. There is
 * no token and no per-flat modification time, so every fetch is the whole
 * project and change is whatever `diffCatalogue` finds between two of them.
 * REALPAD's own advice is one fetch an hour; this adapter fetches when asked
 * and leaves the cadence to the caller.
 *
 * A failed login escalates to a temporary ban that REALPAD returns as a plain
 * `401`, indistinguishable from a wrong password. The one rule that follows:
 * **never retry a 401.** The sync stops and a person looks.
 */

export interface RealpadCredential {
  readonly login: string;
  readonly password: string;
}

export interface RealpadConfig {
  readonly developerId: number;
  readonly projectId: number;
  /** A constant issued with the credential. */
  readonly screenId: number;
  readonly includeHidden: boolean;
  /** The export carries prices but does not name their currency. */
  readonly currency: string | null;
  readonly baseUrl?: string;
}

export const REALPAD_BASE_URL = "https://cms.realpad.eu/ws/v10";

/** `flat_status`, fixed by REALPAD's documentation. Anything else is unknown. */
export const REALPAD_STATUS: Readonly<Record<string, CatalogueStatus>> = {
  "0": "available",
  "1": "pre_reserved",
  "2": "reserved",
  "3": "sold",
  "4": "not_for_sale",
  "5": "delayed",
};

const ARRAY_TAGS = new Set(["project", "building", "floor", "flat", "flat-attribute", "locale"]);

function parser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (name) => ARRAY_TAGS.has(name),
  });
}

type Attrs = Readonly<Record<string, string>>;

interface FlatNode {
  readonly id?: string;
  readonly "flat-attribute"?: readonly { readonly key?: string; readonly value?: string }[];
}
interface FloorNode {
  readonly id?: string;
  readonly floorNo?: string;
  readonly flat?: readonly FlatNode[];
}
interface BuildingNode {
  readonly id?: string;
  readonly name?: string;
  readonly floor?: readonly FloorNode[];
}
interface ProjectNode {
  readonly id?: string;
  readonly name?: string;
  readonly building?: readonly BuildingNode[];
}
interface ExportNode {
  readonly project?: readonly ProjectNode[];
}

function attributes(flat: FlatNode): Attrs {
  const out: Record<string, string> = {};
  for (const a of flat["flat-attribute"] ?? []) {
    if (a.key !== undefined && a.value !== undefined) out[a.key] = a.value;
  }
  return out;
}

export function realpadUnit(
  flat: FlatNode,
  building: BuildingNode,
  floor: FloorNode,
  currency: string | null,
): CatalogueUnit | null {
  const a = attributes(flat);
  const externalId = nonEmpty(flat.id);
  if (externalId === null) return null;
  const layout = nonEmpty(a["flat_disposition"]);
  const disposition = parseDisposition(layout);
  const statusRaw = nonEmpty(a["flat_status"]) ?? "(absent)";

  return {
    code: nonEmpty(a["flat_internal_id"]) ?? `flat-${externalId}`,
    externalId,
    building: nonEmpty(building.name) ?? nonEmpty(building.id),
    floor: readInteger(floor.floorNo),
    rooms: disposition.rooms,
    layout,
    kitchen: disposition.kitchen,
    unitType: nonEmpty(a["flat_type"]),
    areas: {
      interiorSqm: readNumber(a["flat_area"]),
      exteriorSqm: sumOrNull([
        readNumber(a["flat_area_balcony"]),
        readNumber(a["flat_area_terrace"]),
        readNumber(a["flat_area_loggia"]),
        readNumber(a["flat_area_garden"]),
      ]),
      grossSqm: readNumber(a["flat_area_living"]),
    },
    price: {
      withVat: readNumber(a["flat_price"]),
      withoutVat: readNumber(a["flat_price_without_vat"]),
      currency: currency !== null && /^[A-Z]{3}$/.test(currency) ? currency : null,
    },
    orientation: readOrientation(a["flat_orientation"]),
    status: REALPAD_STATUS[statusRaw] ?? "unknown",
    statusRaw,
    availableFrom: null,
    updatedAt: null,
  };
}

/** The units of a `get-project` export, in document order. */
export function realpadCatalogue(xml: string, currency: string | null): CatalogueUnit[] | null {
  let doc: { export?: ExportNode };
  try {
    doc = parser().parse(xml) as { export?: ExportNode };
  } catch {
    return null;
  }
  const project = doc.export?.project?.[0];
  if (project === undefined) return null;
  const units: CatalogueUnit[] = [];
  for (const building of project.building ?? []) {
    for (const floor of building.floor ?? []) {
      for (const flat of floor.flat ?? []) {
        const unit = realpadUnit(flat, building, floor, currency);
        if (unit !== null) units.push(unit);
      }
    }
  }
  return units;
}

function form(fields: Readonly<Record<string, string>>): string {
  return new URLSearchParams(fields).toString();
}

export async function realpadFetchSnapshot(
  credential: RealpadCredential,
  config: RealpadConfig,
  scope: CatalogueScope,
  ctx: FetchContext,
): Promise<FetchOutcome> {
  const base = config.baseUrl ?? REALPAD_BASE_URL;
  const response = await ctx.http({
    url: `${base}/get-project`,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({
      login: credential.login,
      password: credential.password,
      developerid: String(config.developerId),
      projectid: String(config.projectId),
      screenid: String(config.screenId),
      ...(config.includeHidden ? { includehidden: "1" } : {}),
    }),
  });
  const refused = refusalForStatus(response.status, response.headers);
  if (refused !== null) return refused;

  const units = realpadCatalogue(response.text, config.currency);
  if (units === null) {
    return refusal("malformed", "The pricelist export could not be read as a REALPAD project.");
  }
  const snapshot: CatalogueSnapshot = {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    connector: "realpad",
    fetchedAt: ctx.now().toISOString().replace("Z", "+00:00"),
    units,
  };
  return { ok: true, snapshot };
}

export interface RealpadProject {
  readonly id: string;
  readonly name: string;
}

/** `list-projects`: what the credential can see, for the integrations screen. */
export async function realpadListProjects(
  credential: RealpadCredential,
  ctx: FetchContext,
  baseUrl: string = REALPAD_BASE_URL,
): Promise<{ readonly ok: true; readonly projects: RealpadProject[] } | ConnectorRefusal> {
  const response = await ctx.http({
    url: `${baseUrl}/list-projects`,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ login: credential.login, password: credential.password }),
  });
  const refused = refusalForStatus(response.status, response.headers);
  if (refused !== null) return refused;
  let doc: { export?: ExportNode };
  try {
    doc = parser().parse(response.text) as { export?: ExportNode };
  } catch {
    return refusal("malformed", "The project list could not be read.");
  }
  const projects = (doc.export?.project ?? [])
    .map((p) => ({ id: nonEmpty(p.id), name: nonEmpty(p.name) }))
    .filter((p): p is RealpadProject => p.id !== null && p.name !== null);
  return { ok: true, projects };
}
