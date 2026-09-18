import type { ReactNode } from "react";
import type { MetricComparison, MetricValue } from "@observer/readmodels";

/**
 * THE FIGURE. The single most load-bearing component in this layer.
 *
 * Everything the doctrine says about honesty passes through here, because every
 * number on every screen is a `MetricValue` and every `MetricValue` has a
 * `state`. If this file renders the five states indistinguishably then no
 * amount of care on the screens above it matters.
 *
 * ## The five states, and what each one is allowed to look like
 *
 *   ok            the figure, its denominator, and its comparison.
 *   empty         a real zero. The read model supplies `display: "0"` AND a
 *                 sentence; both are shown, because "0" with no words beside it
 *                 is the ambiguity the whole state machine exists to remove.
 *   insufficient  the figure at full size in secondary ink, the shortfall
 *                 beside it, and NO comparison — see below.
 *   unavailable   the missing mark and one word. The REASON belongs to the
 *                 region, not to the figure; see `Absence.tsx`.
 *   error         the missing mark and a different word, so a failed read and
 *                 a disconnected source are not the same shape.
 *
 * ## Why `insufficient` drops the comparison here as well as upstream
 *
 * `format.ts` already nulls `comparison` when it builds an insufficient value,
 * so the branch below is belt and braces. It is written anyway because the rule
 * is "below the minimum sample there is no verdict, no rank and no trend", and
 * a rule that is enforced in exactly one place is a rule that survives until
 * somebody adds a second producer of `MetricValue`. The `.ox-insufficient`
 * treatment cannot render a delta because this file never passes it one.
 *
 * ## Why nothing here formats a number
 *
 * Currency, percentages, percentiles and thousands separators all depend on the
 * project's locale and currency, which `ProjectSummary` carries and this layer
 * does not. `MetricValue.display` is already formatted; `raw` exists for charts
 * and is never rendered. A component that formatted would format differently on
 * the next screen, and a reader comparing two screens would be reading two
 * conventions. (ADR-0012: no component computes a metric.)
 *
 * ## Why the baseline is not printed beside every delta
 *
 * "Down 18%" against an unstated baseline is not information — but the baseline
 * is the SAME sentence for every figure on the screen, and the shell's context
 * band already states the period and what it is compared against. Repeating it
 * beside twelve figures is the defect the visual autopsy recorded for
 * unavailable sources, in a different costume. So `baselineLabel` is carried on
 * the delta as its `title` and to a screen reader, and the screen states it once
 * where the reader is looking when they ask.
 */

/**
 * The comparison, and the one place this file disagrees with the stylesheet.
 *
 * `observer-product.css` §8 paints `data-direction="up"` in the good colour and
 * `data-direction="down"` in the poor one. That mapping is correct exactly when
 * `better === "up"` — more meetings, more coverage, more verified interest.
 *
 * It is WRONG when `better === "down"`. A falling median time-to-close is an
 * improvement, and the sheet would paint it red with a downward triangle. There
 * is no class in the system for "moved the good way, downwards", and inventing
 * one is not this layer's to do.
 *
 * So the attribute is emitted only where the sheet's own reading is true, and
 * omitted otherwise. An omitted `data-direction` loses the glyph and the hue and
 * leaves the delta in quiet ink — but `deltaDisplay` already carries its own
 * sign ("+18%", "−4 days"), so nothing on screen becomes false. Losing a glyph
 * is a smaller cost than printing a red improvement, and the gap is reported
 * rather than papered over.
 */
function Delta({ comparison }: { readonly comparison: MetricComparison }) {
  /*
   * A refused comparison is stated, never silently dropped. `refusedReason` is
   * set when the two periods are not comparable — an attribution policy changed
   * between them, say — and a screen that simply omitted the delta would let the
   * reader assume nothing moved.
   */
  if (comparison.refusedReason !== null) {
    return <span className="ox-delta">{comparison.refusedReason}</span>;
  }

  const paintable = comparison.better === "up" && comparison.direction !== "flat";

  return (
    <span
      className="ox-delta"
      {...(paintable ? { "data-direction": comparison.direction } : {})}
      title={`against ${comparison.baselineLabel}`}
    >
      {comparison.deltaDisplay}
      <span className="ox-sr"> against {comparison.baselineLabel}</span>
    </span>
  );
}

/**
 * One resolved metric, in whichever of its five states it arrived in.
 *
 * Always returns exactly one element, so it drops into a `<dd>`, a `<td>` or any
 * of the sheet's baseline-aligned rows without the caller knowing which state
 * came back.
 */
export function Figure({ value }: { readonly value: MetricValue }) {
  switch (value.state) {
    case "ok":
      return (
        <span className="ox-value">
          <span className="ox-figure">{value.display}</span>
          {value.qualifier === null ? null : <span className="ox-of">{value.qualifier}</span>}
          {value.comparison === null ? null : <Delta comparison={value.comparison} />}
        </span>
      );

    case "empty":
      /*
       * A real zero is an answer and is drawn as one: full size, full weight, no
       * missing mark. The sentence beside it is the read model's, and it is what
       * stops the reader asking whether the pipeline is broken.
       *
       * The fallback matters. If a producer ever emits `empty` with neither a
       * display nor a message there is nothing honest to draw, and drawing "0"
       * from nothing would be this component inventing the very figure it exists
       * to protect. It falls through to the missing treatment instead.
       */
      if (value.display === null && value.message === null) break;
      return (
        <span className="ox-value">
          {value.display === null ? null : <span className="ox-figure">{value.display}</span>}
          {value.message === null ? null : <span className="ox-of">{value.message}</span>}
        </span>
      );

    case "insufficient": {
      const shortfall =
        value.message ??
        (value.sampleSize === null
          ? `below the minimum of ${value.minimumSampleSize}`
          : `${value.sampleSize} of ${value.minimumSampleSize} needed`);
      return (
        <span className="ox-insufficient">
          <span className="ox-figure">{value.display}</span>
          <span className="ox-shortfall">{shortfall}</span>
        </span>
      );
    }

    case "unavailable":
      /*
       * One word, and the reason carried only on hover. The band that states the
       * reason in full belongs to the region — `Unavailable` in `Absence.tsx` —
       * because four figures each repeating "the CRM is not connected" is the
       * defect recorded in `docs/12-visual-autopsy.md` §9.
       */
      return (
        <span className="ox-value" data-missing="true" {...titleOf(value.message)}>
          Unavailable
        </span>
      );

    case "error":
      /*
       * A different word from `unavailable`, deliberately. The two share the
       * missing treatment because both are "there is no number here", and they
       * must still be tellable apart: one is a source nobody has connected, the
       * other is a read that failed and might succeed on the next request.
       */
      return (
        <span className="ox-value" data-missing="true" {...titleOf(value.message)}>
          {value.message ?? "Did not load"}
        </span>
      );
  }

  return (
    <span className="ox-value" data-missing="true">
      Not recorded
    </span>
  );
}

/** `title` only when there is something to say. An empty tooltip is noise. */
function titleOf(message: string | null): { title?: string } {
  return message === null ? {} : { title: message };
}

/**
 * The figure grid.
 *
 * A `<dl>` because each cell is a term and its value, and because the sheet's
 * whole cell treatment — the two-line label reservation that keeps a row of
 * figures on one baseline, and the reset of the browser's 40px `dd` indent that
 * had silently pushed every figure out of line with its own label — is written
 * against `dt` and `dd`.
 *
 * It is NOT a row of KPI cards. It has no borders between cards, no elevation
 * and no repetition of an icon: it is one plane divided by hairlines, which is
 * what `docs/12-visual-autopsy.md` chose over the rejected card stack.
 */
export function Tally({ children }: { readonly children: ReactNode }) {
  return <dl className="ox-tally">{children}</dl>;
}

/**
 * One cell of the tally.
 *
 * `value`, `delta` and `evidence` are nodes rather than a `MetricValue` and an
 * `EvidenceRef`, which is a deliberate narrowing of what this component knows.
 * The usual call is
 *
 *     <TallyItem
 *       label={metric.label}
 *       value={<Figure value={metric} />}
 *       evidence={<Evidence evidence={metric.evidence} period={period} />}
 *     />
 *
 * and the alternative — taking the read-model shapes directly — would drag the
 * period, the router and `withPeriod` into a component whose whole job is a
 * `<dt>` and a `<dd>`. It would also make the tally the only place a figure can
 * be drawn; as nodes, a cell can hold a figure, a chip, a sparkline or a
 * sentence, which is what the surfaces above actually need.
 *
 * `delta` is separate from `value` for the cells that are not metrics at all —
 * a count from a read model that carries its own movement — and is normally
 * left out, because `Figure` already draws the comparison a `MetricValue`
 * carries.
 */
export function TallyItem({
  label,
  value,
  delta = null,
  evidence = null,
}: {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly delta?: ReactNode;
  readonly evidence?: ReactNode;
}) {
  return (
    <div className="ox-tally-item">
      <dt>{label}</dt>
      <dd>
        {value}
        {delta}
        {evidence}
      </dd>
    </div>
  );
}
