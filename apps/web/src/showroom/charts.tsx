import type { OutcomeSlice } from "@observer/readmodels";

/**
 * Four shapes, because four different questions were being asked.
 *
 * Review found the surfaces chaotic, and the diagnosis was right: everything was
 * a horizontal bar. A bar answers "how big is this one against that one" and
 * nothing else, so using it for parts-of-a-whole, for a rate over time, and for
 * two rates compared made three different questions look like the same one.
 *
 *   Ring      parts of one whole — an outcome mix
 *   Steps     a count across named periods — how the weeks are going
 *   Paired    two rates against each other — this segment against the rest
 *   Spread    where one value sits inside a range — an index against parity
 *
 * All hand-drawn SVG. No chart library: a library's defaults are how a product
 * ends up looking like every other dashboard.
 */

/* --- the outcome ring --------------------------------------------------------- */

const OUTCOME_TONE: Record<string, string> = {
  purchase: "var(--gain)",
  reservation: "color-mix(in oklab, var(--gain) 70%, var(--accent))",
  interested: "var(--accent)",
  follow_up_needed: "color-mix(in oklab, var(--accent) 55%, var(--ink-3))",
  presentation_only: "var(--ink-3)",
  not_interested: "var(--loss)",
  skipped: "color-mix(in oklab, var(--ink-3) 45%, transparent)",
};

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const a0 = from * 2 * Math.PI - Math.PI / 2;
  const a1 = to * 2 * Math.PI - Math.PI / 2;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = to - from > 0.5 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

/**
 * An outcome mix, as parts of one whole.
 *
 * A ring rather than a pie: the hole carries the count, which is the figure a
 * reader needs before any share means anything. Segments are drawn as stroked
 * arcs so a one-meeting slice is still visible — a filled wedge at 3% is a
 * sliver nobody can see or hover.
 */
export function OutcomeRing({
  slices,
  total,
  size = 132,
  label,
}: {
  slices: readonly OutcomeSlice[];
  total: number;
  size?: number;
  label?: string;
}) {
  const stroke = size * 0.13;
  const r = (size - stroke) / 2 - 1;
  const c = size / 2;
  let cursor = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="iris-ring"
      role="img"
      aria-label={
        label ?? `${total} meetings: ${slices.map((s) => `${s.label} ${s.count}`).join(", ")}`
      }
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--rule)" strokeWidth={stroke} />
      {slices.map((s) => {
        const from = cursor;
        // A hairline gap so adjacent slices read as separate without a stroke
        // colour that would compete with the data.
        const to = cursor + s.share;
        cursor = to;
        if (s.share <= 0) return null;
        return (
          <path
            key={s.outcome}
            d={arc(c, c, r, from, Math.max(from + 0.004, to - 0.004))}
            fill="none"
            stroke={OUTCOME_TONE[s.outcome] ?? "var(--ink-3)"}
            strokeWidth={stroke}
            strokeLinecap="butt"
          >
            <title>{`${s.label}: ${s.count} of ${total}`}</title>
          </path>
        );
      })}
      <text
        x={c}
        y={c - 2}
        className="iris-ring-figure"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {total}
      </text>
      <text x={c} y={c + size * 0.14} className="iris-ring-caption" textAnchor="middle">
        meetings
      </text>
    </svg>
  );
}

export function OutcomeKey({ slices }: { slices: readonly OutcomeSlice[] }) {
  return (
    <ul className="iris-ring-key">
      {slices.map((s) => (
        <li key={s.outcome}>
          <i style={{ background: OUTCOME_TONE[s.outcome] ?? "var(--ink-3)" }} />
          {s.label}
          <b>{s.count}</b>
        </li>
      ))}
    </ul>
  );
}

/* --- steps across named periods ----------------------------------------------- */

interface Bucket {
  readonly id: string;
  readonly label: string;
  readonly meetings: number;
  readonly medianDurationDisplay: string;
  readonly progressed: number;
}

/**
 * A count across named periods, in pairs.
 *
 * Columns rather than a line: the buckets are discrete and of different lengths,
 * and a line between them would imply a continuous series that does not exist.
 *
 * **Each pair is scaled to itself.** A day beside a month on one axis makes the
 * day invisible — one meeting against forty-two is a sliver nobody can read —
 * and the comparison anybody actually makes is within the pair: today against
 * yesterday, this month against last. Scaling across all six would be one
 * honest axis serving no question.
 */
export function PeriodSteps({ periods }: { periods: readonly Bucket[] }) {
  const pairs: readonly (readonly Bucket[])[] = [
    periods.filter((p) => p.id === "today" || p.id === "yesterday"),
    periods.filter((p) => p.id === "this_week" || p.id === "last_week"),
    periods.filter((p) => p.id === "this_month" || p.id === "last_month"),
  ].filter((g) => g.length > 0);

  return (
    <div className="iris-step-groups">
      {pairs.map((group) => {
        const peak = Math.max(1, ...group.map((p) => p.meetings));
        return (
          <div className="iris-steps" key={group.map((g) => g.id).join("-")}>
            {group.map((p) => (
              <div className="iris-step" key={p.id}>
                <span
                  className="iris-step-bar"
                  title={`${p.meetings} meetings · ${p.progressed} progressed`}
                >
                  <i style={{ height: `${(p.meetings / peak) * 100}%` }} />
                  {/* Progressed sits inside the column: part of the same total,
                      not a competing quantity beside it. */}
                  <b style={{ height: `${(p.progressed / peak) * 100}%` }} />
                </span>
                <span className="iris-step-figure">{p.meetings}</span>
                <span className="iris-step-label">{p.label}</span>
                <span className="iris-step-meta">{p.medianDurationDisplay}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* --- two rates, paired --------------------------------------------------------- */

/**
 * One value against another on a shared axis.
 *
 * A dot for each side joined by a line, which is what makes the *gap* the thing
 * you see. Two bars side by side make the reader compare two lengths from
 * different baselines; a paired dot puts the difference itself on the page.
 */
export function PairedRates({
  rows,
  leftLabel,
  rightLabel,
}: {
  rows: readonly {
    readonly id: string;
    readonly label: string;
    readonly left: number;
    readonly right: number;
    readonly note?: string | null;
  }[];
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="iris-paired">
      <div className="iris-paired-head">
        <span />
        <span className="iris-paired-axis">
          <em style={{ left: "0%" }}>0%</em>
          <em style={{ left: "50%" }}>50%</em>
          <em style={{ left: "100%" }}>100%</em>
        </span>
        <span className="iris-code">{leftLabel}</span>
        <span className="iris-code">{rightLabel}</span>
      </div>
      {rows.map((row) => {
        const lo = Math.min(row.left, row.right);
        const hi = Math.max(row.left, row.right);
        return (
          <div className="iris-paired-row" key={row.id}>
            <span className="iris-paired-label" title={row.note ?? undefined}>
              {row.label}
            </span>
            <span className="iris-paired-track">
              <i style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
              <b data-side="left" style={{ left: `${row.left * 100}%` }} />
              <b data-side="right" style={{ left: `${row.right * 100}%` }} />
            </span>
            <span className="iris-paired-value">{Math.round(row.left * 100)}%</span>
            <span className="iris-paired-value" data-muted="true">
              {Math.round(row.right * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* --- an index against parity ---------------------------------------------------- */

/**
 * Where a value sits relative to 1.00×.
 *
 * The question is never "how big is this index" but "which side of parity is it
 * on, and by how far". A bar from zero answers neither; a marker on an axis
 * centred at parity answers both.
 */
export function ParityScale({
  rows,
  max = 2,
}: {
  rows: readonly {
    readonly id: string;
    readonly label: string;
    readonly index: number;
    readonly note: string;
  }[];
  max?: number;
}) {
  const place = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;

  return (
    <div className="iris-parity">
      {rows.map((row) => (
        <div className="iris-parity-row" key={row.id}>
          <span className="iris-parity-label">{row.label}</span>
          <span className="iris-parity-track">
            <em style={{ left: place(1) }} />
            <i
              data-over={row.index >= 1 ? "true" : undefined}
              style={{
                left: place(Math.min(row.index, 1)),
                width: place(Math.abs(row.index - 1)),
              }}
            />
            <b style={{ left: place(row.index) }} title={row.note} />
          </span>
          <span className="iris-parity-value" data-over={row.index >= 1 ? "true" : undefined}>
            {row.index.toFixed(2)}×
          </span>
        </div>
      ))}
      <p className="iris-code" style={{ textAlign: "center", color: "var(--ink-3)" }}>
        1.00× is attention exactly matching supply
      </p>
    </div>
  );
}
