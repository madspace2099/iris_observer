import type { ReactNode } from "react";

/**
 * THE THREE THINGS THE AGENT SURFACES HAVE TO DRAW THAT `Figure` CANNOT.
 *
 * `components/product/Metric.tsx` is the single place a number reaches a screen
 * in this product, and every screen should be reading it. These two components
 * exist only where that is impossible, and the impossibility is a property of
 * the read model rather than a preference of this screen:
 *
 * `AgentProfile` — the shape the Sales Agents roster is built from — carries
 * `ring.progressedShare` as a bare `number` between 0 and 1, and
 * `medianDurationDisplay` as a string that spells its own absence as an em
 * dash. Neither is a `MetricValue`, so neither carries a `state`, a
 * `sampleSize`, a `minimumSampleSize`, an `evidence` reference or a formatted
 * `display`. `Figure` has nothing to render from them.
 *
 * There were three ways out and two of them were worse.
 *
 * **Constructing a `MetricValue` in the page** would be a component producing a
 * metric, which ADR-0012 forbids outright, and it would put the sample-size
 * policy — the number 20 — in a component where the next author cannot see the
 * registry that owns it.
 *
 * **Rendering the raw share and trusting the reader** is how a rate over seven
 * meetings becomes a verdict about a colleague. `docs/10-policies.md` §6 is
 * explicit: below the minimum sample there is no verdict, no rank and no trend,
 * and the figure is shown with its shortfall beside it.
 *
 * So this file composes the stylesheet's own treatments — `.ox-value`,
 * `.ox-insufficient`, `.ox-figure`, `.ox-shortfall`, `.ox-of` and the
 * `data-missing` mark — and applies the floor from the metric registry itself
 * rather than from a literal. It is the same discipline `Figure` applies, on a
 * shape that cannot reach `Figure`. **The gap is reported**: `AgentProfile`
 * should carry `MetricValue`s, and when it does this file should be deleted
 * rather than kept as a second way of drawing a figure.
 */

/**
 * A share the read model gave as a raw number, formatted in the project's own
 * locale and guarded by the sample floor.
 *
 * Formatting is normally forbidden in a component and is done here for the same
 * reason the component exists at all: there is no `display` string to render.
 * The locale is the **project's** (`ProjectSummary.locale`), passed down from
 * the view context, never the server's default — a Hungarian scheme and a
 * British one write a percentage differently and a figure that changed shape
 * between two screens would be two conventions, not one product.
 */
export function ShareFigure({
  share,
  sampleSize,
  minimumSampleSize,
  locale,
  qualifier = null,
  shortfallNoun = "meetings",
}: {
  /** 0 to 1, as every share on the read models is. */
  readonly share: number;
  readonly sampleSize: number;
  readonly minimumSampleSize: number;
  readonly locale: string;
  /** The denominator, in words. No metric without one. */
  readonly qualifier?: ReactNode;
  readonly shortfallNoun?: string;
}) {
  const display = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(share);

  /*
   * Below the floor the figure still stands — it is a real count of real
   * meetings — and everything that would make it a verdict is withheld: no
   * comparison, no direction, no rank, and the shortfall printed beside it so
   * the reader knows how much of a figure they are looking at.
   */
  if (sampleSize < minimumSampleSize) {
    return (
      <span className="ox-insufficient">
        <span className="ox-figure">{display}</span>
        <span className="ox-shortfall">
          {sampleSize} of {minimumSampleSize} {shortfallNoun} needed
        </span>
      </span>
    );
  }

  return (
    <span className="ox-value">
      <span className="ox-figure">{display}</span>
      {qualifier === null ? null : <span className="ox-of">{qualifier}</span>}
    </span>
  );
}

/**
 * A value the source could not produce, in the system's missing treatment.
 *
 * Four things change at once — size, weight, ink, and the bar mark in front —
 * and the words say which kind of nothing it is. It exists here for the one
 * place a read model hands a screen an em dash: `AgentProfile`'s
 * `medianDurationDisplay` and `AgentSectionUse`'s `dwellDisplay` are both "—"
 * when no session in the sample could be timed.
 *
 * An em dash in a column of numbers reads as a value somebody forgot to fill
 * in. "Not timed" reads as what it is: the legacy import records the order of a
 * presentation and not its clock, so there is no median to have.
 */
export function Missing({ what }: { readonly what: string }) {
  return (
    <span className="ox-value" data-missing="true">
      {what}
    </span>
  );
}

/**
 * True when a display string from a read model is the em dash it uses for "no
 * value".
 *
 * One predicate rather than three inline comparisons, so the convention is
 * named where a reader will meet it. Both spellings are checked: the read
 * models write an em dash, and a `-` would be a hyphen nobody meant.
 */
export function isDash(display: string): boolean {
  const trimmed = display.trim();
  return trimmed === "—" || trimmed === "-" || trimmed.length === 0;
}
