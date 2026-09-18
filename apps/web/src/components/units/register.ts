import type { UnitAttentionRow } from "@observer/readmodels";

/** What the rooms filter carries for units whose count the catalogue did not state. */
export const ROOMS_UNSTATED = "unstated";

/** The filter value a row answers to: its count, or the word for none. */
export function roomsKey(rooms: number | null): string {
  return rooms === null ? ROOMS_UNSTATED : String(rooms);
}

/**
 * THE REGISTER'S QUERY, AND WHY ALL OF IT LIVES IN THE URL.
 *
 * A unit register is the one surface in this product a reader works in rather
 * than reads: they narrow it to the available two-bedroom flats, order it by
 * how much looking time each one took, and then send that exact screen to a
 * colleague. Every one of those decisions is therefore part of what they were
 * looking at, and none of it may live anywhere a link cannot carry.
 *
 * This application stores nothing in the browser — a test scans
 * `apps/web/src` for `localStorage`, `sessionStorage` and `indexedDB` and
 * expects zero hits — so the choice is not between the URL and client state.
 * It is between the URL and forgetting.
 *
 * ## What this file is allowed to do, and what it is not
 *
 * It SELECTS and ORDERS rows the read model already produced. It does not
 * compute a single figure: no rate, no share, no rank number, no total, and
 * nothing that would end up on screen as a measurement. ADR-0012 puts metric
 * production in the read model, and every number the register draws comes off
 * `UnitAttentionRow` exactly as `getUnitAttention` built it.
 *
 * Ordering is the reader's arrangement of a register, not a verdict about the
 * units in it. That distinction is why the screen states, beside the table,
 * that the order is theirs — a table sorted by views is not a ranking of which
 * flat is doing well, and the moment it is read as one the sample rule
 * (`docs/10-policies.md` §6) has been broken by the furniture rather than by a
 * figure.
 *
 * ## The gap this file exists to work around
 *
 * `getUnitAttention(query, unitCode)` takes a unit code and nothing else.
 * There is no `UnitFilters` shape the way there is a `MeetingFilters` for the
 * meeting list, so the register filters and orders the rows the port returned
 * rather than asking the port for the ones it wants. On a synthetic catalogue
 * of forty-eight flats that is invisible; on a scheme of two thousand it is a
 * read model that needs the filter pushed into it. Reported, not hidden.
 */

/** Every column a reader may order the register by. The default is demand. */
export const UNIT_SORT_KEYS = [
  "code",
  "status",
  "rooms",
  "floor",
  "area",
  "price",
  "meetings",
  "views",
  "favourites",
  "plans",
  "comparisons",
  "demand",
] as const;
export type UnitSortKey = (typeof UNIT_SORT_KEYS)[number];

/** The words `aria-sort` uses, so the header and the URL cannot disagree. */
export type SortDirection = "ascending" | "descending";

/** Which units are in the register at all. See {@link SCOPE_OPTIONS}. */
export const REGISTER_SCOPES = ["opened", "all"] as const;
export type RegisterScope = (typeof REGISTER_SCOPES)[number];

export const SCOPE_OPTIONS: readonly { readonly value: RegisterScope; readonly label: string }[] = [
  { value: "opened", label: "Opened in front of a buyer" },
  { value: "all", label: "Every unit in the catalogue" },
];

export const STATUS_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "sold", label: "Sold" },
];

/**
 * The register's whole state, resolved from the query string.
 *
 * `unit` is not a filter. It is the row a reader arrived at from somewhere else
 * — an attention state names a unit and links here with `?unit=IT-A-12-07` —
 * and it marks that row rather than hiding the others, so the reader can see
 * where the named flat sits among its neighbours instead of being handed it
 * alone.
 */
export interface RegisterQuery {
  readonly q: string;
  readonly status: string;
  readonly rooms: string;
  readonly scope: RegisterScope;
  readonly sort: UnitSortKey;
  readonly dir: SortDirection;
  /** True once the reader has asked past the first page of rows. */
  readonly more: boolean;
  readonly unit: string | null;
}

/** The raw shape a page receives from `searchParams`. Every field optional. */
export interface RegisterSearch {
  readonly q?: string;
  readonly status?: string;
  readonly rooms?: string;
  readonly shown?: string;
  readonly sort?: string;
  readonly dir?: string;
  readonly more?: string;
  readonly unit?: string;
}

function isSortKey(value: string | undefined): value is UnitSortKey {
  return UNIT_SORT_KEYS.includes(value as UnitSortKey);
}

function isScope(value: string | undefined): value is RegisterScope {
  return REGISTER_SCOPES.includes(value as RegisterScope);
}

/**
 * The query, with every unrecognised value falling back rather than throwing.
 *
 * A stale link in somebody's notes should show them the register, not an error.
 * The same reasoning `presetFrom` applies to the period applies to every value
 * here, and for the same reason: none of these is a security boundary — the
 * surface has already been authorised — so a wrong value is a typo, not an
 * attack, and the honest response to a typo is the default view.
 */
export function readRegisterQuery(search: RegisterSearch): RegisterQuery {
  const dir = search.dir === "asc" ? "ascending" : search.dir === "desc" ? "descending" : null;
  const sort = isSortKey(search.sort) ? search.sort : "demand";
  return {
    q: (search.q ?? "").trim(),
    status: STATUS_OPTIONS.some((option) => option.value === search.status)
      ? (search.status ?? "all")
      : "all",
    rooms: (search.rooms ?? "all").trim() === "" ? "all" : (search.rooms ?? "all"),
    scope: isScope(search.shown) ? search.shown : "opened",
    sort,
    /*
     * The default direction depends on the column, and that is not a
     * decoration. A reader who clicks "Views" wants the busiest first; a reader
     * who clicks "Unit" wants A before B. Sending both to ascending would make
     * half the columns take two clicks to say anything.
     */
    dir: dir ?? (sort === "code" || sort === "status" ? "ascending" : "descending"),
    more: search.more === "1",
    unit: search.unit === undefined || search.unit === "" ? null : search.unit,
  };
}

/** The query as URL parameters, minus everything that is already the default. */
function parametersOf(query: RegisterQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q !== "") params.set("q", query.q);
  if (query.status !== "all") params.set("status", query.status);
  if (query.rooms !== "all") params.set("rooms", query.rooms);
  if (query.scope !== "opened") params.set("shown", query.scope);
  if (query.sort !== "demand") params.set("sort", query.sort);
  params.set("dir", query.dir === "ascending" ? "asc" : "desc");
  if (query.more) params.set("more", "1");
  if (query.unit !== null) params.set("unit", query.unit);
  return params;
}

/**
 * A link back to this register with some of its state changed.
 *
 * The period is deliberately absent: every link in this product goes through
 * `withPeriod` at the point it is rendered, and a helper that added it here as
 * well would produce it twice on the sort headers, which `DataTable` already
 * periodises for its callers.
 */
export function registerHref(
  base: string,
  query: RegisterQuery,
  changes: Partial<RegisterQuery> = {},
): string {
  const params = parametersOf({ ...query, ...changes });
  const search = params.toString();
  return search === "" ? base : `${base}?${search}`;
}

/**
 * Where a column header points, and how it is sorted right now.
 *
 * Clicking the column already in force reverses it; clicking any other column
 * takes that column's own natural direction rather than inheriting the previous
 * one. Inheriting is what produces a price column sorted cheapest-first
 * immediately after a views column sorted busiest-first, which reads as a bug.
 */
export function sortStateFor(
  key: UnitSortKey,
  base: string,
  query: RegisterQuery,
): { readonly href: string; readonly direction: SortDirection | "none" } {
  const current = query.sort === key;
  const natural: SortDirection = key === "code" || key === "status" ? "ascending" : "descending";
  const next: SortDirection = current
    ? query.dir === "ascending"
      ? "descending"
      : "ascending"
    : natural;
  return {
    href: registerHref(base, query, { sort: key, dir: next }),
    direction: current ? query.dir : "none",
  };
}

/**
 * Which units the reader asked to see.
 *
 * The search matches the unit code and the orientation, which are the two
 * things a person types when they are looking for one flat or for the west-
 * facing ones. It does not match the price or the area: a substring match
 * against a formatted price is the kind of search that returns nothing for
 * "500000" and everything for "0", and a range control over a measured
 * quantity is the thing `FilterBar` deliberately refuses to express.
 */
export function filterRows(
  rows: readonly UnitAttentionRow[],
  query: RegisterQuery,
): readonly UnitAttentionRow[] {
  const needle = query.q.toLowerCase();
  return rows.filter((row) => {
    if (query.scope === "opened" && row.meetings === 0) return false;
    if (query.status !== "all" && row.status !== query.status) return false;
    if (query.rooms !== "all" && roomsKey(row.rooms) !== query.rooms) return false;
    if (needle === "") return true;
    return (
      row.unitCode.toLowerCase().includes(needle) ||
      (row.orientation ?? "").toLowerCase().includes(needle)
    );
  });
}

/** Sold last, then reserved, then available: the order a register is read in. */
const STATUS_ORDER: Readonly<Record<UnitAttentionRow["status"], number>> = {
  available: 0,
  reserved: 1,
  sold: 2,
};

/**
 * The value a column orders by. Never a value the screen prints.
 *
 * `price` orders by nothing the reader can see — `UnitAttentionRow` carries the
 * formatted `priceDisplay` and not the number behind it — so the register
 * orders by the string, which sorts correctly only while every price shares a
 * format and a width. That is true of the synthetic catalogue and is not a
 * property anybody promised, so it is reported as a gap rather than relied on
 * quietly: the row wants a raw `price` beside its display, exactly as
 * `UnitAttributes` on the unit's own page already carries both.
 */
function keyOf(row: UnitAttentionRow, key: UnitSortKey): number | string | null {
  switch (key) {
    case "code":
      return row.unitCode;
    case "status":
      return STATUS_ORDER[row.status];
    /*
     * A count, a floor or an area the catalogue did not state has no key:
     * it is not zero and not the largest, it is absent, and `sortRows` puts
     * it after every stated value whichever way the column is ordered.
     */
    case "rooms":
      return row.rooms;
    case "floor":
      return row.floor;
    case "area":
      return row.areaSqm;
    case "price":
      return row.priceDisplay;
    case "meetings":
      return row.meetings;
    case "views":
      return row.views;
    case "favourites":
      return row.favourites;
    case "plans":
      return row.pdfOpens;
    case "comparisons":
      return row.comparisonAppearances;
    case "demand":
      return row.attention;
  }
}

/**
 * The rows in the reader's order, with the unit code as the tie-break.
 *
 * The tie-break is not a detail. Half of these columns are small integers, so a
 * register ordered by "shortlisted" has forty rows holding the value zero, and
 * without a second key their order is whatever the projection happened to
 * produce — which changes between two identical requests and makes the same
 * link show a different table. A stable secondary key on the code makes the URL
 * mean one thing.
 */
export function sortRows(
  rows: readonly UnitAttentionRow[],
  query: RegisterQuery,
): readonly UnitAttentionRow[] {
  const sign = query.dir === "ascending" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = keyOf(a, query.sort);
    const right = keyOf(b, query.sort);
    /* Absent is last, whichever way the stated values run. */
    if (left === null || right === null) {
      if (left === right) return a.unitCode.localeCompare(b.unitCode);
      return left === null ? 1 : -1;
    }
    const compared =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right);
    if (compared !== 0) return compared * sign;
    return a.unitCode.localeCompare(b.unitCode);
  });
}

/**
 * How many rows are drawn before the reader asks for the rest.
 *
 * Twelve was the reviewed number on the surface this replaces, chosen when the
 * register showed one thing. This one is filterable and sortable, so the first
 * screenful is the reader's own answer rather than an arbitrary top slice, and
 * it can afford to be longer without becoming the spreadsheet the review
 * rejected.
 */
export const REGISTER_PAGE = 20;
