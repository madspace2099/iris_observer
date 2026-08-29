/**
 * The shapes the Observer demonstration surface reads.
 *
 * Deliberately its own module rather than a re-export of `@observer/contracts`:
 * the production contracts describe what the ingestion pipeline actually
 * records, and this describes a fixture. Sharing the type would let a reader —
 * or a future change — mistake one for the other, and the whole point of this
 * surface is that it never claims to be live.
 */

/** Where an observation was made. `unknown` is a real answer, not a gap. */
export type Channel = "web" | "showroom";

/** What a channel filter can select. */
export type ChannelFilter = Channel | "all";

/** How much of the record a screen is looking at. */
export type RangeKey = "7d" | "28d" | "90d";

export type Availability = "available" | "reserved" | "sold";

export type Orientation = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

/**
 * How firmly a finding is supported.
 *
 * These are Observer's evidence words and they are not interchangeable. An
 * observed sequence is a thing that happened in order; an attributed conversion
 * is a deterministic link between an outcome and a prior observation; a
 * statistical association is a correlation and nothing more. The interface must
 * never let the third read as the first.
 */
export type EvidenceType = "observed-sequence" | "attributed-conversion" | "association";

export type InsightStatus = "new" | "reviewed" | "monitoring";

export type DemandStatus = "rising" | "steady" | "cooling" | "quiet";

/** One project's worth of demonstration content. */
export interface DemoProject {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  /** Total units in the release this fixture covers. */
  readonly unitCount: number;
}

/**
 * One day of observed activity on one channel.
 *
 * This is the SOURCE for every total on every screen. Cards, charts, the funnel
 * and the unit table all reduce this array, so a number cannot disagree with
 * the chart beside it without the chart being wrong too.
 */
export interface DayRow {
  /** ISO date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly channel: Channel;
  /** Sessions observed. */
  readonly sessions: number;
  /** Sessions that met the qualified-journey definition. */
  readonly qualified: number;
  /** Sessions that opened at least one unit. */
  readonly explorers: number;
  /** Unit detail views. One session may contribute several. */
  readonly unitViews: number;
  /** Favourites added. */
  readonly favorites: number;
  /** Sessions that reached a meeting or showroom appointment. */
  readonly meetings: number;
  /** Reservations attributed to an observed journey. */
  readonly reservations: number;
}

export interface DemoUnit {
  readonly id: string;
  /** What a buyer and an agent both call it. */
  readonly label: string;
  readonly floor: number;
  readonly rooms: number;
  readonly orientation: Orientation;
  /** Interior square metres. */
  readonly area: number;
  /** Asking price in HUF. */
  readonly price: number;
  readonly availability: Availability;
  /**
   * This unit's share of the project's unit-level activity.
   *
   * A weight rather than a count: the counts are derived from the day rows for
   * whatever period and channel is selected, so they move with the filters and
   * still sum to the totals shown everywhere else.
   */
  readonly weight: number;
  /** Weight applied to the previous period, so a trend is a real comparison. */
  readonly priorWeight: number;
}

/** A unit with its counts resolved for the selected period and channel. */
export interface UnitDemand {
  readonly unit: DemoUnit;
  readonly views: number;
  readonly favorites: number;
  readonly priorViews: number;
  /** Percentage change against the previous window; null when there is no base. */
  readonly changePct: number | null;
  readonly status: DemandStatus;
}

export interface MetricCardValue {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly previous: number;
  /** How to render the number. */
  readonly format: "count" | "percent";
  /** One sentence a reader can hover or focus to read. */
  readonly description: string;
  /** Daily values across the selected window, for the sparkline. */
  readonly spark: readonly number[];
}

export interface FunnelStage {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** Share of the first stage. */
  readonly ofFirst: number;
  /** Share of the immediately preceding stage. */
  readonly ofPrevious: number;
}

export interface SeriesPoint {
  readonly date: string;
  readonly web: number;
  readonly showroom: number;
}

export interface ChannelSplit {
  readonly channel: Channel | "unknown";
  readonly label: string;
  readonly sessions: number;
  readonly reservations: number;
  /** Journeys seen on both channels and deterministically linked. */
  readonly linkedJourneys: number;
}

export interface ObserverInsight {
  readonly id: string;
  readonly title: string;
  readonly evidence: EvidenceType;
  readonly status: InsightStatus;
  /** What the finding is about: a unit group, a channel, the whole project. */
  readonly subject: string;
  /** Which topic filter this belongs to. */
  readonly topic: "demand" | "attribution" | "journey" | "data-quality";
  /** The measurement behind it, already worded as an observation. */
  readonly measurement: string;
  /** Why a person should care. */
  readonly whyItMatters: string;
  /** What a person might do. Never phrased as a certainty. */
  readonly recommendation: string;
  /** Why the evidence is as strong or as weak as it is. */
  readonly strength: string;
  readonly unitIds: readonly string[];
}

/** One thing that happened, for a unit's recent-activity list. */
export interface UnitEvent {
  readonly at: string;
  readonly channel: Channel;
  readonly kind: "view" | "favorite" | "meeting" | "reservation";
  readonly detail: string;
}

/** Re-exported so a test can name the selection without importing the metrics. */
export type { Selection } from "./metrics";
