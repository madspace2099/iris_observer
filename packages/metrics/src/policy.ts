/**
 * Versioned measurement policies.
 *
 * A policy is a decision that changes what a number means. Changing one
 * silently makes today's figure incomparable with last quarter's while looking
 * identical, which is the most dangerous failure an analytics product has —
 * nobody notices, and the wrong conclusion is drawn confidently.
 *
 * So every policy is versioned, dated, and reported alongside the numbers it
 * produced. Comparisons across incompatible policy versions are refused rather
 * than quietly performed.
 */

/** Who may change a policy value. Never a dashboard user, at any role. */
export const POLICY_AUTHORITY = "madspace_admin" as const;

export interface PolicyMeta {
  /** Semantic version of the policy itself, not of the code. */
  readonly version: string;
  /** From when this version applies. Facts before it keep the earlier version. */
  readonly effectiveFrom: string;
  /** Tenant it applies to, or null for the product default. */
  readonly tenantId: string | null;
}

/* --- attribution --------------------------------------------------------- */

export const QUALIFYING_LINKS = ["deterministic_only", "deterministic_or_verified"] as const;
export type QualifyingLink = (typeof QUALIFYING_LINKS)[number];

export const TOUCH_MODELS = ["first_touch", "last_touch", "both_reported"] as const;
export type TouchModel = (typeof TOUCH_MODELS)[number];

export interface AttributionPolicy extends PolicyMeta {
  /** Maximum days between the online touch and the outcome. */
  readonly windowDays: number;
  /** The identity link strong enough to count. */
  readonly qualifyingLink: QualifyingLink;
  /** Which touch receives credit. Both are always reported together. */
  readonly touchModel: TouchModel;
  /** How a booking with no online history is handled. */
  readonly directBookingTreatment: "separate_bucket" | "excluded";
  /** What to do when a source was disconnected for part of the period. */
  readonly missingSourceTreatment: "report_as_unknown" | "exclude_period";
}

/**
 * The product default.
 *
 * Ninety days is measured against the observed sales cycle rather than taken
 * from web analytics convention: buying a home takes months, and a thirty-day
 * window would discard most genuinely online-originated sales.
 *
 * MADSPACE administrators may override this per tenant. Dashboard users of any
 * role may not — an attribution window a viewer can change is a window that
 * means nothing, because two people looking at the same screen would disagree
 * about what they are seeing.
 */
export const DEFAULT_ATTRIBUTION_POLICY: AttributionPolicy = {
  version: "1.0.0",
  effectiveFrom: "2026-01-01T00:00:00.000+00:00",
  tenantId: null,
  windowDays: 90,
  qualifyingLink: "deterministic_only",
  touchModel: "both_reported",
  directBookingTreatment: "separate_bucket",
  missingSourceTreatment: "report_as_unknown",
};

/**
 * Whether two results may be compared.
 *
 * Only the window and the qualifying link change what is counted; the touch
 * model and the reporting treatments change how it is presented. Comparing
 * across a window change is meaningless, so it is refused.
 */
export function policiesComparable(a: AttributionPolicy, b: AttributionPolicy): boolean {
  return a.windowDays === b.windowDays && a.qualifyingLink === b.qualifyingLink;
}

/** Why a comparison was refused, for display. Null when it is allowed. */
export function comparisonRefusalReason(a: AttributionPolicy, b: AttributionPolicy): string | null {
  if (policiesComparable(a, b)) return null;
  if (a.windowDays !== b.windowDays) {
    return `Attribution window changed from ${b.windowDays} to ${a.windowDays} days between these periods.`;
  }
  return `Qualifying identity link changed from ${b.qualifyingLink} to ${a.qualifyingLink} between these periods.`;
}

/* --- meaningful dwell ---------------------------------------------------- */

/**
 * The threshold that separates looking at a unit from scrolling past it.
 *
 * **Never applied during ingestion.** Raw active duration is always retained,
 * and the threshold is applied when the metric is computed. That is what
 * allows the threshold to be revised — and revised retroactively — instead of
 * being baked irreversibly into the stored data, which is exactly the mistake
 * the legacy system made with its pre-aggregated counters.
 *
 * The two channels differ because the behaviour differs. Online, a buyer
 * scrolls a list alone and dismisses quickly. In the showroom an agent is
 * talking over the screen, so a unit stays up longer before it means anything.
 * Both figures are initial product settings, to be revisited against real data.
 */
export interface MeaningfulDwellPolicy extends PolicyMeta {
  readonly thresholdsMs: {
    readonly webiris: number;
    readonly showroom: number;
  };
  /** Time that must not be counted as active, whatever the source reports. */
  readonly excludes: readonly string[];
  /** Measurement methods weak enough that the threshold cannot be trusted. */
  readonly unreliableMethods: readonly string[];
}

export const DEFAULT_DWELL_POLICY: MeaningfulDwellPolicy = {
  version: "1.0.0",
  effectiveFrom: "2026-01-01T00:00:00.000+00:00",
  tenantId: null,
  thresholdsMs: {
    webiris: 10_000,
    showroom: 15_000,
  },
  excludes: [
    "hidden browser tabs",
    "backgrounded application time",
    "idle time with no interaction",
    "time after another unit became the active one",
  ],
  unreliableMethods: ["elapsed_wall_clock", "occurrence_only"],
};

export function meaningfulDwellThresholdMs(
  channel: "webiris" | "showroom",
  policy: MeaningfulDwellPolicy = DEFAULT_DWELL_POLICY,
): number {
  return policy.thresholdsMs[channel];
}

/**
 * Whether a raw duration counts as a meaningful view.
 *
 * Returns false for measurement methods the policy distrusts, rather than
 * applying the threshold to a number that does not mean what it appears to.
 * An ungated wall-clock duration of twelve seconds is not evidence of twelve
 * seconds of attention.
 */
export function isMeaningfulDwell(
  rawActiveDurationMs: number | null,
  channel: "webiris" | "showroom",
  measurementMethod: string,
  policy: MeaningfulDwellPolicy = DEFAULT_DWELL_POLICY,
): boolean {
  if (rawActiveDurationMs === null) return false;
  if (policy.unreliableMethods.includes(measurementMethod)) return false;
  return rawActiveDurationMs >= meaningfulDwellThresholdMs(channel, policy);
}
