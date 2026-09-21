import Link from "next/link";
import { DATA_SOURCE_MARKERS, type PeriodPreset } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

/**
 * THE FOUR ABSENCES, AND THE FIFTH STATEMENT THAT IS NOT ONE.
 *
 * `docs/12-visual-autopsy.md` and `observer-product.css` §21 make the same
 * argument from two directions: a screen that renders every kind of nothing the
 * same way has told the reader nothing about which kind of nothing it is, and
 * the four kinds call for four different decisions.
 *
 *   EMPTY        genuinely zero, and that is the answer. The project ran, the
 *                thing did not happen. Nothing is broken and nothing is
 *                missing. {@link Empty}
 *   INSUFFICIENT the figure exists but is below its minimum sample, so it is
 *                not a verdict. Rendered by `Figure` in `Metric.tsx` rather
 *                than here, because it is a treatment OF a number and the other
 *                three are treatments INSTEAD of one.
 *   UNAVAILABLE  a source is not connected, so the number cannot exist at all.
 *                {@link Unavailable}
 *   ERROR        the read failed. Never a reading of nothing. {@link Failure}
 *
 * ## Why `Unavailable` takes a region and not a figure
 *
 * The visual autopsy records the exact defect this shape prevents: four panels
 * in one viewport each repeating "The CRM is not connected". The reason is
 * stated ONCE for a region, with ONE action, and the individual figures inside
 * that region carry only the terse missing mark `Figure` draws. So this
 * component is deliberately awkward to use per figure — it is a band, not a
 * badge — and `what` is phrased as a region ("Conversion figures") rather than
 * as a metric.
 *
 * ## Why `Empty` and a missing panel look different
 *
 * `.ox-empty` is a dashed slot: it reads as "there is nothing in this space".
 * That is right for a genuine zero on a surface that would otherwise be blank,
 * and it is wrong for a finding of nothing — "no unit needs attention" is a
 * result, and a result belongs on `.ox-result`, which `Attention.tsx` and
 * `Finding.tsx` draw. The two must not be swapped: a dashed slot where a result
 * belongs makes a working screen look unfinished.
 */

/**
 * Genuinely zero, stated as an answer.
 *
 * `note` is required. A bare "No meetings" leaves the reader unable to tell
 * whether that is surprising, and the note is where the read model's own words
 * about the period and the scope go.
 */
export function Empty({ title, note }: { readonly title: string; readonly note: string }) {
  return (
    <div className="ox-empty">
      <p className="ox-empty-title">{title}</p>
      <p className="ox-empty-note">{note}</p>
    </div>
  );
}

/**
 * A source is not connected, so a region of figures cannot exist.
 *
 * Three parts and all three are required, because each answers a question the
 * reader will otherwise ask out loud: `what` cannot be shown, `why` it cannot,
 * and the one thing that would change that. The action is optional only in the
 * sense that some regions genuinely have nowhere to send a reader — a developer
 * looking at a project whose CRM is the agency's cannot connect it themselves —
 * and in that case no control is drawn at all rather than a dead one.
 */
export function Unavailable({
  what,
  why,
  action = null,
  period,
}: {
  readonly what: string;
  readonly why: string;
  readonly action?: { readonly label: string; readonly href: string } | null;
  readonly period: PeriodPreset;
}) {
  return (
    <div className="ox-unavailable">
      <span>
        {what} — {why}
      </span>
      {action === null ? null : (
        <Link className="ox-btn" href={dynamicRoute(withPeriod(action.href, period))}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * The read failed.
 *
 * Two sentences, and the second one is the point. A reader who sees an empty
 * region assumes the answer is nothing; the second sentence takes that reading
 * away, because a figure that failed to load and a figure that is zero would
 * lead to opposite decisions.
 *
 * `retry` is a plain link rather than a button on purpose. Re-requesting a
 * server-rendered surface is a navigation, so a link does it without a line of
 * script and survives with JavaScript disabled — and a button that needed a
 * handler this layer cannot provide would be exactly the control-that-does-
 * nothing the doctrine forbids.
 */
export function Failure({
  what,
  retry = null,
  period,
}: {
  readonly what: string;
  readonly retry?: { readonly label: string; readonly href: string } | null;
  readonly period: PeriodPreset;
}) {
  return (
    <div className="ox-error">
      <span>{what} could not be loaded.</span>
      <span>
        This is a failure to read the data, not a reading of nothing. Whatever this region would
        have shown is unknown rather than zero.
      </span>
      {retry === null ? null : (
        <span>
          <Link className="ox-btn" href={dynamicRoute(withPeriod(retry.href, period))}>
            {retry.label}
          </Link>
        </span>
      )}
    </div>
  );
}

/**
 * The demonstration-data statement.
 *
 * Not an absence, and kept in this file because it belongs to the same
 * discipline: it is the one honesty marker that has to appear whether or not
 * anything is missing. Every figure in this build is generated by the
 * deterministic synthetic repository, and a reader who mistook them for their
 * own project's numbers would make decisions on them.
 *
 * Two words on screen, the whole phrase to a screen reader and on hover. The
 * short form is not a shorter claim — it is the same claim at a width that does
 * not wrap a header bar into three lines, which is what "Synthetic
 * demonstration data" did to the small-desktop layout the first time.
 */
export function Synthetic() {
  /*
   * Two markers; the project layout's `data-sessions` shows one. `SyntheticBadge`
   * draws the same two in the shell's own idiom — a loud amber pill against this
   * quiet chip — and the WORDS now come from one place so the two treatments
   * cannot end up making two different claims about one project.
   */
  return (
    <>
      <span className="ox-synthetic obs-when-synthetic" title={DATA_SOURCE_MARKERS.synthetic.full}>
        <span className="ox-sr">{DATA_SOURCE_MARKERS.synthetic.full}</span>
        <span aria-hidden="true">{DATA_SOURCE_MARKERS.synthetic.short}</span>
      </span>
      <span className="ox-synthetic obs-when-delivered" title={DATA_SOURCE_MARKERS.delivered.full}>
        <span className="ox-sr">{DATA_SOURCE_MARKERS.delivered.full}</span>
        <span aria-hidden="true">{DATA_SOURCE_MARKERS.delivered.short}</span>
      </span>
    </>
  );
}
