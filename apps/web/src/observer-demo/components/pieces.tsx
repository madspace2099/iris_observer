"use client";

import { useId, useState, type ReactNode } from "react";
import { changePct } from "../metrics";
import type { MetricCardValue, SeriesPoint } from "../types";

/** A panel. One shape for every block on every screen. */
export function Panel({
  title,
  note,
  aside,
  className,
  children,
}: {
  title: string;
  note?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className === undefined ? "od-panel" : `od-panel ${className}`}>
      <div className="od-panel-head">
        <div>
          <h2 className="od-panel-title">{title}</h2>
          {note !== undefined && <p className="od-panel-note">{note}</p>}
        </div>
        {aside !== undefined && <div className="od-panel-aside">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "weak" | "accent";
  children: ReactNode;
}) {
  return (
    <span className="od-chip" data-tone={tone === "neutral" ? undefined : tone}>
      {children}
    </span>
  );
}

const nf = new Intl.NumberFormat("en-GB");

export const formatCount = (n: number): string => nf.format(n);

/** Money, in the currency the fixture is denominated in. */
export const formatPrice = (n: number): string => `${nf.format(Math.round(n / 1_000_000))} M Ft`;

/**
 * A change against the previous window.
 *
 * `null` when the earlier window held nothing — which is different from zero
 * change, and is said differently.
 */
export function Delta({ current, previous }: { current: number; previous: number }) {
  const pct = changePct(current, previous);
  if (pct === null) {
    return (
      <span className="od-delta" data-dir="flat">
        No prior window
      </span>
    );
  }
  const dir = pct > 1 ? "up" : pct < -1 ? "down" : "flat";
  return (
    <span className="od-delta" data-dir={dir}>
      <span aria-hidden="true">{dir === "up" ? "▲" : dir === "down" ? "▼" : "—"}</span>
      {pct > 0 ? "+" : ""}
      {pct.toFixed(1)}%
      <span className="od-visually-hidden">
        {dir === "up" ? "increase" : dir === "down" ? "decrease" : "no material change"} against the
        previous window
      </span>
    </span>
  );
}

/**
 * A compact trend, drawn as a path rather than a bar per day.
 *
 * At ninety points a bar chart in a 60-pixel card is a smear; a line keeps the
 * shape readable at every range the selector offers.
 */
export function Spark({ values, tone = "accent" }: { values: readonly number[]; tone?: string }) {
  if (values.length < 2) return <svg width="72" height="22" aria-hidden="true" />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = 72 / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(20 - ((v - min) / span) * 18).toFixed(1)}`)
    .join(" ");
  return (
    <svg width="72" height="22" viewBox="0 0 72 22" aria-hidden="true" className="od-chart">
      <polyline
        points={points}
        fill="none"
        stroke={tone === "accent" ? "var(--od-accent)" : "currentColor"}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** One executive-summary card. */
export function KpiCard({ metric }: { metric: MetricCardValue }) {
  const id = useId();
  return (
    <article className="od-kpi">
      <span className="od-kpi-label">
        {metric.label}
        <span
          className="od-info"
          tabIndex={0}
          role="note"
          aria-describedby={id}
          title={metric.description}
        >
          i
        </span>
        <span className="od-visually-hidden" id={id}>
          {metric.description}
        </span>
      </span>
      <span className="od-kpi-value">{formatCount(metric.value)}</span>
      <span className="od-kpi-foot">
        <Delta current={metric.value} previous={metric.previous} />
        <Spark values={metric.spark} />
      </span>
    </article>
  );
}

/**
 * The demand chart.
 *
 * Hand-built SVG: no charting dependency exists in this workspace and the brief
 * forbids installing one. Two lines with an area beneath the larger, a hover
 * band per day, and a focusable summary for readers who are not using a mouse.
 */
export function DemandChart({
  series,
  height = 420,
}: {
  series: readonly SeriesPoint[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");

  if (series.length === 0) {
    return (
      <div className="od-state">
        <strong>No activity in this window</strong>
        <p>Nothing was observed on the selected channel for the selected dates.</p>
      </div>
    );
  }

  const W = 1000;
  const H = height;
  const padL = 42;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const max = Math.max(1, ...series.map((p) => Math.max(p.web, p.showroom)));
  const step = (W - padL - padR) / Math.max(1, series.length - 1);
  const x = (i: number): number => padL + i * step;
  const y = (v: number): number => padT + (1 - v / max) * (H - padT - padB);

  const line = (key: "web" | "showroom"): string =>
    series
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`)
      .join(" ");

  const area = `${line("web")} L${x(series.length - 1).toFixed(1)} ${(H - padB).toFixed(1)} L${padL} ${(
    H - padB
  ).toFixed(1)} Z`;

  /* Four gridlines. More would compete with the data for attention. */
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  /*
   * The busiest and quietest days in the window.
   *
   * Read off the same array the chart plots, so they cannot disagree with it.
   * Both are stated as counts on dates: which day was busiest is a fact, and
   * nothing here says why it was.
   */
  const totals = series.map((d) => d.web + d.showroom);
  const peakAt = totals.indexOf(Math.max(...totals));
  const lowAt = totals.indexOf(Math.min(...totals));
  const peak = series[peakAt];
  const low = series[lowAt];
  const point = hover === null ? undefined : series[hover];

  return (
    <div className="od-chartwrap">
      <svg
        className="od-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Daily observed sessions by channel across ${series.length} days. Web IRIS peaks midweek, Showroom at weekends.`}
      >
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--od-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--od-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(t)}
              y2={y(t)}
              stroke="rgb(255 255 255 / 6%)"
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={y(t) + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="var(--od-text-3)"
            >
              {formatCount(t)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#fill-${gid})`} />
        <path
          d={line("web")}
          fill="none"
          stroke="var(--od-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d={line("showroom")}
          fill="none"
          stroke="#3ecf8e"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeDasharray="5 3"
        />

        {series.map((p, i) =>
          i % Math.ceil(series.length / 7) === 0 ? (
            <text
              key={p.date}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="var(--od-text-3)"
            >
              {p.date.slice(5)}
            </text>
          ) : null,
        )}

        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={padT}
            y2={H - padB}
            stroke="var(--od-accent)"
            strokeWidth="1"
            strokeOpacity="0.5"
          />
        )}
        {hover !== null && point !== undefined && (
          <>
            <circle cx={x(hover)} cy={y(point.web)} r="3.5" fill="var(--od-accent)" />
            <circle cx={x(hover)} cy={y(point.showroom)} r="3.5" fill="#3ecf8e" />
          </>
        )}

        {series.map((p, i) => (
          <rect
            key={p.date}
            className="od-hover"
            x={x(i) - step / 2}
            y={padT}
            width={step}
            height={H - padT - padB}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {point !== undefined && point !== null && (
        <div className="od-tip" style={{ left: `${(x(hover ?? 0) / W) * 100}%`, top: 8 }}>
          <div className="od-tip-date">{point.date}</div>
          <div className="od-tip-row">
            <span>
              <i className="od-swatch" style={{ background: "var(--od-accent)" }} /> Web IRIS
            </span>
            <b>{formatCount(point.web)}</b>
          </div>
          <div className="od-tip-row">
            <span>
              <i className="od-swatch" style={{ background: "#3ecf8e" }} /> Showroom
            </span>
            <b>{formatCount(point.showroom)}</b>
          </div>
        </div>
      )}

      <div className="od-legend" style={{ marginTop: 10 }}>
        <span>
          <i className="od-swatch" style={{ background: "var(--od-accent)" }} /> Web IRIS
        </span>
        <span>
          <i className="od-swatch" style={{ background: "#3ecf8e" }} /> Showroom
        </span>
      </div>

      {peak !== undefined && low !== undefined && (
        <dl className="od-chart-foot">
          <div>
            <dt>Busiest day</dt>
            <dd>
              {peak.date} · {formatCount(peak.web + peak.showroom)} sessions
            </dd>
          </div>
          <div>
            <dt>Quietest day</dt>
            <dd>
              {low.date} · {formatCount(low.web + low.showroom)} sessions
            </dd>
          </div>
          <div>
            <dt>Days in window</dt>
            <dd>{series.length}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** The empty state, phrased as a measurement rather than as a failure. */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="od-state">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8.5 12h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
