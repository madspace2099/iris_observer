import type { EvidenceId, EvidenceTier } from "@observer/contracts";

/**
 * A metric, resolved for display.
 *
 * Formatting happens here, not in the component. Currency, percentages,
 * percentiles and thousands separators all depend on the project's locale and
 * currency, and a component that formats is a component that will format
 * differently on the next screen. Components receive strings to render and a
 * state to render them in.
 */

export const METRIC_STATES = [
  /** A real value the reader may act on. */
  "ok",
  /** Genuinely zero, and that is the answer. */
  "empty",
  /** Below the minimum sample. A figure exists but is not a verdict. */
  "insufficient",
  /** A required source is not connected, so the number cannot exist. */
  "unavailable",
  /** Something failed. Never silently rendered as zero. */
  "error",
] as const;
export type MetricState = (typeof METRIC_STATES)[number];

/** Which direction is good. A falling time-to-close is an improvement. */
export type Better = "up" | "down" | "neither";

export interface MetricComparison {
  /** What it is compared against, in words. Always displayed. */
  readonly baselineLabel: string;
  /** Formatted delta, e.g. "+18%" or "−4 days". */
  readonly deltaDisplay: string;
  readonly direction: "up" | "down" | "flat";
  readonly better: Better;
  /**
   * Set when the comparison is refused rather than computed — for instance
   * because the attribution policy version changed between the two periods.
   * A refused comparison is stated, never silently omitted.
   */
  readonly refusedReason: string | null;
}

export interface EvidenceRef {
  readonly evidenceId: EvidenceId;
  readonly tier: EvidenceTier;
  /** Where clicking goes. Already resolved to a route by the read model. */
  readonly href: string;
  /** How many underlying records. The honest denominator for the reader. */
  readonly observationCount: number;
}

export interface MetricValue {
  readonly metricId: string;
  readonly label: string;
  readonly state: MetricState;
  /** Formatted for display. Null in every state except `ok` and `insufficient`. */
  readonly display: string | null;
  /** The raw number, for charts. Never formatted by a component. */
  readonly raw: number | null;
  /** Short unit or qualifier shown beside the figure, e.g. "of 96". */
  readonly qualifier: string | null;
  readonly sampleSize: number | null;
  readonly minimumSampleSize: number;
  readonly comparison: MetricComparison | null;
  /**
   * What to say when the state is not `ok`. Comes from the metric registry, so
   * the same absence reads identically everywhere it appears.
   */
  readonly message: string | null;
  readonly evidence: EvidenceRef | null;
  /** Where the number drills to. Every metric drills somewhere. */
  readonly drillHref: string | null;
  /** Policy version in force, where one governs this figure. */
  readonly policyVersion: string | null;
}

/* --- composed shapes ----------------------------------------------------- */

export type VerdictState = "good" | "watch" | "weak" | "unknown";

/**
 * The ten-second answer.
 *
 * `headline` carries the number inside the sentence, because a verdict without
 * its figure is an opinion. `supporting` says what to do about it or what
 * caused it — never both, and never more than one sentence.
 */
export interface Verdict {
  readonly state: VerdictState;
  readonly headline: string;
  readonly supporting: string;
  readonly evidence: EvidenceRef | null;
}

export interface FunnelStep {
  readonly label: string;
  readonly metric: MetricValue;
  /** Absolute counts either side, so the rate is readable as a fraction. */
  readonly fromCount: number | null;
  readonly toCount: number | null;
}

export const ALERT_SEVERITIES = ["critical", "warning", "info"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface AlertItem {
  readonly id: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly detail: string;
  readonly evidence: EvidenceRef | null;
  readonly actionLabel: string | null;
  readonly actionHref: string | null;
}

export interface ChangeItem {
  readonly id: string;
  readonly label: string;
  readonly deltaDisplay: string;
  readonly direction: "up" | "down";
  readonly better: Better;
  readonly detail: string;
  readonly evidence: EvidenceRef | null;
  readonly href: string | null;
}

/**
 * A generated summary.
 *
 * `statements` are individually evidenced, so the reader can check any single
 * sentence rather than having to trust or reject the paragraph as a whole.
 * `tier` on each statement lets an association be styled differently from an
 * observation without dereferencing anything.
 */
export interface BriefingStatement {
  readonly text: string;
  readonly tier: EvidenceTier;
  readonly evidence: EvidenceRef | null;
}

export interface AiBriefing {
  readonly heading: string;
  readonly statements: readonly BriefingStatement[];
  /** Model and prompt version, so an odd summary can be reproduced. */
  readonly generatorVersion: string;
  readonly generatedAt: string;
  /** Present when some input was missing when the summary was written. */
  readonly caveat: string | null;
}

export interface ActionItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly href: string;
  /** Actions the viewer's role may not take are not returned at all. */
  readonly emphasis: "primary" | "secondary";
}

export interface DataHealth {
  readonly completeness: MetricValue;
  readonly sourcesPresent: readonly string[];
  readonly sourcesMissing: readonly string[];
  readonly note: string | null;
}
