import type { IntentLevel } from "@observer/contracts";
import type { ViewContext } from "./context";
import type { EvidenceRef } from "./metric-value";

/**
 * Project Pulse — the building, and what buyers are doing to it.
 *
 * The read model behind Observer's signature surface. It is a spatial
 * abstraction built entirely from the unit catalogue and observed interest: real
 * floors, real units, real availability, real attention. Nothing here is
 * invented for the picture.
 *
 * It is deliberately **not** a chart. Selecting a floor, a segment or a unit
 * must change the narrative, the evidence, the actions and the Ask Observer
 * context — a Pulse that drives nothing has failed and should be deleted.
 */

export const UNIT_STATUSES = ["available", "reserved", "sold"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

/**
 * What happened to this unit inside the selected period.
 *
 * A second channel that only fires on news. Most cells carry `null`, which is
 * what makes the ones that do not stand out.
 */
export const UNIT_CHANGES = [
  "sold",
  "reserved",
  "price_cut",
  "demand_drop",
  "new_interest",
] as const;
export type UnitChange = (typeof UNIT_CHANGES)[number];

export type DemandTrend = "rising" | "flat" | "falling";

export interface PulseUnit {
  readonly unitId: string;
  readonly code: string;
  readonly block: string;
  readonly floor: number;
  readonly rooms: number;
  readonly areaSqm: number;
  readonly orientation: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  readonly price: number;
  readonly priceDisplay: string;
  readonly status: UnitStatus;

  /** Meaningful views in the period. The raw figure behind the luminance. */
  readonly meaningfulViews: number;
  /** Distinct identified people. People, not events. */
  readonly uniqueContacts: number;
  /** Normalised 0–1 against the project's busiest unit. Drives fill luminance. */
  readonly attention: number;
  readonly trend: DemandTrend;
  /** Only set when something happened in the period. */
  readonly change: UnitChange | null;
  /** Strongest intent signal held against this unit, if any. */
  readonly intent: IntentLevel | null;
}

export interface PulseFloor {
  readonly floor: number;
  readonly label: string;
  readonly units: readonly PulseUnit[];
  /** Floor totals, so a floor can be read without summing cells by eye. */
  readonly available: number;
  readonly attention: number;
}

/**
 * A segment the Pulse can be filtered or read by.
 *
 * `attentionIndex` is the workhorse: share of attention divided by share of
 * inventory. Above one means the segment draws more interest than its size
 * warrants — which is the finding the Overview verdict rests on.
 */
export interface PulseSegment {
  readonly id: string;
  readonly dimension: "rooms" | "orientation" | "floor_band" | "price_band";
  readonly label: string;
  readonly unitIds: readonly string[];
  readonly attentionIndex: number;
  readonly conversionRatio: number | null;
  readonly available: number;
}

export interface ProjectPulse {
  readonly context: ViewContext;
  readonly buildingLabel: string;
  /** Top floor first, so the building reads the way it stands. */
  readonly floors: readonly PulseFloor[];
  readonly blocks: readonly string[];
  readonly segments: readonly PulseSegment[];
  readonly totals: {
    readonly units: number;
    readonly available: number;
    readonly reserved: number;
    readonly sold: number;
    readonly soldInPeriod: number;
  };
  /** Meaningful views on the busiest unit; the denominator for luminance. */
  readonly peakViews: number;
  readonly evidence: EvidenceRef;
}

/* --- Ask Observer --------------------------------------------------------- */

/**
 * The assistant's context, made visible.
 *
 * Shown as chips on the command rail so the reader can see what a question
 * will be answered against before they ask it. An assistant whose scope is
 * invisible produces answers nobody can check.
 */
export interface AskContext {
  readonly projectLabel: string;
  readonly periodLabel: string;
  readonly selectionLabel: string | null;
}

export interface AskFigure {
  readonly label: string;
  readonly value: string;
  readonly note: string | null;
}

/**
 * One answer.
 *
 * Deterministic in this phase, produced behind the tool interface a model will
 * later call. The model's job will be to choose the query and write the prose;
 * it will never compute the figures.
 */
export interface AskAnswer {
  readonly question: string;
  /** The sentence. One claim, with its number inside it. */
  readonly answer: string;
  readonly figures: readonly AskFigure[];
  readonly evidence: EvidenceRef | null;
  /** Where the answer says to go next, if anywhere. */
  readonly actionLabel: string | null;
  readonly actionHref: string | null;
  /** Derived from the current selection, never a static list. */
  readonly followUps: readonly string[];
  /** Stated when the answer rests on an incomplete picture. */
  readonly caveat: string | null;
}

export interface AskSession {
  readonly context: AskContext;
  readonly suggestions: readonly string[];
  readonly answers: readonly AskAnswer[];
}
