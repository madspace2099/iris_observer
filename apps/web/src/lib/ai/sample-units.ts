/**
 * WHAT EACH ANALYSIS'S SAMPLE COUNTS.
 *
 * An evidence bundle carries a sample size and no unit, and the contract that
 * shapes it is frozen; "32 meetings" under the sales analysis was 32 dated
 * sales. The unit is the analysis's own, so it is looked up by the analysis
 * that produced the sample: meetings, unless that analysis counts something
 * else. Shared by the server's headline and the browser's evidence links, so
 * the two cannot name the same count differently.
 */
const UNITS: Readonly<Record<string, readonly [one: string, many: string]>> = {
  analyze_iris_assisted_sales: ["dated sale", "dated sales"],
  prepare_meeting: ["unit looked at", "units looked at"],
};

export function sampleWords(tool: string, n: number): string {
  const [one, many] = UNITS[tool] ?? ["meeting", "meetings"];
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

/** The analysis behind an evidence bundle: `bundlesFor` mints each id as `ev_<n>_<tool>`. */
export function toolOfBundle(bundleId: string): string {
  return bundleId.replace(/^ev_\d+_/, "");
}
