/**
 * The Ask ceilings the browser suite runs under.
 *
 * ## Why this is a module and not two numbers
 *
 * The burst test proves that a flood of questions is stopped. It fired fifteen
 * at once, which was comfortably over the ceiling of ten it was written
 * against. The suite later raised the per-minute ceiling to thirty so that one
 * project's burst could not starve the other two — and from that moment fifteen
 * requests were under the limit, every one of them returned 200, and the test
 * that proves the limiter works could no longer fail for the right reason.
 *
 * It did still fail, for a different reason, which is the only thing that kept
 * the drift visible at all.
 *
 * So the ceiling and the burst are declared together, here, and the burst is
 * derived from the ceiling. Raising one raises the other, and a test that
 * asserts a limit is reached cannot be quietly disarmed by the configuration
 * that sets the limit.
 */

/**
 * High enough that ordinary tests never reach it, low enough that the burst
 * test still proves the limiter works.
 *
 * One server process serves all three viewport projects, and the Ask limiter is
 * per-instance by design (ADR-0026), so a burst in one project spends the
 * allowance of the other two.
 *
 * Thirty was enough until a suite arrived that spends a monthly budget to prove
 * it is enforced: `models-and-budget.spec.ts` legitimately asks dozens of
 * questions inside a minute, and at thirty the limiter answered some of them —
 * which arrives as a refusal with no reason attached and reads exactly like a
 * budget rule misfiring. Raised so ordinary tests stay clear of it, and the
 * burst below stays clear of THEM.
 */
export const ASK_PER_MINUTE = 90;

export const ASK_PER_VIEWER_PER_DAY = 5000;
export const ASK_PER_INSTANCE_PER_DAY = 20000;
export const BREAKER_THRESHOLD = 500;

/**
 * How many requests a burst fires: enough to pass the ceiling, and no more.
 *
 * Ten over is a margin, not a hammer. A burst far larger than the limit would
 * pass whatever the limit became, which is the same failure as being under it —
 * a test that cannot tell you anything.
 */
export const BURST = ASK_PER_MINUTE + 10;
