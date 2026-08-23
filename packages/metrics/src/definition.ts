import type { FactId } from "@observer/contracts";
import type { EvidenceTier } from "@observer/contracts";

/**
 * The metric definition.
 *
 * A metric is declared once, here, and never re-derived inside a component.
 * The registry is the single source from which three other things are
 * generated: the typed query layer, the measurement dependency matrix, and the
 * instrumentation specification handed to the Unreal Engine developer.
 *
 * That last one is the reason the shape is this demanding. A screen can
 * silently depend on a fact nobody ever implemented; the only defence is to
 * make every dependency declarable and then generate the backlog from it.
 *
 * Note that metrics depend on **observable facts**, not on wire event names
 * (ADR-0013). The event catalogue maps events onto facts later, and the matrix
 * expands the chain then.
 */

/** Who is allowed to see a metric. Enforced in the query layer, not the UI. */
export const ROLES = ["sales_agent", "agency_manager", "developer", "madspace_admin"] as const;
export type Role = (typeof ROLES)[number];

/** Dimensions a metric can be sliced by. */
export const DIMENSIONS = [
  "project",
  "period",
  "agent",
  "agency",
  "contact",
  "unit",
  "rooms",
  "floor_band",
  "orientation",
  "price_band",
  "area_band",
  "building",
  "unit_status",
  "outcome",
  "channel",
  "online_interest_segment",
  "language",
  "environment_preset",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** How a value is compared with its baseline. */
export const COMPARISON_METHODS = [
  /** Same length of time immediately before the selected period. */
  "previous_period",
  /** Completed quarter against the previous completed quarter. */
  "previous_quarter",
  /**
   * Current quarter to date against the same number of elapsed days in the
   * previous quarter. Comparing a part-quarter to a whole one is the most
   * common way a dashboard produces a false alarm.
   */
  "quarter_to_date_equivalent",
  /** Against the project's own all-time figure. */
  "project_baseline",
  /** Against the tenant's other projects. */
  "tenant_baseline",
  /** No meaningful baseline exists; the number stands alone. */
  "none",
] as const;
export type ComparisonMethod = (typeof COMPARISON_METHODS)[number];

/** The unit a metric is expressed in, which decides how it renders. */
export const METRIC_KINDS = [
  "count",
  "ratio",
  "duration",
  "currency",
  "distribution",
  "list",
] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];

/**
 * Attribution rules, mandatory for any metric that assigns an outcome to a
 * channel.
 *
 * Without these written down, "WEBIRIS-to-showroom conversion" means whatever
 * the reader assumes it means, and two people will read the same number
 * differently. Making the rule part of the definition also makes it
 * displayable next to the figure, which is the point.
 */
export interface AttributionRule {
  /** Maximum time between the online touch and the outcome, in days. */
  readonly windowDays: number;
  /**
   * The identity link strong enough to count. Anything weaker is excluded
   * rather than counted at a discount — a discounted guess is still a guess.
   */
  readonly qualifyingLink: "deterministic_only" | "deterministic_or_verified";
  /** Which touch receives the credit. */
  readonly touchModel: "first_touch" | "last_touch" | "both_reported";
  /**
   * How a booking that arrived with no online history is handled. Never
   * silently folded into the attributed group.
   */
  readonly directBookingTreatment: "separate_bucket" | "excluded";
  /** What to do when the source system was disconnected for part of the period. */
  readonly missingSourceTreatment: "report_as_unknown" | "exclude_period";
}

/** What the screen shows when there is nothing, or not enough, or no source. */
export interface MetricStates {
  /** Genuinely zero, and that is a real answer. */
  readonly empty: string;
  /** Below the minimum sample; the number exists but must not be read as a verdict. */
  readonly insufficient: string;
  /** A required source is missing, so the number cannot be produced at all. */
  readonly unavailable: string;
}

export interface MetricDefinition {
  readonly id: string;
  readonly displayName: string;
  /** What it means in business terms, in one sentence a developer would accept. */
  readonly businessDefinition: string;
  readonly kind: MetricKind;
  /** How it is computed, in words. The SQL implements this, never the reverse. */
  readonly calculation: string;
  readonly numerator: string;
  /** Null only for raw counts, which are the sole metrics allowed no denominator. */
  readonly denominator: string | null;
  /** What is deliberately left out, and why. */
  readonly exclusions: readonly string[];
  readonly dimensions: readonly Dimension[];
  /** The window the metric is meaningful over. */
  readonly timeWindow: "period" | "trailing_28d" | "trailing_90d" | "all_time" | "point_in_time";

  readonly requiredFacts: readonly FactId[];
  readonly requiredCrmFields: readonly string[];
  readonly requiredUnitAttributes: readonly string[];

  /** Below this, the UI shows the insufficient state instead of a verdict. */
  readonly minimumSampleSize: number;
  readonly comparison: ComparisonMethod;
  /** The strongest claim this metric supports. */
  readonly evidenceTier: EvidenceTier;
  /** Present exactly when the metric attributes an outcome to a channel. */
  readonly attribution?: AttributionRule;

  readonly states: MetricStates;
  /** Where clicking the number goes. Every metric drills somewhere. */
  readonly drillTo: "meetings" | "contacts" | "units" | "timeline" | "deals" | "segments";
  readonly roles: readonly Role[];
}

/**
 * Declares a metric. Exists so the registry files read as data and so that
 * validation has one place to live.
 */
export function defineMetric<const T extends MetricDefinition>(definition: T): T {
  return definition;
}

/** Structural rules every metric must satisfy. Enforced by test, not by review. */
export function validateMetric(m: MetricDefinition): readonly string[] {
  const problems: string[] = [];

  if (m.kind !== "count" && m.kind !== "list" && m.denominator === null) {
    problems.push(`${m.id}: only counts and lists may omit a denominator`);
  }
  if (m.evidenceTier === "causal_claim") {
    problems.push(`${m.id}: Observer does not produce causal claims`);
  }
  if (m.evidenceTier === "attributed_conversion" && m.attribution === undefined) {
    problems.push(`${m.id}: an attributed metric must state its attribution rule`);
  }
  if (m.evidenceTier !== "attributed_conversion" && m.attribution !== undefined) {
    problems.push(`${m.id}: only attributed metrics may carry an attribution rule`);
  }
  if (m.requiredFacts.length === 0) {
    problems.push(`${m.id}: a metric with no required facts cannot be implemented`);
  }
  if (m.minimumSampleSize < 1) {
    problems.push(`${m.id}: minimum sample size must be at least 1`);
  }
  if (m.roles.length === 0) {
    problems.push(`${m.id}: a metric nobody may see should not exist`);
  }
  return problems;
}
