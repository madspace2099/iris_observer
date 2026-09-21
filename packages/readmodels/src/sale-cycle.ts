import type { MetricState } from "./metric-value";

/**
 * From the first time a unit was opened in IRIS to the date the CRM states it
 * sold — one calculator, for every surface that asks.
 *
 * ## Why this is a contract and not four implementations
 *
 * Four routes want this number: the Briefing, Sales Flow, the unit register and
 * the executive overview. The plan says the unit panel must "use P2-06's result,
 * not its own formula", which is the same sentence this repository has now
 * needed three times — `AttentionState.rank` said two surfaces must agree and
 * only one read it, and a KPI qualifier rule reached one card out of four. A
 * rule stated in one place applies to that place until something enumerates the
 * places. So the arithmetic lives here, above every implementation of it, and
 * the enumeration is `sale-cycle.test.ts`.
 *
 * ## The two ends are on two clocks, and the interval is meaningless without
 * saying so
 *
 * The opening is observed by a showroom installation. The sale is a date the
 * CRM states, and `dateBasis` on the existing assisted-sales read model already
 * carries that distinction because the same question came up there. A duration
 * between two clocks is not wrong, but it is uninterpretable unless the reader
 * is told which clock each end is on — the precision differs, the time zone can
 * differ, and one of them is somebody else's record of an event rather than an
 * observation of it.
 *
 * ## What it refuses to answer, and why refusing is the feature
 *
 * The exclusions below are the interesting part. A sale with no stated date, a
 * first opening that lands after the sale, a unit whose earliest opening is the
 * first day of the data — none of these has a duration, and none of them is
 * zero. Rendering an impossible interval as a number is the failure this
 * repository keeps finding in other shapes: an absent value drawn as a figure.
 */

/** Which record a timestamp came from. Carried, never inferred. */
export const CYCLE_CLOCKS = ["showroom_observed", "crm_stated"] as const;
export type CycleClock = (typeof CYCLE_CLOCKS)[number];

/**
 * Why one sale produced no duration.
 *
 * Each is a different question a reader might ask, and collapsing them would
 * turn "we cannot see far enough back" into "nothing happened".
 */
export const CYCLE_EXCLUSIONS = [
  /** The CRM states no date for the sale. */
  "no_sale_date",
  /** Nothing in the visible history recorded this unit being opened. */
  "no_opening_recorded",
  /** The earliest opening is after the sale. A negative interval, not a zero one. */
  "opening_after_sale",
  /**
   * The earliest opening we can see is the edge of what we can see. The real
   * first opening may be older, so any duration would be a floor reported as a
   * fact. The metric registry excludes these by name: "sales whose first
   * interaction predates the project's data".
   */
  "opening_at_data_edge",
] as const;
export type CycleExclusion = (typeof CYCLE_EXCLUSIONS)[number];

/** One sale, as the surfaces can see it. */
export interface SaleCycleInput {
  readonly unitCode: string;
  /**
   * Earliest opening of this unit anywhere in the visible history, not the
   * latest. The assisted-sales reading answers a different question — did a
   * showing precede the sale closely — and measures the LAST opening for it.
   */
  readonly firstOpenedAt: string | null;
  readonly openingClock: CycleClock;
  /** Null when the CRM states no date, which is a state and not a zero. */
  readonly soldAt: string | null;
  readonly soldClock: CycleClock;
  /**
   * True when `firstOpenedAt` equals the earliest moment the data covers, so
   * the real first opening may be older than anything visible.
   */
  readonly openingAtDataEdge: boolean;
}

export type SaleCycleVerdict =
  | { readonly kind: "measured"; readonly unitCode: string; readonly days: number }
  | { readonly kind: "excluded"; readonly unitCode: string; readonly why: CycleExclusion };

export interface SaleCycleSummary {
  readonly verdicts: readonly SaleCycleVerdict[];
  /** Sales looked at. The denominator a reader is owed. */
  readonly examined: number;
  /** Sales that produced a duration. Never presented without `examined`. */
  readonly measured: number;
  /** How many fell out, by reason, so "we cannot see" never reads as "nothing". */
  readonly excluded: Readonly<Record<CycleExclusion, number>>;
  readonly medianDays: number | null;
  readonly p80Days: number | null;
  /** `ok` only when enough sales produced a duration. */
  readonly state: MetricState;
  /** The two clocks, always stated, because the interval spans them. */
  readonly clocks: { readonly opening: CycleClock; readonly sold: CycleClock } | null;
}

const MS_PER_DAY = 86_400_000;

function instant(value: string | null): number | null {
  if (value === null) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

/** One sale, classified. Exported because the seven cases are tested one at a time. */
export function classifySaleCycle(input: SaleCycleInput): SaleCycleVerdict {
  const { unitCode } = input;
  const sold = instant(input.soldAt);
  const opened = instant(input.firstOpenedAt);

  /*
   * Order matters and is not arbitrary. A sale with no date cannot be late or
   * early or anything else, so it is answered first; asking about the opening
   * of a sale that has no date would invent a comparison.
   */
  if (sold === null) return { kind: "excluded", unitCode, why: "no_sale_date" };
  if (opened === null) return { kind: "excluded", unitCode, why: "no_opening_recorded" };

  /*
   * Before the edge check, because an opening after the sale is wrong whether
   * or not it sits at the boundary, and the reader is better served by the
   * sharper reason.
   */
  if (opened > sold) return { kind: "excluded", unitCode, why: "opening_after_sale" };

  if (input.openingAtDataEdge) return { kind: "excluded", unitCode, why: "opening_at_data_edge" };

  return { kind: "measured", unitCode, days: (sold - opened) / MS_PER_DAY };
}

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const at = Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)));
  return sorted[at] ?? null;
}

/**
 * Every sale, summarised.
 *
 * `minimumSales` is the registry's, passed in rather than repeated here: a
 * second copy of a threshold is a second threshold the day one of them moves.
 */
export function summariseSaleCycles(
  inputs: readonly SaleCycleInput[],
  minimumSales: number,
): SaleCycleSummary {
  const verdicts = inputs.map(classifySaleCycle);

  const excluded = Object.fromEntries(CYCLE_EXCLUSIONS.map((reason) => [reason, 0])) as Record<
    CycleExclusion,
    number
  >;
  for (const verdict of verdicts) {
    if (verdict.kind === "excluded") excluded[verdict.why] += 1;
  }

  const days = verdicts
    .filter((v): v is Extract<SaleCycleVerdict, { kind: "measured" }> => v.kind === "measured")
    .map((v) => v.days)
    .sort((a, b) => a - b);

  /*
   * `empty` and `insufficient` are different answers to different questions —
   * nothing to measure at all, against too little to read a median from — and
   * the registry already words both.
   */
  const state: MetricState =
    inputs.length === 0 ? "empty" : days.length < minimumSales ? "insufficient" : "ok";

  return {
    verdicts,
    examined: inputs.length,
    measured: days.length,
    excluded,
    medianDays: percentile(days, 0.5),
    p80Days: percentile(days, 0.8),
    state,
    clocks:
      inputs[0] === undefined
        ? null
        : { opening: inputs[0].openingClock, sold: inputs[0].soldClock },
  };
}
