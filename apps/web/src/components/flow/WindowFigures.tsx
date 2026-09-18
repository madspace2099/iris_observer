import { defineMeasurement, type KpiFigure, type KpiPanel } from "@observer/readmodels";

import { Tally, TallyItem } from "@/components/product";
import { Sparkline } from "@/showroom/charts2";

/**
 * THE SUMMARY FIGURES, OVER A WINDOW THE READER PICKS.
 *
 * `readmodels/charts.ts` is explicit about why this group answers to its own
 * control rather than to the page period: "how many presentations" is a
 * different question today and this year, and making the reader move the whole
 * screen to ask the second one is how a dashboard stops being read. The page
 * states the window above the plate, and every other figure on the surface
 * reads the period in the context band. Two spans on one screen is survivable
 * only while both are named, which is the whole reason this component takes a
 * `KpiPanel` — the panel carries its own `windowLabel` and cannot be drawn
 * without it.
 *
 * ## Why this is a tally and not four KPI cards
 *
 * The rejected system is four bordered cards with an icon each
 * (`docs/12-visual-autopsy.md`, doctrine §8). `Tally` is one plane divided by
 * hairlines: the same four figures, no elevation, no repetition of a shape.
 * The sheet's two-line label reservation keeps the four values on one baseline
 * and releases it below 48rem, so nothing here has to think about width.
 *
 * ## THE ABSENCE PROBLEM, AND THE READ-MODEL GAP UNDER IT
 *
 * `MetricValue` carries a `state` — ok, empty, insufficient, unavailable,
 * error — and `Figure` in the primitive layer renders all five distinctly.
 * `KpiFigure` carries no such field. Its only signal of a value that does not
 * exist is a convention inside `buildKpis`: "Null, not zero: a window with no
 * timed session has no median to report", written to the display string as an
 * em dash.
 *
 * So this file tests the display string, which is the wrong place to learn
 * something like that and is done here anyway, with the alternative stated:
 * rendering "—" at figure size and weight would put an absence on the same
 * baseline as three real numbers, and a reader scanning the row would read it
 * as a value. The missing treatment changes four things at once instead. The
 * gap — `KpiFigure` should carry `MetricState` the way `MetricValue` does — is
 * reported rather than papered over, and this is the only string comparison in
 * the surface.
 */
const NOT_REPORTED = "—";

/**
 * The direction, and the one thing the sheet's delta cannot express.
 *
 * `.ox-delta[data-direction="up"]` is the good colour and an upward triangle;
 * `"down"` is the poor colour and a downward one. That mapping is true only
 * where a rising figure is an improvement.
 *
 * `KpiFigure` does not hand over a direction at all — it hands over `tone`,
 * which is the read model's own verdict on the movement, computed against the
 * `better` axis for that figure inside `buildKpis`. Mapping tone onto the
 * sheet's attribute is correct in the only sense the attribute is
 * ever read: a good movement is painted good and a poor one poor, whichever way
 * the underlying number went. A flat movement takes no attribute and stays in
 * quiet ink, which is what "nothing moved" should look like.
 *
 * The sign is inside `deltaDisplay` in every case, so a reader who cannot
 * separate the two hues still has the figure.
 */
function directionOf(tone: KpiFigure["tone"]): "up" | "down" | null {
  if (tone === "good") return "up";
  if (tone === "bad") return "down";
  return null;
}

/**
 * The label, with what it measures behind it where the glossary knows.
 *
 * The older surface put a monoline icon and an info button beside every column
 * name. An icon beside every label is named in the doctrine's anti-slop list,
 * and the panel it opened was a client component holding a definition that has
 * always been static. The definition still reaches the reader — as the label's
 * own title, assembled from the glossary entry the read model names — and the
 * region's note carries the same sentence where it matters most.
 */
function labelOf(figure: KpiFigure): { readonly text: string; readonly title?: string } {
  if (figure.measurementId === null) return { text: figure.label };
  const definition = defineMeasurement(figure.measurementId);
  if (definition === undefined) return { text: figure.label };
  return {
    text: figure.label,
    title: `${definition.whatItMeasures} ${definition.howItIsComputed} ${definition.limitation}`,
  };
}

export function WindowFigures({ panel }: { readonly panel: KpiPanel }) {
  return (
    <Tally>
      {panel.figures.map((figure) => {
        const missing = figure.value === NOT_REPORTED;
        const label = labelOf(figure);
        const direction = directionOf(figure.tone);

        return (
          <TallyItem
            key={figure.id}
            label={
              <span {...(label.title === undefined ? {} : { title: label.title })}>
                {label.text}
              </span>
            }
            /*
             * The figure and its own recent shape are ONE node, in the `value`
             * slot. The trailing slot is named `evidence` and holds a claim's
             * provenance everywhere else in the product; a sparkline is the
             * figure itself at a lower resolution, not what the figure rests
             * on, and putting it there would make the one call site that reads
             * oddly the one a later author copies.
             */
            value={
              missing ? (
                /*
                 * Four changes at once — size, weight, ink, and the bar mark
                 * the sheet draws in front. Three of the four is the failure
                 * the treatment exists to prevent.
                 */
                <span className="ox-value" data-missing="true">
                  Not reported
                </span>
              ) : (
                <>
                  <span className="ox-value">
                    <span className="ox-figure">{figure.value}</span>
                    {figure.qualifier === null ? null : (
                      <span className="ox-of">{figure.qualifier}</span>
                    )}
                  </span>
                  {figure.points.length < 2 ? null : (
                    <Sparkline
                      points={figure.points}
                      label={`${figure.label}: eight equal slices of ${panel.windowLabel.toLowerCase()}, oldest first`}
                    />
                  )}
                </>
              )
            }
            delta={
              figure.delta === null ? null : (
                <span
                  className="ox-delta"
                  {...(direction === null ? {} : { "data-direction": direction })}
                  title={`against the ${panel.windowLabel.toLowerCase()} immediately before`}
                >
                  {figure.delta}
                  <span className="ox-sr">
                    {" "}
                    against the {panel.windowLabel.toLowerCase()} immediately before
                  </span>
                </span>
              )
            }
          />
        );
      })}
    </Tally>
  );
}
