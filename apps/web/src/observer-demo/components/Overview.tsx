"use client";

import Link from "next/link";
import { dynamicRoute } from "@/lib/href";
import { DEMO_PROJECTS, DEMO_TODAY } from "../fixtures";
import { DEMO_INSIGHTS, EVIDENCE_LABEL } from "../insights";
import {
  CHANNEL_LABEL,
  DEMAND_STATUS_LABEL,
  RANGE_DAYS,
  RANGE_LABEL,
  channelSplit,
  demandSeries,
  funnel,
  metricCards,
  unitDemand,
} from "../metrics";
import type { DemandStatus } from "../types";
import { Chip, Delta, DemandChart, KpiCard, Panel, formatCount, formatPrice } from "./pieces";
import { useSelection } from "./Shell";

const TONE: Readonly<Record<DemandStatus, "good" | "warn" | "weak" | "neutral">> = {
  rising: "good",
  steady: "neutral",
  cooling: "weak",
  quiet: "warn",
};

export function Overview() {
  const selection = useSelection();
  const cards = metricCards(selection);
  const stages = funnel(selection);
  const series = demandSeries(selection);
  const channels = channelSplit(selection);
  const units = [...unitDemand(selection)].sort((a, b) => b.views - a.views).slice(0, 8);
  const project = DEMO_PROJECTS.find((p) => p.id === selection.projectId);
  const brief = DEMO_INSIGHTS.slice(0, 3);
  const maxChannel = Math.max(1, ...channels.map((c) => c.sessions));

  return (
    <>
      <div className="od-kpis">
        {cards.map((metric) => (
          <KpiCard key={metric.key} metric={metric} />
        ))}
      </div>

      <div className="od-row od-row-2">
        <Panel
          title="Demand development"
          note={`Daily observed sessions, split by channel. The channel filter narrows the summary above; both lines stay here so the shapes can be compared.`}
          aside={<Chip tone="accent">{RANGE_LABEL[selection.range]}</Chip>}
        >
          <DemandChart series={series} />
        </Panel>

        <Panel
          title="Sales journey"
          note="Stages a journey was observed to reach, in the only order they can occur. Each bar is a share of the first stage."
        >
          <div className="od-funnel">
            {stages.map((stage, i) => (
              <div className="od-stage" key={stage.key}>
                <span className="od-stage-label">{stage.label}</span>
                <span className="od-stage-value">{formatCount(stage.value)}</span>
                <div className="od-stage-bar">
                  <div
                    className="od-stage-fill"
                    style={{ width: `${Math.max(stage.ofFirst * 100, 0.6)}%` }}
                  />
                </div>
                <span className="od-stage-meta">
                  <span>{(stage.ofFirst * 100).toFixed(1)}% of project views</span>
                  {i > 0 && <span>{(stage.ofPrevious * 100).toFixed(1)}% of previous stage</span>}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        className="od-panel od-brief"
        title="Observer Brief"
        note={`Three findings from the selected window. Each states what was observed, why it may matter and what a person might do — none of them says what caused anything.`}
        aside={
          <>
            <Chip tone="accent">AI-assisted</Chip>
            <Chip>{`Period to ${DEMO_TODAY}`}</Chip>
          </>
        }
      >
        {brief.map((insight, i) => (
          <article className="od-brief-item" key={insight.id}>
            <span className="od-brief-index" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <h3 className="od-brief-title">{insight.title}</h3>
              <p className="od-brief-text">
                <strong style={{ color: "var(--od-text)" }}>Observed. </strong>
                {insight.measurement}
              </p>
              <p className="od-brief-text">{insight.whyItMatters}</p>
              <p className="od-brief-action">{insight.recommendation}</p>
              <div className="od-brief-foot">
                <Chip
                  tone={
                    insight.evidence === "association"
                      ? "warn"
                      : insight.evidence === "attributed-conversion"
                        ? "good"
                        : "accent"
                  }
                >
                  {EVIDENCE_LABEL[insight.evidence]}
                </Chip>
                <Chip>{insight.subject}</Chip>
              </div>
            </div>
          </article>
        ))}
      </Panel>

      <div className="od-row od-row-units">
        <Panel
          title="Unit demand"
          note="The eight units drawing the most detail views in this window. Views and favourites sum to the summary cards above."
          aside={
            <Link
              className="od-chip"
              href={dynamicRoute(
                `/observer/units?project=${selection.projectId}&range=${selection.range}&channel=${selection.channel}`,
              )}
            >
              All {project?.unitCount ?? 0} units →
            </Link>
          }
        >
          <div className="od-table-scroll">
            <table className="od-table">
              <thead>
                <tr>
                  <th scope="col">Unit</th>
                  <th scope="col">Floor</th>
                  <th scope="col">Rooms</th>
                  <th scope="col">Aspect</th>
                  <th scope="col" className="od-num">
                    Price
                  </th>
                  <th scope="col">Availability</th>
                  <th scope="col" className="od-num">
                    Views
                  </th>
                  <th scope="col" className="od-num">
                    Favourites
                  </th>
                  <th scope="col" className="od-num">
                    Trend
                  </th>
                  <th scope="col">Demand</th>
                </tr>
              </thead>
              <tbody>
                {units.map((row) => (
                  <tr key={row.unit.id}>
                    <td className="od-unit-id">{row.unit.label}</td>
                    <td>{row.unit.floor}</td>
                    <td>{row.unit.rooms}</td>
                    <td>{row.unit.orientation}</td>
                    <td className="od-num">{formatPrice(row.unit.price)}</td>
                    <td>
                      <Chip tone={row.unit.availability === "available" ? "neutral" : "warn"}>
                        {row.unit.availability}
                      </Chip>
                    </td>
                    <td className="od-num">{formatCount(row.views)}</td>
                    <td className="od-num">{formatCount(row.favorites)}</td>
                    <td className="od-num">
                      <Delta current={row.views} previous={row.priorViews} />
                    </td>
                    <td>
                      <Chip tone={TONE[row.status]}>{DEMAND_STATUS_LABEL[row.status]}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Channel comparison"
          note="Web IRIS and Showroom are not two halves of one number. Activity that matched no journey is shown as its own category rather than divided between them."
        >
          <div className="od-channels">
            {channels.map((c) => (
              <div className="od-channel" key={c.channel}>
                <span className="od-channel-name">{c.label}</span>
                <span className="od-channel-value">{formatCount(c.sessions)}</span>
                <div className="od-channel-bar">
                  <div
                    className="od-channel-fill"
                    style={{
                      width: `${(c.sessions / maxChannel) * 100}%`,
                      background:
                        c.channel === "web"
                          ? "var(--od-accent)"
                          : c.channel === "showroom"
                            ? "#3ecf8e"
                            : "var(--od-unknown)",
                    }}
                  />
                </div>
                <span className="od-channel-note">
                  {c.channel === "unknown"
                    ? "Showroom sessions that matched no web identity. Counted, never apportioned."
                    : `${formatCount(c.reservations)} attributed reservation${c.reservations === 1 ? "" : "s"} · ${formatCount(c.linkedJourneys)} journeys linked across both channels`}
                </span>
              </div>
            ))}
          </div>
          <p className="od-panel-note" style={{ marginTop: 14 }}>
            Linked journeys are matched on an exact booking reference observed on both sides. They
            are the same journeys, not two populations that resemble each other.
          </p>
        </Panel>
      </div>

      <p className="od-subtitle" style={{ paddingTop: 4 }}>
        {project?.name} · {RANGE_DAYS[selection.range]} days to {DEMO_TODAY} ·{" "}
        {CHANNEL_LABEL[selection.channel]} · every figure is synthetic demonstration data.
      </p>
    </>
  );
}
