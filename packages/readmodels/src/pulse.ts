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

/**
 * A unit as the catalogue states it, and as the showroom observed it.
 *
 * Floor, room count, area, aspect and price are what a catalogue stated —
 * and a real catalogue does not state all of them for every unit. Each is
 * `null` when the source gave nothing, and the surfaces say so in words where
 * the figure would have stood. `priceDisplay` carries that word when `price`
 * is null, so a cell never has to invent one.
 */
export interface PulseUnit {
  readonly unitId: string;
  readonly code: string;
  readonly block: string;
  readonly floor: number | null;
  readonly rooms: number | null;
  readonly areaSqm: number | null;
  readonly orientation: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | null;
  readonly price: number | null;
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
  /** `null` for the one row that holds units whose catalogue states no floor. */
  readonly floor: number | null;
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
    /** Null when nothing observed the period — a delivered catalogue with no sessions behind it. */
    readonly soldInPeriod: number | null;
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

/* --- previous conversations ----------------------------------------------- */

/**
 * Where a stored conversation came from.
 *
 * One member, deliberately. Ask Observer answers deterministically behind the
 * tool interface a model will later call, and **nobody has yet held any of
 * these conversations** — they are written so the history surface can be built
 * and reviewed before there is a history to show.
 *
 * A boolean would have been a flag a component could forget to read, and a
 * two-member union would have been an invitation to render "real" and
 * "demonstration" threads in the same list. A single-member type means there is
 * no value a surface can compare against to present one of these as somebody's
 * own past question, and adding a second member later is a type change every
 * call site has to acknowledge.
 */
export const ASK_THREAD_ORIGINS = ["demonstration"] as const;
export type AskThreadOrigin = (typeof ASK_THREAD_ORIGINS)[number];

/**
 * One conversation, as the list shows it.
 *
 * The title is the question that opened the thread rather than a generated
 * summary of it: a thread named by a model is a thread whose name nobody can
 * check, and the opening question is both the most useful label and one that
 * cannot drift from what is inside.
 */
export interface AskThreadSummary {
  readonly threadId: string;
  readonly title: string;
  readonly askedAt: string;
  readonly askedAtDisplay: string;
  /** The project and period the thread was answered against, kept with it. */
  readonly projectLabel: string;
  readonly periodLabel: string;
  /** What was selected on the Pulse when it was asked, if anything. */
  readonly selectionLabel: string | null;
  readonly pinned: boolean;
  readonly turnCount: number;
  readonly origin: AskThreadOrigin;
  readonly href: string;
}

/**
 * One exchange.
 *
 * `answer` is the existing `AskAnswer`, unchanged, which already carries the
 * question, the structured prose, the compact figures, the evidence reference,
 * the next questions and the caveat. A second answer shape for stored threads
 * would be the same contract twice, and the two would disagree the first time
 * one of them gained a field.
 */
export interface AskTurn {
  readonly id: string;
  readonly askedAtDisplay: string;
  readonly answer: AskAnswer;
}

export interface AskThread {
  readonly context: ViewContext;
  readonly summary: AskThreadSummary;
  readonly turns: readonly AskTurn[];
  readonly origin: AskThreadOrigin;
  /** Rendered on the thread, not in a footnote. States what these are. */
  readonly demonstrationNotice: string;
  readonly evidence: EvidenceRef;
}

export interface AskHistoryView {
  readonly context: ViewContext;
  /** Every thread, newest first. Pinned ones appear here as well as below. */
  readonly threads: readonly AskThreadSummary[];
  readonly pinned: readonly AskThreadSummary[];
  readonly origin: AskThreadOrigin;
  readonly demonstrationNotice: string;
  /** What to say when there is nothing. Written here, never by a component. */
  readonly emptyState: string;
  readonly evidence: EvidenceRef;
}
