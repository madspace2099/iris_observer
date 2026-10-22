import Link from "next/link";
import type { CSSProperties } from "react";
import type { ChangeKpisView, PeriodPreset } from "@observer/readmodels";
import { InfoTip } from "@/components/iris/InfoTip";
import { DrawIn } from "@/showroom/DrawIn";
import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import "./change-kpis.css";

/** The arrow is drawing, not words: its words are the trend's `spoken`. Unchanged has none. */
const ARROW = { up: "▲", down: "▼" } as const;

/**
 * WHAT CHANGED, AS A SCREEN OF FIGURES (ADR-0060, the owner, 2026-10-22).
 *
 * The read model's figures in two rows: the three that stood here as "what
 * changed" first, larger, then what else the showroom measures. Each is a big
 * figure under a short name, its arrow against the same figure seven days
 * earlier, and its sample; the definition stands behind the name's `i` and the
 * name opens where the figure can be looked at. This file formats nothing and
 * compares nothing — the direction, the colour and every word are the read
 * model's — and it reads in the order it paints: name, `i`, figure, arrow,
 * sample. On a phone each figure is one row.
 */
export function ChangeKpis({
  kpis,
  period,
}: {
  readonly kpis: ChangeKpisView;
  readonly period: PeriodPreset;
}) {
  if (kpis.empty !== null) return <p className="iris-meta iris-meta-measured">{kpis.empty}</p>;
  return (
    <div className="iris-ckpis">
      <DrawIn kind="bloom">
        <ul className="iris-ckpi-grid">
          {kpis.kpis.map((kpi, index) => (
            <li
              key={kpi.id}
              className="iris-ckpi"
              data-lead={index < 3 ? "true" : undefined}
              style={{ "--i": index } as CSSProperties}
            >
              <div className="iris-ckpi-head">
                {kpi.href === null ? (
                  <span className="iris-ckpi-name">{kpi.label}</span>
                ) : (
                  <Link
                    className="iris-ckpi-name"
                    href={dynamicRoute(withPeriod(kpi.href, period))}
                  >
                    {kpi.label}
                  </Link>
                )}
                <InfoTip id={`ckpi-${kpi.id}`} label={kpi.label.toLowerCase()}>
                  {kpi.definition}
                </InfoTip>
              </div>
              <p
                className="iris-ckpi-figure"
                data-name={kpi.isName ? "true" : undefined}
                data-short={kpi.short === null ? undefined : "true"}
              >
                {kpi.display}
                {kpi.unit === null ? null : <span className="iris-ckpi-unit"> {kpi.unit}</span>}
              </p>
              {kpi.trend === null ? null : (
                <p
                  className="iris-ckpi-trend"
                  data-direction={kpi.trend.direction ?? "none"}
                  data-tone={kpi.trend.tone}
                >
                  <span aria-hidden="true">
                    {kpi.trend.direction === "up" || kpi.trend.direction === "down" ? (
                      <span className="iris-ckpi-arrow">{ARROW[kpi.trend.direction]}</span>
                    ) : null}
                    {kpi.trend.display}
                  </span>
                  <span className="ox-sr">{kpi.trend.spoken}</span>
                </p>
              )}
              <p className="iris-ckpi-sample">
                {kpi.sample}
                {kpi.short === null ? null : ` · ${kpi.short}`}
              </p>
            </li>
          ))}
        </ul>
      </DrawIn>
      <p className="iris-meta iris-meta-measured iris-ckpi-basis">{kpis.withheld ?? kpis.basis}</p>
    </div>
  );
}
