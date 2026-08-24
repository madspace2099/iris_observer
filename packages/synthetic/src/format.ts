import type { EvidenceRef, MetricValue, MetricComparison } from "@observer/readmodels";
import { EvidenceIdSchema, type EvidenceTier } from "@observer/contracts";

/**
 * Formatting, done once, in the repository.
 *
 * Currency, percentages and thousands separators depend on the project's
 * locale and currency. A component that formats is a component that will
 * format differently on the next screen, and two screens disagreeing about
 * what "€214,000" looks like is the small kind of wrong that makes a product
 * feel unfinished.
 */

export function money(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function compactMoney(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function percent(value: number, locale: string, digits = 0): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(value);
}

export function count(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * A signed delta with a true minus sign rather than a hyphen.
 *
 * A value that rounds away to nothing is reported as no change. "−0%" is
 * arithmetically defensible and reads as a mistake, and a reader who sees it
 * beside a real figure starts distrusting both.
 */
export function signedPercent(value: number, locale: string): string {
  const formatted = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
  if (formatted.replace(/[^0-9]/g, "") === "0") return "no change";
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return "no change";
}

/**
 * A movement and the words for it, produced together.
 *
 * The two were computed separately once and disagreed: a change that rounded to
 * "no change" was still drawn with a downward arrow. Anything that reads as no
 * change is flat, by construction, because the direction is derived from the
 * text rather than from the raw number the text has already rounded away.
 */
export function movement(
  delta: number,
  locale: string,
): { direction: "up" | "down" | "flat"; deltaDisplay: string } {
  const deltaDisplay = signedPercent(delta, locale);
  if (deltaDisplay === "no change") return { direction: "flat", deltaDisplay };
  return { direction: delta > 0 ? "up" : "down", deltaDisplay };
}

export function days(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}

/* --- builders -------------------------------------------------------------- */

/**
 * Evidence identifiers are derived from the reference itself rather than from
 * a counter, so the same evidence produces the same id on every run. A
 * deterministic demo whose ids shuffle between renders cannot be asserted on.
 */
export function evidenceRef(
  seed: string,
  tier: EvidenceTier,
  href: string,
  observationCount: number,
): EvidenceRef {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const suffix = hash.toString(16).padStart(8, "0").slice(0, 8);
  return {
    evidenceId: EvidenceIdSchema.parse(`evd_${suffix}${seed.length.toString(16).padStart(2, "0")}`),
    tier,
    href,
    observationCount,
  };
}

export function comparison(
  baselineLabel: string,
  deltaDisplay: string,
  direction: MetricComparison["direction"],
  better: MetricComparison["better"],
  refusedReason: string | null = null,
): MetricComparison {
  return { baselineLabel, deltaDisplay, direction, better, refusedReason };
}

export interface MetricValueInput {
  readonly metricId: string;
  readonly label: string;
  readonly display?: string;
  readonly raw?: number;
  readonly qualifier?: string;
  readonly sampleSize?: number;
  readonly minimumSampleSize: number;
  readonly comparison?: MetricComparison;
  readonly evidence?: EvidenceRef;
  readonly drillHref?: string;
  readonly policyVersion?: string;
}

/** A metric that has a real value to show. */
export function ok(input: MetricValueInput): MetricValue {
  return {
    metricId: input.metricId,
    label: input.label,
    state: "ok",
    display: input.display ?? null,
    raw: input.raw ?? null,
    qualifier: input.qualifier ?? null,
    sampleSize: input.sampleSize ?? null,
    minimumSampleSize: input.minimumSampleSize,
    comparison: input.comparison ?? null,
    message: null,
    evidence: input.evidence ?? null,
    drillHref: input.drillHref ?? null,
    policyVersion: input.policyVersion ?? null,
  };
}

/**
 * A figure that exists but is below its minimum sample.
 *
 * The number is still shown — hiding it would be patronising — but the state
 * tells the component to render it without a verdict, a rank or a trend.
 */
export function insufficient(input: MetricValueInput, message: string): MetricValue {
  return { ...ok(input), state: "insufficient", comparison: null, message };
}

/** A required source is not connected, so the number cannot exist at all. */
export function unavailable(
  metricId: string,
  label: string,
  minimumSampleSize: number,
  message: string,
): MetricValue {
  return {
    metricId,
    label,
    state: "unavailable",
    display: null,
    raw: null,
    qualifier: null,
    sampleSize: null,
    minimumSampleSize,
    comparison: null,
    message,
    evidence: null,
    drillHref: null,
    policyVersion: null,
  };
}

/** Genuinely zero, which is a real answer and not an absence. */
export function empty(
  metricId: string,
  label: string,
  minimumSampleSize: number,
  message: string,
): MetricValue {
  return {
    ...unavailable(metricId, label, minimumSampleSize, message),
    state: "empty",
    display: "0",
    raw: 0,
  };
}
