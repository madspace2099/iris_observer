import type { KpiWindowId } from "./charts";

/**
 * THE PROJECT'S ROOM TYPES, SIDE BY SIDE (ADR-0056).
 *
 * The owner, recording the Shark demo on 2026-10-22, asked the Project page
 * three things about flat sizes: how many of each there are and how many sold;
 * how much interest each draws over a week, a month, a quarter, a half-year, a
 * year or all time, in one chart; and the types next to each other, so he can
 * compare them. The room types are the catalogue's own room counts (and the
 * flats whose count it does not state, as their own type) — never a fixed four.
 *
 * Every figure here is computed by the read model; the page prints the display
 * strings and draws the shares it is given.
 */

/** The windows the interest chart offers: Sales Flow's rolling windows, without "Today". */
export type RoomTypeWindowId = Exclude<KpiWindowId, "today">;

/** One room type, the stock side: what the catalogue holds and what the CRM says is gone. */
export interface RoomType {
  /** The segment's id, `rooms-2`: the key `ProjectView.segments` uses. */
  readonly id: string;
  readonly label: string;
  /** Null for the flats whose room count the catalogue does not state. */
  readonly rooms: number | null;
  readonly flats: number;
  /** "27 flats". */
  readonly flatsDisplay: string;
  /** `flats` over every flat in the catalogue. */
  readonly stockShare: number;
  readonly stockShareDisplay: string;
  /** Sold (a purchase) and reserved, from the CRM; null where none is connected, never 0. */
  readonly sold: number | null;
  readonly reserved: number | null;
  /** `sold` over `flats`; null with no CRM. */
  readonly soldShare: number | null;
  /** "13 sold · 48%"; null with no CRM (the view says why, once). */
  readonly soldDisplay: string | null;
  /** "7 reserved"; null with no CRM. */
  readonly reservedDisplay: string | null;
  /** The audience page for buyers who opened this type, without the period. */
  readonly audienceHref: string;
}

/** One room type's interest in a window. */
export interface RoomTypeShare {
  readonly id: string;
  /** Meetings in the window that opened at least one flat of the type. */
  readonly opened: number;
  /** `opened` over the window's meetings; null with no meeting. */
  readonly share: number | null;
  /** "99%", or "—" with no meeting. */
  readonly shareDisplay: string;
  /**
   * Against the same length of time immediately before, in points: "+5 pts",
   * "−3 pts", "no change". Null where either side is under the floor or there
   * is no time before (`RoomTypeWindow.changeAgainst` says which).
   */
  readonly change: {
    readonly direction: "up" | "down" | "flat";
    readonly display: string;
  } | null;
}

/** The window split into equal parts, one share per type and part. */
export interface RoomTypeTrend {
  /** Each part's last day ("24 Aug") and its meetings. */
  readonly parts: readonly { readonly label: string; readonly meetings: number }[];
  /**
   * Per type, one value per part, 0 to 1, and what each point says when
   * pointed at ("50% of 10 meetings"); both null for a part under the floor.
   */
  readonly series: readonly {
    readonly id: string;
    readonly values: readonly (number | null)[];
    readonly points: readonly (string | null)[];
  }[];
  /** What one point is: "Each point is one 6-day part". */
  readonly caption: string;
  /** Said instead of the drawing when fewer than two parts reach the floor; null when drawn. */
  readonly empty: string | null;
}

export interface RoomTypeWindow {
  readonly id: RoomTypeWindowId;
  /** "Last 30 days". */
  readonly label: string;
  /** The switch's word for it, the owner's: "Week", "Month", … "All time". */
  readonly name: string;
  readonly meetings: number;
  /** "83 meetings in the last 30 days": the set every share of the window is of. */
  readonly meetingsDisplay: string;
  readonly shares: readonly RoomTypeShare[];
  /** What the change column is against, or why it is empty. */
  readonly changeAgainst: string;
  /** The window in a sentence: which type is opened most, and which moved most. */
  readonly reading: string;
  readonly trend: RoomTypeTrend;
}

/** Interest against sales, for one room type, in plain words. */
export interface RoomTypeReading {
  readonly id: string;
  readonly label: string;
  /** The attention index in the page's period; null where there is none. */
  readonly lookedAt: number | null;
  /** "1.54×", or "—". */
  readonly lookedAtDisplay: string;
  readonly soldShare: number | null;
  /** "48%", or "—" with no CRM. */
  readonly soldDisplay: string;
  readonly verdict: "wanted_selling" | "wanted_slow" | "shown_less_selling" | "neither" | null;
  /** "Wanted, and selling well"; or why there is no reading. */
  readonly headline: string;
  /** What the reading suggests doing; null with no reading. */
  readonly action: string | null;
  /** The sample: "127 meetings opened one", "12 meetings opened one · 8 short of 20". */
  readonly basis: string;
}

/** One column of the side-by-side comparison. */
export interface RoomTypeColumn {
  readonly id: string;
  readonly label: string;
  /** "33 openings": the set every rate in the column is of. */
  readonly openingsDisplay: string;
  /** Under the floor: its rates are shown, never marked highest. */
  readonly belowMinimum: boolean;
  /** "too few to compare · 9 short of 20"; null at or above the floor. */
  readonly shortNote: string | null;
  readonly audienceHref: string;
}

export interface RoomTypeComparisonRow {
  readonly id: string;
  readonly label: string;
  /** One per column, in the columns' order. */
  readonly cells: readonly {
    readonly id: string;
    /** 0 to 1; null where the type was never opened. */
    readonly rate: number | null;
    readonly display: string;
    /** The highest of the row, among the columns at or above the floor. */
    readonly highest: boolean;
  }[];
}

export interface RoomTypesView {
  readonly types: readonly RoomType[];
  /** "60 flats". */
  readonly flatsDisplay: string;
  /** Sold flats over every flat, the line each type's sold share is read against; null with no CRM. */
  readonly projectSoldShare: number | null;
  /** "24 of 60 sold · 40%"; null with no CRM. */
  readonly projectSoldDisplay: string | null;
  /** Why sold and reserved are absent; null with a CRM. */
  readonly soldUnavailable: string | null;
  readonly windows: readonly RoomTypeWindow[];
  readonly defaultWindow: RoomTypeWindowId;
  /** What the block's figures are, for its `i`. */
  readonly definition: string;

  readonly readings: readonly RoomTypeReading[];
  /** "Sold, against the project's 40%". */
  readonly soldAgainst: string;
  /** What the upright marks on the two scales are, said once under them. */
  readonly readingMarks: string;
  readonly readingDefinition: string;

  readonly columns: readonly RoomTypeColumn[];
  readonly rows: readonly RoomTypeComparisonRow[];
  readonly comparisonDefinition: string;
}
