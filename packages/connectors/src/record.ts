import { parseDisposition, type CatalogueUnit } from "@observer/contracts";
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

/**
 * A UNIT FROM NAMED FIELDS — THE STEP A SPREADSHEET AND A MONDAY BOARD SHARE.
 *
 * Both sources are a grid whose columns the client named. Once a person has
 * said which column is the code and which the price, the mapping into a
 * `CatalogueUnit` is the same function, which is why the Monday connector is
 * not a detour past the manual path but the same path with a network in front
 * (ADR-0036, consequences).
 */

export interface ColumnMapping {
  readonly code: string;
  readonly externalId?: string;
  readonly building?: string;
  readonly floor?: string;
  /** A count, or a disposition such as `2+kk`; both are read. */
  readonly rooms?: string;
  readonly layout?: string;
  readonly unitType?: string;
  readonly interiorSqm?: string;
  readonly exteriorSqm?: string;
  readonly grossSqm?: string;
  readonly priceWithVat?: string;
  readonly priceWithoutVat?: string;
  readonly currency?: string;
  readonly orientation?: string;
  readonly status?: string;
  readonly availableFrom?: string;
  readonly updatedAt?: string;
}

export type ColumnField = keyof ColumnMapping;

export interface RecordConfig {
  readonly columns: ColumnMapping;
  readonly statusMap: StatusMap;
  /** Applied when the grid has no currency column. */
  readonly currency: string | null;
}

/** Reads one named field of one record, or null when the record has none. */
export type FieldReader = (field: ColumnField) => string | null;

/**
 * Builds a reader over a record keyed by column name, matching the client's
 * headers case-insensitively after trimming, because a person typed them.
 */
export function fieldReader(
  columns: ColumnMapping,
  lookup: (columnName: string) => string | null | undefined,
): FieldReader {
  return (field) => {
    const name = columns[field];
    if (name === undefined) return null;
    return nonEmpty(lookup(name));
  };
}

export function unitFromRecord(
  read: FieldReader,
  config: RecordConfig,
): CatalogueUnit | { readonly reason: string } {
  const code = read("code");
  if (code === null) return { reason: "no unit code" };

  const roomsText = read("rooms");
  const roomsAsCount = readInteger(roomsText);
  const layout = read("layout") ?? (roomsText !== null && roomsAsCount === null ? roomsText : null);
  const disposition = parseDisposition(layout ?? roomsText);
  const currencyText = (read("currency") ?? config.currency)?.trim().toUpperCase() ?? null;

  return {
    code,
    externalId: read("externalId") ?? code,
    building: read("building"),
    floor: readInteger(read("floor")),
    rooms: roomsAsCount ?? disposition.rooms,
    layout,
    kitchen: disposition.kitchen,
    unitType: read("unitType"),
    areas: {
      interiorSqm: readNumber(read("interiorSqm")),
      exteriorSqm: readNumber(read("exteriorSqm")),
      grossSqm: readNumber(read("grossSqm")),
    },
    price: {
      withVat: readNumber(read("priceWithVat")),
      withoutVat: readNumber(read("priceWithoutVat")),
      currency: currencyText !== null && /^[A-Z]{3}$/.test(currencyText) ? currencyText : null,
    },
    orientation: readOrientation(read("orientation")),
    status: mapStatus(read("status"), config.statusMap),
    statusRaw: rawStatus(read("status")),
    availableFrom: readInstant(read("availableFrom")),
    updatedAt: readInstant(read("updatedAt")),
  };
}
