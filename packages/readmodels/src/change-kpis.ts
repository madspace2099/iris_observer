import type { InsightSource } from "@observer/contracts";

/**
 * WHAT CHANGED, AS A SCREEN OF FIGURES (ADR-0060, the owner, 2026-10-22).
 *
 * Sales Flow's "What changed since …" block was three small cards of deltas.
 * The owner found them lost and asked for them as important figures on a
 * screen of their own, with more of what the showroom measures beside them,
 * each with an arrow against the same figure computed seven calendar days
 * earlier: today's window, and the same length of window ending seven days
 * before it.
 *
 * Every figure is a median or a share of the window's meetings, stated with
 * its sample; an arrow needs both windows at the floor, and a refused
 * comparison is said once for the screen rather than under every figure.
 */
export interface ChangeKpisView {
  /** The figures, the three that stood here first leading. Empty exactly when `empty` is set. */
  readonly kpis: readonly ChangeKpi[];
  /** One sentence when the window holds no meeting: there is then no figure at all. */
  readonly empty: string | null;
  /** What every arrow is set against, its dates and its meetings. */
  readonly basis: string;
  /**
   * Why no figure carries an arrow, said once: the policy refusal, or a window
   * short of the floor. Null when the arrows are drawn.
   */
  readonly withheld: string | null;
  /** The meetings in each window, and the floor an arrow needs in both. */
  readonly meetings: number;
  readonly earlierMeetings: number;
  readonly minimumSample: number;
  readonly sources: readonly InsightSource[];
}

export interface ChangeKpi {
  readonly id: string;
  /** The registry's id for it (`packages/metrics`). */
  readonly metricId: string;
  readonly label: string;
  /** The figure as read: "38%", "11m 05s", "Residences"; "—" when below the floor for a name. */
  readonly display: string;
  /** A section's name rather than a number: set smaller, so a long name wraps rather than overflows. */
  readonly isName: boolean;
  /** Its sample and denominator, in view: "57 of 150 meetings", "median of 150 meetings". */
  readonly sample: string;
  /** Set when this window's own sample is under the floor: the figure is raw, and how far short it is. */
  readonly short: string | null;
  /** What it is and how it is computed. Behind the `i`. */
  readonly definition: string;
  /** Null when the view's `withheld` says why no figure has one. */
  readonly trend: ChangeKpiTrend | null;
  /** Where to look at it, before the period is added; null where no surface shows it. */
  readonly href: string | null;
}

export interface ChangeKpiTrend {
  /**
   * The arrow. Null when there is none: this figure's sample is short in one of
   * the windows (the display says how), or the figure is a name, which does not
   * rise or fall.
   */
  readonly direction: "up" | "down" | "flat" | null;
  /** The arrow's colour: good and bad where more is plainly better, neutral where it is not. */
  readonly tone: "good" | "bad" | "neutral";
  /** In view beside the arrow: "from 34% 7 days ago", "no change, 37% 7 days ago". */
  readonly display: string;
  /** The same, said whole for a screen reader: "Up from 34% 7 days ago." */
  readonly spoken: string;
}
