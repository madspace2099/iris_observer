import type { MeetingOutcome } from "@observer/contracts";
import type { OutcomeSlice } from "@observer/readmodels";

/**
 * THE REPORT'S CHARTS, DRAWN FOR PAPER (ADR-0050).
 *
 * Two shapes the report printed as rows of text and bars of background: how
 * the meetings ended, as one whole, and how long each section held a meeting.
 * Both are SVG, so they print whether or not the browser prints backgrounds,
 * and both draw only what the read model already states: a slice's own share,
 * a section's own median. The arithmetic here places marks — where a part
 * starts, how long a bar is against the longest — and produces no figure a
 * reader is asked to read; every number beside a mark is the read model's
 * display, and the table under the chart carries its denominator.
 *
 * The palette is the outcome's meaning, readable in greyscale: progressed
 * outcomes in one muted green at four strengths, "not interested" in the poor
 * mark's terracotta, "presentation only" in grey, and a meeting with no
 * outcome recorded hatched rather than filled, because it is an absence and
 * not a fifth kind of ending. The colours are tokens, so on screen the same
 * chart takes the graphite inks.
 */

/** The hatch for an outcome nobody recorded, defined once per chart so its id is the chart's own. */
function Hatch({ id }: { readonly id: string }) {
  return (
    <defs>
      <pattern
        id={id}
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect className="ox-mix-hatch-ground" width="5" height="5" />
        <line className="ox-mix-hatch-line" x1="0" y1="0" x2="0" y2="5" />
      </pattern>
    </defs>
  );
}

const fillOf = (outcome: MeetingOutcome, hatch: string) =>
  outcome === "skipped" ? `url(#${hatch})` : undefined;

/**
 * A slice's swatch, for the table row that names it: the table under the bar
 * is the bar's legend, so the part and its row read as one thing.
 */
export function OutcomeSwatch({
  outcome,
  id,
}: {
  readonly outcome: MeetingOutcome;
  readonly id: string;
}) {
  const hatch = `${id}-hatch`;
  return (
    <svg className="ox-mix-swatch" width="10" height="10" aria-hidden="true" focusable="false">
      {outcome === "skipped" ? <Hatch id={hatch} /> : null}
      <rect
        className="ox-mix-part"
        data-outcome={outcome}
        width="10"
        height="10"
        fill={fillOf(outcome, hatch)}
      />
    </svg>
  );
}

/**
 * HOW THE MEETINGS ENDED: one 100% bar, a part per outcome in the read model's
 * order, each as wide as the share the read model states for it. A part wide
 * enough to hold its count prints it; every part is named, with its count and
 * its denominator, in the table this stands above.
 *
 * Below the agent floor it is still drawn, as the agent's own screen draws
 * the same parts as a ring at any sample: what the floor withholds is the
 * printed rate and the comparison with the team, and the bar prints neither.
 */
export function OutcomeMix({
  slices,
  id,
  label,
}: {
  readonly slices: readonly OutcomeSlice[];
  /** Unique on the page: the hatch pattern is addressed by it. */
  readonly id: string;
  /** The chart's name to a screen reader. */
  readonly label: string;
}) {
  const hatch = `${id}-hatch`;
  let start = 0;
  const parts = slices
    .filter((slice) => slice.count > 0)
    .map((slice) => {
      const at = start;
      start += slice.share;
      return { slice, at };
    });
  if (parts.length === 0) return null;
  const pct = (share: number) => `${(share * 100).toFixed(2)}%`;

  return (
    <svg className="ox-mix" width="100%" height="22" role="img" aria-label={label}>
      <Hatch id={hatch} />
      {parts.map(({ slice, at }) => (
        <g key={slice.outcome}>
          <rect
            className="ox-mix-part"
            data-outcome={slice.outcome}
            x={pct(at)}
            y="0"
            width={pct(slice.share)}
            height="22"
            fill={fillOf(slice.outcome, hatch)}
          />
          {slice.share >= 0.05 ? (
            <text
              className="ox-mix-count"
              data-outcome={slice.outcome}
              x={pct(at + slice.share / 2)}
              y="11"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {slice.count}
            </text>
          ) : null}
          <title>{`${slice.label}: ${String(slice.count)}`}</title>
        </g>
      ))}
    </svg>
  );
}

/**
 * A bar in a table cell, against the longest in its column: a duration or a
 * share drawn beside the display the read model wrote for it. Absent values
 * get no bar, never a zero-length one, and the cell keeps its own words.
 */
export function CellBar({ value, max }: { readonly value: number | null; readonly max: number }) {
  if (value === null || !(max > 0)) return null;
  return (
    <svg className="ox-cell-bar" width="48" height="8" aria-hidden="true" focusable="false">
      <rect className="ox-cell-bar-track" width="48" height="8" />
      <rect
        className="ox-cell-bar-fill"
        width={((Math.max(0, value) / max) * 48).toFixed(1)}
        height="8"
      />
    </svg>
  );
}
