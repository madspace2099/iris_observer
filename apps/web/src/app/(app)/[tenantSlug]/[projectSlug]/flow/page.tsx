import type { Metadata } from "next";
import Link from "next/link";
import { KPI_WINDOWS, type KpiWindowId, type PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { presetFrom } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { Measure } from "@/showroom/Measure";
import { OutcomeKey, OutcomeRing, PeriodSteps } from "@/showroom/charts";
import { Funnel, Heatmap, KpiCard, RankedBars, StackedBars, TrendLine } from "@/showroom/charts2";

export const metadata: Metadata = { title: "Sales Flow" };

function windowFrom(value: string | undefined): KpiWindowId {
  const found = KPI_WINDOWS.find((w) => w.id === value);
  return found === undefined ? "month" : found.id;
}

/**
 * View one — how the process is performing.
 *
 * Volume against time, and what the meetings turned into. The requested shape:
 * how many meetings today, yesterday, this week, last week, this month, last
 * month; how long they ran; and how many of them realised into something.
 *
 * The outcome mix is a ring per agent, side by side. That is the right form and
 * the requested one — outcome is parts of one whole, and six bars per agent
 * would invite the reader to compare heights across people, which is the league
 * table this product refuses to be. A flag is raised where a pattern is worth a
 * conversation, and it is written as a fact an agent can answer, never a rank.
 *
 * The summary figures at the top answer to their own control rather than to the
 * page period. How many presentations is a different question today and this
 * year, and making the reader move the whole page to ask the second one is how a
 * dashboard stops being read.
 */
export default async function FlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string; window?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const { period, window: windowParam } = await searchParams;

  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(period) as PeriodPreset,
  };
  const kpiWindow = windowFrom(windowParam);

  /*
   * The period summary is read for two of its fields.
   *
   * `changes` is the only place in the product that says what moved in how
   * meetings are *run* between one period and the next — the counts moving is
   * a different question and is already above. Its figures, findings and
   * outcome mix are deliberately not drawn here, because this page and the
   * opening screen already carry them.
   */
  const [view, charts, summary] = await Promise.all([
    repository.getSalesFlow(query),
    repository.getFlowCharts(query, kpiWindow),
    repository.getShowroomOverview(query),
  ]);

  const recorded = view.outcomes
    .filter((o) => o.outcome !== "skipped")
    .reduce((a, o) => a + o.count, 0);

  const base = `/${tenantSlug}/${projectSlug}/flow`;
  const windowHref = (id: KpiWindowId) => {
    const search = new URLSearchParams();
    if (period !== undefined) search.set("period", period);
    if (id !== "month") search.set("window", id);
    const qs = search.toString();
    return qs === "" ? base : `${base}?${qs}`;
  };

  return (
    <div className="iris-one">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Sales flow · {view.context.period.label}</p>
        <h1 className="iris-section">{view.verdict}</h1>

        {/* --- the figures, over a window the reader picks ---------------- */}

        <div>
          <div className="iris-window">
            <p className="iris-kicker" style={{ margin: 0 }}>
              Summary over
            </p>
            <div className="iris-mode-strip">
              {KPI_WINDOWS.map((w) => (
                <Link
                  key={w.id}
                  className="iris-chip"
                  aria-current={w.id === kpiWindow ? "true" : undefined}
                  href={dynamicRoute(windowHref(w.id))}
                >
                  {w.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="iris-kpis" style={{ marginTop: "1rem" }}>
            {charts.kpis.figures.map((figure) => (
              <KpiCard
                key={figure.id}
                label={figure.label}
                info={
                  figure.measurementId === null ? (
                    figure.label
                  ) : (
                    <Measure id={figure.measurementId} label={figure.label} />
                  )
                }
                value={figure.value}
                qualifier={figure.qualifier}
                delta={figure.delta}
                tone={figure.tone}
                points={figure.points.length < 2 ? undefined : figure.points}
              />
            ))}
          </div>

          {charts.kpis.caveat === null ? null : (
            <p className="iris-meta" style={{ marginTop: ".75rem" }}>
              {charts.kpis.caveat}
            </p>
          )}
        </div>

        <hr className="iris-rule" />

        <div className="iris-band">
          <div>
            <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
              Meetings, and how many progressed
            </p>
            <PeriodSteps periods={view.periods} />
            <p className="iris-meta" style={{ marginTop: ".75rem" }}>
              The lighter column is every meeting; the solid part is those that reached a follow-up
              or better. Beneath each is the median length — a part-week is compared against the
              same days of the week before, never against a whole one.
            </p>
          </div>

          <div className="iris-band-side">
            <p className="iris-kicker" style={{ marginBottom: ".75rem" }}>
              Every outcome
            </p>
            <OutcomeRing slices={view.outcomes} total={view.meetingCount} size={148} />
            <OutcomeKey slices={view.outcomes} />
            <p className="iris-meta" style={{ marginTop: ".5rem" }}>
              {recorded} of {view.meetingCount} meetings had an outcome recorded.
            </p>
          </div>
        </div>

        <hr className="iris-rule" />

        {/* --- what changed in how meetings are run ----------------------- */}

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
            What changed since {view.context.period.baselineLabel}
          </p>
          <div className="iris-changes">
            {summary.changes.map((change) => (
              <article className="iris-change" key={change.id}>
                <p className="iris-change-label">{change.label}</p>
                <p className="iris-change-delta" data-direction={change.direction}>
                  {change.deltaDisplay}
                </p>
                <p className="iris-change-detail">{change.detail}</p>
                <Link className="iris-action" href={dynamicRoute(change.href)}>
                  Look at it
                </Link>
              </article>
            ))}
          </div>
          <p className="iris-meta" style={{ marginTop: ".75rem" }}>
            How the presentations were run, not how many there were — the counts are above. A
            direction is a statement about two periods at the stated sample size, never a trend and
            never a cause.
          </p>
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />
        </div>

        <hr className="iris-rule" />

        {/* --- when meetings actually happen ------------------------------ */}

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
            When showroom meetings happen
          </p>
          <Heatmap
            rows={charts.activity.rows}
            columns={charts.activity.columns}
            cells={charts.activity.cells}
            caption={`Meetings by weekday and hour, across ${charts.activity.meetingsCounted} presentations.`}
          />
          <p className="iris-meta" style={{ marginTop: ".75rem" }}>
            {charts.activity.busiest === null
              ? "Too few meetings to name a busiest slot."
              : `Busiest: ${charts.activity.busiest.weekday} at ${charts.activity.busiest.hour}, ${charts.activity.busiest.meetings} meetings.`}
            {charts.activity.quietest === null
              ? ""
              : ` Quietest weekday: ${charts.activity.quietest.weekday}, ${charts.activity.quietest.meetings}.`}{" "}
            An empty square is drawn empty rather than faint — a heatmap whose zero looks like a
            small value invents activity that never happened.
          </p>
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED"]} />
        </div>

        <hr className="iris-rule" />

        {/* --- volume over time, and its composition ---------------------- */}

        <div className="iris-band">
          <div>
            <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
              Presentations week by week
            </p>
            <TrendLine
              points={charts.trend.points}
              annotation={charts.trend.annotation}
              valueLabel={charts.trend.valueLabel}
            />
            <p className="iris-meta" style={{ marginTop: ".5rem" }}>
              The marked week is the largest single change in the series. It is pointed at, not
              explained — Observer does not know why it moved.
            </p>
          </div>

          <div className="iris-band-side">
            <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
              What those meetings became
            </p>
            <StackedBars columns={charts.composition.columns} keys={charts.composition.keys} />
          </div>
        </div>

        <hr className="iris-rule" />

        <div>
          <p className="iris-kicker" style={{ marginBottom: "1.25rem" }}>
            How each agent&rsquo;s meetings end
          </p>
          <div className="iris-rings">
            {view.rings.map((ring) => (
              <article className="iris-ring-card" key={ring.agentId}>
                <h3>{ring.name}</h3>
                <OutcomeRing
                  slices={ring.slices}
                  total={ring.meetings}
                  size={124}
                  label={`${ring.name}: ${ring.meetings} meetings`}
                />
                <p className="iris-code" style={{ margin: 0 }}>
                  {Math.round(ring.progressedShare * 100)}% progressed
                </p>
                <OutcomeKey slices={ring.slices} />
                {ring.flag === null ? null : (
                  <p className="iris-ring-flag" data-severity={ring.flag.severity}>
                    {ring.flag.text}
                  </p>
                )}
                <Link className="iris-action" href={dynamicRoute(ring.href)}>
                  How they present
                </Link>
              </article>
            ))}
          </div>
          <p className="iris-meta" style={{ marginTop: "1rem" }}>
            Rings are drawn to the same scale of shares, not of counts, so a busy agent and a quiet
            one are comparable in shape. The count is in the middle of each ring, because a share
            with no denominator is not a figure.
          </p>
          <SourceChips
            sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED", "CRM_OUTCOME_CONTEXT"]}
          />
        </div>

        <hr className="iris-rule" />

        {/* --- what the quietest meetings had in common ------------------- */}

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
            {charts.funnel.cohortLabel}
          </p>
          <Funnel steps={charts.funnel.steps} totalLabel={charts.funnel.comparisonLabel} />
          <p className="iris-meta" style={{ marginTop: ".75rem" }}>
            {charts.funnel.disclaimer}
          </p>
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "CRM_OUTCOME_CONTEXT"]} />
        </div>

        <hr className="iris-rule" />

        <div className="iris-band">
          <div>
            <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
              Longest presentations this period
            </p>
            <RankedBars rows={charts.longestMeetings} />
          </div>
          <div className="iris-band-side">
            <p className="iris-kicker" style={{ marginBottom: ".875rem" }}>
              Presentations given
            </p>
            <RankedBars rows={charts.rankedAgents} />
            <p className="iris-meta" style={{ marginTop: ".5rem" }}>
              How many, not how well. Volume is a workload figure.
            </p>
          </div>
        </div>

        <hr className="iris-rule" />

        {view.findings.map((finding, index) => (
          <Finding key={finding.id} finding={finding} lead={index === 0} />
        ))}

        <Gaps
          gaps={[
            "An outcome is what the agent recorded at the end of the meeting. Meetings with none are excluded from every rate here rather than counted as a failure.",
            "A flag is a prompt to look at how a meeting is run. It is not a ranking, and Observer does not produce one.",
            "The summary cards read the whole dataset over the window you pick. Everything below them reads the period in the bar at the top.",
          ]}
          title="How to read this"
        />
      </section>
    </div>
  );
}
