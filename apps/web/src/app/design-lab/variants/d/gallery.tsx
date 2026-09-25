import { OutcomeKey, OutcomeRing } from "@/showroom/charts";
import { FlowScroller } from "@/showroom/FlowScroller";
import {
  BulletChart,
  Funnel,
  Heatmap,
  JourneyFlow,
  KpiCard,
  Radar,
  RankedBars,
  SectionSequence,
  Sparkline,
  StackedBars,
  TrendLine,
} from "@/showroom/charts2";

import type { DRadarCard, DWithheld, LabChartsD } from "../../lab-data";
import { DCard, Sized } from "./card";
import { DDefs } from "./defs";
import {
  Dumbbell,
  Parallel,
  PunchCard,
  RadialHistogram,
  Scatter,
  ScatterKey,
  seriesTone,
} from "./forms";

/**
 * VARIANT D. THE HYPER KIT'S TREATMENT, ON THE PRODUCT'S OWN CHARTS.
 *
 * One page, the full width of the window, two groups:
 *
 *   A   the product's existing chart components, unchanged, under the kit's
 *       treatment. Every one of them is the component a live screen imports;
 *       what changes is `design-lab-d.css`, scoped to `.dld-root`, and never
 *       the component. The one exception is the scatter: the product has no
 *       scatter component, so it is drawn in `forms.tsx` from the same rows
 *       `QuadrantMatrix` places in its four lists.
 *   B   forms the product does not have, each over an aggregate `lab-data.ts`
 *       composes and checks against the read model it came from.
 *
 * The treatment is the kit's: black cards on a darker ground, the six-layer
 * elevation, the kit's accents and its glow. The typefaces are not the kit's —
 * text stays Manrope, figures take `--d-font-numeric` — and neither are the
 * colours that already mean something: an outcome keeps `OUTCOME_TONE`, a delta
 * keeps its verdict colour, and neither glows.
 */

function radarSeries(card: DRadarCard, order: readonly string[]) {
  return card.profiles.map((profile) => ({
    id: profile.id,
    label: profile.label,
    values: profile.values,
    tone: seriesTone(Math.max(0, order.indexOf(profile.id))),
  }));
}

function Withheld({ rows }: { readonly rows: readonly DWithheld[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="dld-withheld">
      {rows.map((row) => (
        <li key={row.id}>
          <b>{row.label}</b> {row.note}
        </li>
      ))}
    </ul>
  );
}

function RadarBody({
  card,
  order,
  variant,
}: {
  readonly card: DRadarCard;
  readonly order: readonly string[];
  readonly variant: string;
}) {
  return (
    <div className="dld-radar" data-variant={variant}>
      {card.profiles.length === 0 ? null : (
        <Radar axes={card.axes} series={radarSeries(card, order)} size={260} />
      )}
      <Withheld rows={card.withheld} />
    </div>
  );
}

export function GalleryD({ data }: { readonly data: LabChartsD }) {
  const reads = (source: string) => `${source} · ${data.projectName} · ${data.periodLabel}`;
  const order = data.radarMultiply.profiles.map((p) => p.id);
  const { funnelMultiply, trend, sequence } = data;

  /*
   * `ox-graphite` is the product's own token bridge and nothing else: it declares
   * the names the chart components read — `--outcome-*`, `--gain`, `--watch`,
   * `--loss`, `--ink`, `--rule` — and sets no property of its own. Without it
   * those names resolve to nothing outside a product page, an outcome ring draws
   * no slice, and the meaning OUTCOME_TONE carries is lost rather than kept.
   */
  return (
    <div className="dld-root ox-graphite">
      <DDefs />

      <header className="dld-head">
        <p className="dld-kicker">Design lab · Variant D</p>
        <h1 className="dld-title">The product&rsquo;s charts, in the Hyper kit&rsquo;s hand</h1>
        <p className="dld-lede">
          Read from the repository every Observer screen reads: {data.projectName},{" "}
          {data.periodLabel.toLowerCase()}. Every figure and every ranking on a card is composed in{" "}
          <code>lab-data.ts</code>; the drawings only draw. Nothing here is a live customer figure.
        </p>
      </header>

      <section className="dld-section" aria-labelledby="dld-a">
        <div className="dld-section-head">
          <h2 id="dld-a">A · The existing components, under the treatment</h2>
          <p>
            Each drawing is the component a live screen imports, unchanged. Only the stylesheet
            differs.
          </p>
        </div>

        <div className="dld-grid">
          <DCard
            id="kpi"
            group="A · KPI card"
            title={`${data.windowLabel}, the panel's lead figure`}
            reads={`FlowCharts.kpis · ${data.projectName} · ${data.windowLabel}`}
            facts={data.kpi.facts}
            kind="bloom"
          >
            <div className="dld-kpi">
              <KpiCard
                label={data.kpi.figure.label}
                value={data.kpi.figure.value}
                qualifier={data.kpi.figure.qualifier}
                delta={data.kpi.figure.delta}
                tone={data.kpi.figure.tone}
                points={data.kpi.figure.points}
              />
            </div>
          </DCard>

          <DCard
            id="sparkline"
            group="A · Sparkline"
            title="The period, week by week"
            reads={reads("FlowCharts.trend")}
            facts={data.sparkline.facts}
            kind="sweep"
          >
            <div className="dld-spark">
              <Sparkline
                points={data.sparkline.series.points.map((p) => p.value)}
                width={560}
                height={112}
                label={`${data.sparkline.series.valueLabel} by week, ${data.periodLabel.toLowerCase()}`}
              />
            </div>
          </DCard>

          <DCard
            id="trend"
            group="A · Trend line and area"
            title={`${trend.agentLabel}, week by week`}
            reads={reads("AgentDetailView.sessionsOverTime")}
            facts={trend.facts}
            kind="sweep"
            wide
          >
            {trend.series === null ? (
              <p className="dld-empty">{trend.note}</p>
            ) : (
              <div className="dld-trend">
                <TrendLine
                  points={trend.series.points}
                  annotation={trend.series.annotation}
                  valueLabel={trend.series.valueLabel}
                  height={190}
                  measured
                />
              </div>
            )}
          </DCard>

          <DCard
            id="stacked"
            group="A · Stacked bars"
            title="What the meetings became"
            reads={reads("FlowCharts.composition")}
            facts={data.stacked.facts}
            kind="rise"
          >
            <div className="dld-stacks">
              <StackedBars
                columns={data.stacked.composition.columns}
                keys={data.stacked.composition.keys}
              />
            </div>
          </DCard>

          <DCard
            id="ranked"
            group="A · Ranked bars"
            title="Presentations given"
            reads={reads("AgentCharts.ranked")}
            facts={data.ranked.facts}
            kind="sweep"
          >
            <div className="dld-ranked">
              <RankedBars rows={data.ranked.rows} period={data.period} />
            </div>
          </DCard>

          <DCard
            id="ring"
            group="A · Ring, rounded slice ends"
            title="How the meetings ended"
            reads={reads("SalesFlowView.outcomes")}
            facts={data.ring.facts}
            kind="turn"
          >
            <div className="dld-ring">
              <OutcomeRing slices={data.ring.slices} total={data.ring.total} size={220} measured />
              <OutcomeKey slices={data.ring.slices} />
            </div>
          </DCard>

          <DCard
            id="radar-basic"
            group="A · Radar, basic"
            title="One way of presenting"
            reads={reads("AgentCharts.radar")}
            facts={data.radarBasic.facts}
            kind="bloom"
          >
            <RadarBody card={data.radarBasic} order={order} variant="basic" />
          </DCard>

          <DCard
            id="radar-simple"
            group="A · Radar, simple"
            title="Another way of presenting"
            reads={reads("AgentCharts.radar")}
            facts={data.radarSimple.facts}
            kind="bloom"
          >
            <RadarBody card={data.radarSimple} order={order} variant="simple" />
          </DCard>

          <DCard
            id="radar-multiply"
            group="A · Radar, multiply"
            title="Every profile at or above the floor"
            reads={reads("AgentCharts.radar")}
            facts={data.radarMultiply.facts}
            kind="bloom"
          >
            <RadarBody card={data.radarMultiply} order={order} variant="multiply" />
          </DCard>

          <DCard
            id="heatmap-basic"
            group="A · Heatmap, basic"
            title="When meetings start"
            reads={reads("FlowCharts.activity")}
            facts={data.heatmapBasic.facts}
            kind="bloom"
            wide
          >
            <div className="dld-heat" data-variant="basic">
              <Heatmap
                rows={data.heatmapBasic.activity.rows}
                columns={data.heatmapBasic.activity.columns}
                cells={data.heatmapBasic.activity.cells}
                caption={`Meetings by weekday and starting hour, across ${data.heatmapBasic.activity.meetingsCounted} presentations. The shade steps in fifths of the busiest slot; every cell prints its own count.`}
              />
            </div>
          </DCard>

          <DCard
            id="heatmap-gradient"
            group="A · Heatmap, gradient"
            title="When meetings start, as a field"
            reads={reads("FlowCharts.activity")}
            facts={data.heatmapGradient.facts}
            kind="bloom"
            wide
          >
            <div className="dld-heat" data-variant="gradient">
              <Heatmap
                rows={data.heatmapGradient.activity.rows}
                columns={data.heatmapGradient.activity.columns}
                cells={data.heatmapGradient.activity.cells}
                caption={`Meetings by weekday and starting hour, across ${data.heatmapGradient.activity.meetingsCounted} presentations. Brightness is continuous with the count.`}
              />
            </div>
          </DCard>

          <DCard
            id="funnel-multiply"
            group="A · Funnel, multiply"
            title={`Ended "not interested", ${data.earlierLabel.toLowerCase()} and ${data.laterLabel.toLowerCase()}`}
            reads={`FlowCharts.funnel · ${data.projectName} · ${data.earlierLabel} and ${data.laterLabel}`}
            facts={funnelMultiply.facts}
            kind="bloom"
            wide
          >
            <div className="dld-funnel-pair">
              {[
                { key: "earlier", label: data.earlierLabel, funnel: funnelMultiply.earlier },
                { key: "now", label: data.laterLabel, funnel: funnelMultiply.now },
              ].map((side) => (
                <div
                  key={side.key}
                  className="dld-funnel"
                  data-variant="multiply"
                  data-side={side.key}
                >
                  <p className="dld-funnel-side">
                    {side.label} · {side.funnel.cohortLabel}
                  </p>
                  {side.funnel.empty !== null ? (
                    <p className="dld-empty">{side.funnel.empty}</p>
                  ) : (
                    <Funnel steps={side.funnel.steps} totalLabel={side.funnel.comparisonLabel} />
                  )}
                </div>
              ))}
            </div>
          </DCard>

          <DCard
            id="bullet"
            group="A · Bullet"
            title="Sold against the plan"
            reads={`ProjectCharts.targets · ${data.projectName}`}
            facts={data.bullet.facts}
            kind="sweep"
            wide
          >
            <div className="dld-bullets">
              <BulletChart
                rows={data.bullet.targets.map((t) => ({
                  id: t.id,
                  label: t.label,
                  actual: t.actual,
                  target: t.target,
                  pace: t.pace,
                  total: t.total,
                  note: t.note,
                }))}
              />
            </div>
          </DCard>

          <DCard
            id="sankey"
            group="A · Sankey"
            title="Where journeys go, and where they stop"
            reads={reads("ProjectCharts.journey")}
            facts={data.sankey.facts}
            kind="sweep"
            wide
          >
            {/* The product's own scroller: below the drawing's natural width it scrolls, and the edge that has more fades. */}
            <FlowScroller label="Where journeys go, and where they stop">
              <JourneyFlow stages={data.sankey.journey.stages} links={data.sankey.journey.links} />
            </FlowScroller>
          </DCard>

          {sequence === null ? null : (
            <DCard
              id="sequence"
              group="A · Section sequence"
              title={`${sequence.agentLabel}'s running order`}
              reads={reads("AgentDetailView.profile")}
              facts={sequence.facts}
              kind="sweep"
              wide
            >
              <div className="dld-sequence">
                <SectionSequence
                  rows={sequence.sections}
                  agentLabel={sequence.agentLabel.split(" ")[0] ?? sequence.agentLabel}
                  showTeam={sequence.showTeam}
                />
                {sequence.note === null ? null : <p className="dld-note">{sequence.note}</p>}
              </div>
            </DCard>
          )}

          <DCard
            id="scatter"
            group="A · Scatter · drawn new: the product has no scatter"
            title="Attention against conversion"
            reads={reads("ProjectView.segments")}
            facts={data.scatter.facts}
            kind="bloom"
            wide
          >
            <Sized
              xl={<Scatter data={data.scatter} size="xl" />}
              l={<Scatter data={data.scatter} size="l" />}
            />
            <ScatterKey data={data.scatter} />
            <Withheld rows={data.scatter.withheld} />
          </DCard>
        </div>
      </section>

      <section className="dld-section" aria-labelledby="dld-b">
        <div className="dld-section-head">
          <h2 id="dld-b">B · New forms, over aggregates lab-data.ts composes</h2>
          <p>
            Each aggregate is counted in <code>lab-data.ts</code> from the port&rsquo;s own session
            slice and checked against the read model before anything is drawn.
          </p>
        </div>

        <div className="dld-grid">
          <DCard
            id="parallel"
            group="B · Parallel coordinates"
            title="Every agent across the six axes"
            reads={reads("AgentRadar.axes, profiles[].values")}
            facts={data.parallel.facts}
            kind="sweep"
            wide
          >
            <Sized
              xl={<Parallel data={data.parallel} size="xl" />}
              l={<Parallel data={data.parallel} size="l" />}
            />
            {data.parallel.cut === null ? null : (
              <p className="dld-note">
                {data.parallel.cut.drawn} of {data.parallel.cut.of} lines drawn; beyond{" "}
                {data.parallel.cut.drawn} the lines stop being read, so the rest are cut.
              </p>
            )}
            <Withheld rows={data.parallel.withheld} />
          </DCard>

          <DCard
            id="radial"
            group="B · Radial histogram"
            title="The day, hour by hour"
            reads={reads("the session slice, by starting hour")}
            facts={data.radial.facts}
            kind="turn"
          >
            <div className="dld-centred">
              <Sized
                xl={<RadialHistogram data={data.radial} size="xl" />}
                l={<RadialHistogram data={data.radial} size="l" />}
              />
            </div>
          </DCard>

          <DCard
            id="punch"
            group="B · Punch card"
            title="Who presents at which hour"
            reads={reads("the session slice, by agent and starting hour")}
            facts={data.punch.facts}
            kind="bloom"
            wide
          >
            <Sized
              xl={<PunchCard data={data.punch} size="xl" />}
              l={<PunchCard data={data.punch} size="l" />}
            />
          </DCard>

          <DCard
            id="dumbbell"
            group="B · Dumbbell"
            title="The group, against every other recorded meeting"
            reads={reads("FlowCharts.funnel, as numbers")}
            facts={data.dumbbell.facts}
            kind="sweep"
            wide
          >
            <Dumbbell data={data.dumbbell} />
          </DCard>
        </div>
      </section>
    </div>
  );
}
