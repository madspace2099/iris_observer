import type { CSSProperties, ReactNode } from "react";

/**
 * One entry in a chart's key.
 *
 * `swatch` is a CSS colour and it is applied inline, which is the one place in
 * this layer that happens. `.ox-legend-swatch` in `observer-product.css`
 * declares a size, a radius and `flex: none` and deliberately declares NO
 * background: a series colour is data — it arrives on `OutcomeComposition.keys`
 * from the read model — and the sheet cannot know it. Supplying it is feeding
 * the system rather than routing around it. It is reported as a gap all the
 * same, because a `--ox-swatch` custom property consumed by the sheet would say
 * the same thing without an inline declaration.
 *
 * A key entry with no swatch is legitimate and common: a note about what the
 * dashed edge or the empty cell means carries no colour at all.
 */
export interface ChartLegendItem {
  readonly label: string;
  readonly swatch?: string;
}

/**
 * THE CHART FRAME — what the picture measures, over what span, and in words.
 *
 * A chart with no period is a chart of nothing in particular, and a chart with
 * no definition is a shape the reader has to guess the meaning of. The frame
 * carries both so that the chart component itself only has to draw, which is
 * why every one of the hand-built charts in `@/showroom/charts` and
 * `@/showroom/charts2` is a bare SVG with no title of its own.
 *
 * Four of the six props are required and that is the whole point of the
 * component:
 *
 *   title    what is being counted.
 *   period   over what span. Comes from `context.period.label`, never from a
 *            control inside the chart — a screen where two panels carry their
 *            own period is a screen where two panels can silently measure
 *            different spans, and that defect has been fixed twice here.
 *   note     the metric definition. What counts as a "meaningful view", what
 *            the denominator is, what is excluded.
 *   summary  the accessible reading. See below.
 *
 * ## Why `summary` is required and why it is not `aria-label` on the plot
 *
 * A screen reader given an SVG gets a picture with no content. The obvious fix
 * is `role="img"` with a label on the plot wrapper, and it is wrong here for a
 * concrete reason: several of these charts draw links — `RankedBars` rows carry
 * an `href` — and `role="img"` prunes the subtree, so the links inside would
 * stop existing for exactly the readers who most need a text route to the same
 * place.
 *
 * So the summary is rendered as visually hidden prose in the frame, beside a
 * plot that keeps whatever accessible content its own SVG provides. It is
 * required rather than optional because an optional accessible summary is an
 * absent one: the charts that most need it are the ones whose author was in the
 * biggest hurry.
 *
 * ## Not a card
 *
 * `.ox-chart` is a plane with a hairline border and no elevation. There is
 * exactly one elevation in this system and it is on the dialog panel.
 */
export function ChartFrame({
  title,
  period,
  note,
  legend = [],
  summary,
  children,
}: {
  readonly title: string;
  /** The span the chart covers, in the reader's words. */
  readonly period: string;
  /** What the chart measures, precisely enough to argue with. */
  readonly note: string;
  readonly legend?: readonly ChartLegendItem[];
  /** What a reader who cannot see the plot is told instead. Required. */
  readonly summary: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="ox-chart">
      <div className="ox-chart-head">
        <h3 className="ox-chart-title">{title}</h3>
        <span className="ox-chart-period">{period}</span>
      </div>

      <div className="ox-chart-plot">{children}</div>

      <p className="ox-sr">{summary}</p>

      {legend.length === 0 ? null : (
        <ul className="ox-chart-legend">
          {legend.map((item) => (
            <li className="ox-legend-item" key={item.label}>
              {item.swatch === undefined ? null : (
                <span
                  className="ox-legend-swatch"
                  aria-hidden="true"
                  style={{ background: item.swatch } as CSSProperties}
                />
              )}
              {item.label}
            </li>
          ))}
        </ul>
      )}

      <p className="ox-chart-note">{note}</p>
    </div>
  );
}
