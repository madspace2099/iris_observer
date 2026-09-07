import { z } from "zod";
import { InstantSchema, ProjectIdSchema, TenantIdSchema } from "./ids";

/**
 * THE CANONICAL UNIT CATALOGUE, AS A CONNECTOR DELIVERS IT.
 *
 * Every CRM spells a flat differently — REALPAD as `<flat-attribute>` pairs in
 * an XML export, Lomnio as a JSON resource with `room_count`, Monday as
 * whatever columns the client drew on a board, a spreadsheet as whatever the
 * client typed. Observer keeps one shape and the connectors map into it
 * (`docs/01-foundation.md` §4 rule 1). What that shape must do:
 *
 * - **Carry the raw label beside the derived count.** `rooms` is what a
 *   segment is built from; `layout` is the connector's own string, untouched,
 *   so a wrong derivation is correctable from the row rather than from a
 *   re-sync (ADR-0036 decision 3).
 * - **Say "unknown" rather than "available".** A status the mapping does not
 *   recognise is `unknown`, never silently the friendliest value.
 * - **Never interpret an orientation.** REALPAD's own example mixes Czech and
 *   English compass letters on one line. The codes are carried; the tenant's
 *   vocabulary is configuration (ADR-0036, open rule).
 *
 * A snapshot is the whole catalogue as fetched at one instant. Change is
 * derived by diffing two snapshots (`diffCatalogue`), which is the only way
 * a source with no per-unit modification time — REALPAD — can yield history.
 */

export const CONNECTOR_KINDS = ["realpad", "monday", "lomnio", "csv"] as const;
export const ConnectorKindSchema = z.enum(CONNECTOR_KINDS);
export type ConnectorKind = z.infer<typeof ConnectorKindSchema>;

/**
 * Availability as the catalogue states it.
 *
 * Wider than the three states the showroom read models use (available,
 * reserved, sold): REALPAD distinguishes a pre-reservation from a reservation
 * and has two ways for a unit to be off the market. Collapsing those at the
 * boundary would lose the distinction before anybody had decided it did not
 * matter; the read models collapse it where they choose to.
 */
export const CATALOGUE_STATUSES = [
  "available",
  "pre_reserved",
  "reserved",
  "sold",
  "not_for_sale",
  "delayed",
  "unknown",
] as const;
export const CatalogueStatusSchema = z.enum(CATALOGUE_STATUSES);
export type CatalogueStatus = z.infer<typeof CatalogueStatusSchema>;

/** The Czech disposition suffix: `+kk` is a kitchen corner, `+1` a separate kitchen. */
export const KITCHEN_KINDS = ["kitchenette", "separate"] as const;
export const KitchenSchema = z.enum(KITCHEN_KINDS);
export type Kitchen = z.infer<typeof KitchenSchema>;

const Money = z.number().finite().nonnegative().nullable();
const Sqm = z.number().finite().nonnegative().nullable();

export const CatalogueUnitSchema = z.strictObject({
  /** The unit's code as the developer uses it — the thing a buyer and an agent both say. */
  code: z.string().trim().min(1).max(64),
  /** The connector's own identifier for the record, carried for traceability. */
  externalId: z.string().trim().min(1).max(128),
  building: z.string().trim().min(1).max(64).nullable(),
  floor: z.number().int().nullable(),
  /** Derived. Null when the source's label could not be read as a count. */
  rooms: z.number().int().min(0).nullable(),
  /** The source's own layout label, untouched: `2+kk`, `layout_type`, a cell. */
  layout: z.string().trim().min(1).max(64).nullable(),
  kitchen: KitchenSchema.nullable(),
  /** The source's own type label or code, untouched: `17`, `flat`, `parking`. */
  unitType: z.string().trim().min(1).max(64).nullable(),
  areas: z.strictObject({
    interiorSqm: Sqm,
    exteriorSqm: Sqm,
    grossSqm: Sqm,
  }),
  price: z.strictObject({
    withVat: Money,
    withoutVat: Money,
    /** ISO 4217, upper case. Null when the source does not say. */
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
  }),
  /** Compass codes exactly as the source wrote them. Never interpreted here. */
  orientation: z.array(z.string().trim().min(1).max(8)).max(8),
  status: CatalogueStatusSchema,
  /** What the source said before mapping, so an `unknown` can be explained. */
  statusRaw: z.string().trim().min(1).max(64),
  availableFrom: InstantSchema.nullable(),
  /** The source's own modification time, when it has one. REALPAD has none. */
  updatedAt: InstantSchema.nullable(),
});
export type CatalogueUnit = z.infer<typeof CatalogueUnitSchema>;

export const CatalogueSnapshotSchema = z.strictObject({
  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  connector: ConnectorKindSchema,
  fetchedAt: InstantSchema,
  units: z.array(CatalogueUnitSchema),
});
export type CatalogueSnapshot = z.infer<typeof CatalogueSnapshotSchema>;

/* --- the disposition rule --------------------------------------------------- */

/**
 * `2+kk` → two rooms with a kitchen corner; `3+1` → three rooms and a kitchen.
 *
 * The Czech convention every REALPAD tenant writes in, and the one Lomnio's
 * `layout_type` and a Hungarian spreadsheet usually echo. A bare integer is a
 * count with nothing said about the kitchen. Anything else — `atyp`, a
 * commercial unit, a typo — is null, and the raw label survives beside it.
 * A studio is `1+kk` in this convention; whether Observer should call that
 * one room or its own layout is open in ADR-0036 and is not decided here.
 */
export function parseDisposition(raw: string | null | undefined): {
  readonly rooms: number | null;
  readonly kitchen: Kitchen | null;
} {
  if (raw === null || raw === undefined) return { rooms: null, kitchen: null };
  const text = raw.trim().toLowerCase();
  const withKitchen = /^(\d{1,2})\s*\+\s*(kk|1)$/.exec(text);
  if (withKitchen !== null) {
    return {
      rooms: Number(withKitchen[1]),
      kitchen: withKitchen[2] === "kk" ? "kitchenette" : "separate",
    };
  }
  const bare = /^(\d{1,2})$/.exec(text);
  if (bare !== null) return { rooms: Number(bare[1]), kitchen: null };
  return { rooms: null, kitchen: null };
}

/* --- what the product can place ---------------------------------------------- */

/** The eight points the showroom read models draw a unit's aspect with. */
export const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export const CompassSchema = z.enum(COMPASS_POINTS);
export type Compass = z.infer<typeof CompassSchema>;

/** The tenant's own orientation codes, mapped to compass points by a person. */
export type OrientationMap = Readonly<Record<string, string>>;

/** The three availability states the showroom surfaces draw. */
export type PlacedStatus = "available" | "reserved" | "sold";

const PLACED_STATUS: Partial<Record<CatalogueStatus, PlacedStatus>> = {
  available: "available",
  pre_reserved: "reserved",
  reserved: "reserved",
  sold: "sold",
};

export type Placement =
  | {
      readonly ok: true;
      readonly floor: number | null;
      readonly rooms: number | null;
      readonly areaSqm: number | null;
      readonly price: number | null;
      readonly orientation: Compass | null;
      readonly status: PlacedStatus;
      /** What the source did not state, in words. The unit is drawn with the gap said. */
      readonly gaps: readonly string[];
    }
  | { readonly ok: false; readonly reasons: readonly string[] };

/**
 * Which compass point a unit faces, by the tenant's mapping first and by an
 * exact compass code second. Never a guess: REALPAD's own example mixes Czech
 * and English letters on one line, and `S` is south in one and north in the
 * other.
 */
export function compassFor(
  codes: readonly string[],
  orientationMap: OrientationMap,
): Compass | null {
  for (const raw of codes) {
    const key = raw.trim();
    const mapped = orientationMap[key] ?? orientationMap[key.toUpperCase()];
    const candidate = (mapped ?? key).toUpperCase();
    if ((COMPASS_POINTS as readonly string[]).includes(candidate)) return candidate as Compass;
  }
  return null;
}

/**
 * Whether the showroom read models can draw this unit, and with what.
 *
 * One thing decides drawability: a state the surfaces have a word for.
 * Available, reserved and sold are drawn; a unit that is not for sale,
 * delayed or of unknown status is not, and the reason is returned in words
 * so the integrations screen can say so.
 *
 * A floor, a room count, an area, a price and a compass point are wanted,
 * not required. A unit lacking one is still drawn — the read models say the
 * absence in words where the figure would have stood — and the gap is named
 * here, so the same screen can say "3 units without a price" instead of a
 * number being invented to fill it, and instead of the unit vanishing.
 */
export function placementOf(unit: CatalogueUnit, orientationMap: OrientationMap): Placement {
  const areaSqm = unit.areas.interiorSqm ?? unit.areas.grossSqm;
  const price = unit.price.withVat ?? unit.price.withoutVat;
  const status = PLACED_STATUS[unit.status];
  const orientation = compassFor(unit.orientation, orientationMap);

  if (status === undefined) {
    return { ok: false, reasons: [`status ${unit.status.replaceAll("_", " ")}`] };
  }

  const gaps: string[] = [];
  if (unit.floor === null) gaps.push("no floor");
  if (unit.rooms === null) gaps.push("no room count");
  if (areaSqm === null) gaps.push("no area");
  if (price === null) gaps.push("no price");
  if (orientation === null) {
    gaps.push(
      unit.orientation.length === 0
        ? "no orientation"
        : `orientation code not mapped (${unit.orientation.join(", ")})`,
    );
  }
  return {
    ok: true,
    floor: unit.floor,
    rooms: unit.rooms,
    areaSqm,
    price,
    orientation,
    status,
    gaps,
  };
}

/* --- change, derived from two snapshots ------------------------------------- */

export const UNIT_CHANGE_KINDS = ["added", "changed", "withdrawn"] as const;
export const UnitChangeKindSchema = z.enum(UNIT_CHANGE_KINDS);
export type UnitChangeKind = z.infer<typeof UnitChangeKindSchema>;

export const UnitChangeSchema = z.strictObject({
  code: z.string().min(1).max(64),
  kind: UnitChangeKindSchema,
  /** Top-level fields whose value differs. Empty for `added` and `withdrawn`. */
  changedFields: z.array(z.string().min(1)),
  before: CatalogueUnitSchema.nullable(),
  after: CatalogueUnitSchema.nullable(),
});
export type UnitChange = z.infer<typeof UnitChangeSchema>;

type UnitField = keyof CatalogueUnit;

const FIELDS = Object.keys(CatalogueUnitSchema.shape) as readonly UnitField[];

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What changed between two fetches of the same catalogue, in code order.
 *
 * A unit present before and absent now is `withdrawn`, not deleted: the
 * catalogue is append-only history downstream (ADR-0001), and "the CRM no
 * longer lists it" is the fact, whatever the reason. A unit whose fields all
 * compare equal produces nothing, so an hourly fetch of an unchanged pricelist
 * is silent.
 */
export function diffCatalogue(
  previous: readonly CatalogueUnit[],
  next: readonly CatalogueUnit[],
): UnitChange[] {
  const before = new Map(previous.map((u) => [u.code, u]));
  const after = new Map(next.map((u) => [u.code, u]));
  const codes = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );

  const changes: UnitChange[] = [];
  for (const code of codes) {
    const was = before.get(code) ?? null;
    const is = after.get(code) ?? null;
    if (was === null && is !== null) {
      changes.push({ code, kind: "added", changedFields: [], before: null, after: is });
    } else if (was !== null && is === null) {
      changes.push({ code, kind: "withdrawn", changedFields: [], before: was, after: null });
    } else if (was !== null && is !== null) {
      const changedFields = FIELDS.filter((f) => !same(was[f], is[f]));
      if (changedFields.length > 0) {
        changes.push({ code, kind: "changed", changedFields, before: was, after: is });
      }
    }
  }
  return changes;
}
