import type { PeriodPreset } from "@observer/readmodels";

/**
 * The period, resolved from the URL.
 *
 * One helper rather than a copy in every page: an unrecognised value falls back
 * to the default rather than throwing, because a stale link in someone's notes
 * should show them the current quarter, not an error.
 */
export const PRESETS: readonly PeriodPreset[] = [
  "quarter_to_date",
  "last_28_days",
  "last_quarter",
  "year_to_date",
];

export function presetFrom(value: string | undefined): PeriodPreset {
  return PRESETS.includes(value as PeriodPreset) ? (value as PeriodPreset) : "quarter_to_date";
}
