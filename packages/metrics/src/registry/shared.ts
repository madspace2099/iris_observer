/**
 * State strings shared across registry files.
 *
 * Centralised because these sentences are what a user reads when a number is
 * absent, and three slightly different phrasings of "the CRM is not connected"
 * across three screens reads as three different problems.
 */
export const NO_CRM = "The CRM is not connected, so outcomes below the meeting are unknown.";
export const NO_WEBIRIS = "WEBIRIS data is not connected for this project.";
export const NO_SHOWROOM = "No showroom data has arrived for this project yet.";
export const NO_CATALOGUE = "The unit catalogue is not connected, so units cannot be segmented.";
export const NO_MEETINGS = "No meetings in this period.";
export const NOT_ENOUGH = "Not enough data yet to read this as a trend.";

/** Below this many meetings, no agent or agency figure is presented as a verdict. */
export const AGENT_MIN_SAMPLE = 20;

/** Below this many observations, no unit-level trend is presented as a verdict. */
export const UNIT_MIN_SAMPLE = 10;

export function insufficient(n: number, noun: string): string {
  return `Fewer than ${n} ${noun} — shown as a raw figure, not as a verdict.`;
}
