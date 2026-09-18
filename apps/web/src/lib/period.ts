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

/**
 * The presets, with the words the reader sees.
 *
 * Beside the presets themselves so a period can never be offered under one
 * name and computed under another.
 */
export const PERIOD_LABELS = [
  ["quarter_to_date", "Quarter to date"],
  ["last_28_days", "Last 28 days"],
  ["last_quarter", "Last completed quarter"],
  ["year_to_date", "Year to date"],
] as const satisfies readonly (readonly [PeriodPreset, string])[];

/**
 * Carries the selected period across a link.
 *
 * Navigation dropped it: choosing "Last 28 days" and then opening Project
 * silently returned to the quarter, so the reader compared two screens that
 * were measuring different spans without being told.
 */
export function withPeriod(href: string, preset: PeriodPreset): string {
  if (preset === "quarter_to_date") return href;
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query ?? "");
  params.set("period", preset);
  return `${path}?${params.toString()}`;
}
