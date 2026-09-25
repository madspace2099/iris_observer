import type { Metadata } from "next";
import Link from "next/link";
import { KPI_WINDOWS, type KpiWindowId, type PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom, withPeriod } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { AssistedSales, FlowLadder } from "@/components/flow";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { Measure } from "@/showroom/Measure";
import {
  OUTCOME_STACK_KEYS,
  OutcomeKey,
  OutcomeRing,
  PeriodSteps,
  outcomeStackColumn,
} from "@/showroom/charts";
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
 * The per-agent outcome mix is one `StackedBars` call — Team beside every
 * agent, one shared key, ladder order in every column — not a ring per
 * agent. A ring reads its own mix at a glance but has no way to carry the
 * *ordinal* fact that purchase and not_interested are opposite ends of one
 * ladder, not six unrelated slices; same-band pairs in the current palette
 * are close to indistinguishable by colour precisely because that
 * distinction was handed to position instead, and a ring has no position to
 * hand it to. A bar does: purchase at the base, not_interested at the top,
 * in every column, so the same rung reads at the same height everywhere on
 * the chart. Team is drawn to its own true count, same as any agent, so it
 * reads as a baseline rather than a rank. A flag is raised where a pattern
 * is worth a conversation, and it is written as a fact an agent can answer,
 * never a rank.
 *
 * The summary figures at the top answer to their own control rather than to the
 * page period. How many presentations is a different question today and this
 * year, and making the reader move the whole page to ask the second one is how a
 * dashboard stops being read.
 *
 * Two figures that used to live here were computed by this component rather
 * than by a read model — "N of M had an outcome recorded" (filtering
 * `view.outcomes` and summing in the page) and a per-agent "X% progressed"
 * (rounding `ring.progressedShare`, which the read model states over a
 * DIFFERENT denominator than the "Every outcome" ring above it). ADR-0012
 * forbids the first kind on principle, and the second put two figures that
 * sound like the same claim, computed two different ways, on one screen.
 * Both are dropped rather than replaced: `OutcomeRing` already draws the
 * true total in its centre, `OutcomeKey` already states every slice's own
 * count, and the per-agent bars below state every column's own total the
 * same way, so nothing the reader could learn from either sentence is lost.
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
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "flow", `/${tenantSlug}/${projectSlug}`);
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

  // Shared between the team-vs-agent bars and their key, so the key's totals
  // come from Team's own count rather than summing every column together --
  // Team is an aggregate of the agent columns beside it, not a disjoint one.
  const teamOutcomeColumn = outcomeStackColumn("Team", view.meetingCount, view.outcomes);

  const base = `/${tenantSlug}/${projectSlug}/flow`;
  const windowHref = (id: KpiWindowId) => {
    const search = new URLSearchParams();
    if (period !== undefined) search.set("period", period);
    if (id !== "month") search.set("window", id);
    const qs = search.toString();
    return qs === "" ? base : `${base}?${qs}`;
  };

  /* One summary figure as a card, wherever the groups place it. */
  const kpiCard = (id: string) => {
    const figure = charts.kpis.figures.find((f) => f.id === id);
    return figure === undefined ? null : (
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
    );
  };

  return (
    <div className="iris-one">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker iris-kicker-measured">Sales flow · {view.context.period.label}</p>
        <h1 className="iris-section">{view.verdict}</h1>

        {/* --- the figures, over a window the reader picks ---------------- */}

        <div>
          <div className="iris-window">
            <p className="iris-kicker iris-kicker-measured" style={{ margin: 0 }}>
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

          {/*
           * The plan's four groups (R05 item 2), named and defined, and every
           * word of them the read model's. A group nothing measures is printed
           * empty with what is missing, never dropped. "Typical length" stands
           * in the row outside any group.
           */}
          <div className="iris-kpi-groups" style={{ marginTop: "1rem" }}>
            {[
              ...charts.kpis.groups.filter((group) => group.missing === null),
              ...charts.kpis.ungrouped.map((id) => ({ id, ungrouped: true as const })),
              ...charts.kpis.groups.filter((group) => group.missing !== null),
            ].map((item) =>
              "ungrouped" in item ? (
                <div className="iris-kpi-group" key={item.id}>
                  <div className="iris-kpis">{kpiCard(item.id)}</div>
                </div>
              ) : (
                <div
                  className="iris-kpi-group"
                  key={item.id}
                  role="group"
                  aria-labelledby={`kpi-group-${item.id}`}
                  data-empty={item.missing === null ? undefined : "true"}
                >
                  <p className="iris-kicker iris-kicker-measured" id={`kpi-group-${item.id}`}>
                    {item.label}
                  </p>
                  <p className="iris-meta iris-meta-measured">{item.definition}</p>
                  <div className="iris-kpis">
                    {item.missing === null ? (
                      item.figureIds.map(kpiCard)
                    ) : (
                      <div className="iris-kpi">
                        <p className="iris-kpi-missing">{item.missing}</p>
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>

          {charts.kpis.caveat === null ? null : (
            <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
              {charts.kpis.caveat}
            </p>
          )}
        </div>

        <hr className="iris-rule iris-section-rule" />

        {/*
         * The order from here is the plan's (v3 :1039, R05's target layout,
         * approved 2026-09-24): the groups above, then the current pipeline,
         * stalled deals, and the details last. IRIS-assisted sales stay with the
         * deal blocks beside which they already stood. The plan's first-showing-
         * to-sale block is not built (P2-06 is blocked), and Cycle time says so.
         */}
        {/*
         * The deal ladder is the CRM's (ADR-0021). It is drawn only from deals a
         * connector delivered, every rung verified because the CRM stated it,
         * and where none did the sentence says so rather than six rungs at zero.
         */}
        <div>
          <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
            The deal ladder, as the CRM states it
          </h2>
          {view.ladder.source === "crm" ? (
            <>
              <FlowLadder
                stages={view.ladder.stages.map((stage) => ({ ...stage, meta: stage.daysDisplay }))}
                noun="deals"
              />
              <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
                {view.ladder.note}
              </p>
              <SourceChips sources={["CRM_OUTCOME_CONTEXT"]} measured />
            </>
          ) : (
            <p className="iris-meta iris-meta-measured">{view.ladder.note}</p>
          )}
        </div>

        {/*
         * WHAT IS STUCK, AND FOR HOW LONG (docs/02-views.md §4.1: deals grouped
         * by stage, sorted by time stuck). Time in stage sits on the ladder's
         * own rungs above; this is the same deals one by one, longest on
         * their rung first, each opening the unit it is about. The list is
         * ordered by time and never by outcome, and an undated deal is
         * counted beside it rather than drawn at zero days.
         */}
        {view.ladder.source === "crm" ? (
          <>
            <hr className="iris-rule iris-section-rule" />
            <div>
              <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
                Stalled deals, longest on their rung first
              </h2>
              {view.ladder.stalled.length === 0 ? (
                <p className="iris-meta iris-meta-measured">{view.ladder.stalledNote}</p>
              ) : (
                <>
                  <RankedBars
                    period={query.period}
                    rows={view.ladder.stalled.map((deal) => ({
                      id: deal.externalId,
                      label:
                        deal.unitCode === null
                          ? deal.externalId
                          : `${deal.unitCode} · ${deal.externalId}`,
                      sub: `${deal.stageLabel} since ${deal.enteredDisplay}`,
                      value: deal.daysInStage,
                      display: deal.daysDisplay,
                      href: deal.unitHref === null ? null : withPeriod(deal.unitHref, query.period),
                    }))}
                    measured
                    // R05 item 8. No row carries a denominator; the count sits in the note below.
                    collapseAfter={5}
                  />
                  <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
                    {view.ladder.stalledNote}
                  </p>
                  <SourceChips sources={["CRM_OUTCOME_CONTEXT"]} measured />
                </>
              )}
            </div>
          </>
        ) : null}

        {/*
         * IRIS-ASSISTED SALES (ADR-0039). Drawn only where a CRM is connected,
         * for the ladder's reason: no deal, no sale to place against a showing.
         */}
        {view.assisted.source === "crm" ? (
          <>
            <hr className="iris-rule iris-section-rule" />
            <AssistedSales assisted={view.assisted} period={query.period} />
          </>
        ) : null}

        <hr className="iris-rule iris-section-rule" />

        <div className="iris-band">
          <div>
            <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
              Meetings, and how many progressed
            </h2>
            <PeriodSteps periods={view.periods} />
            <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
              The lighter column is every meeting; the solid part is those that reached a follow-up
              or better. Beneath each is the median length — a part-week is compared against the
              same days of the week before, never against a whole one.
            </p>
          </div>

          <div className="iris-band-side">
            <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".75rem" }}>
              Every outcome
            </h2>
            <OutcomeRing slices={view.outcomes} total={view.meetingCount} size={148} measured />
            <OutcomeKey slices={view.outcomes} />
          </div>
        </div>

        <hr className="iris-rule iris-section-rule" />

        {/* --- what changed in how meetings are run ----------------------- */}

        <div>
          <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
            What changed since {view.context.period.baselineLabel}
          </h2>
          {/*
           * THE POLICY-VERSION GUARD (docs/10-policies.md §1): a comparison
           * across two attribution policies is refused with its reason, never
           * silently drawn. Under one policy the figures are drawn and the
           * version is stated beneath them, so a reader of a printed page
           * knows what "comparable" rested on.
           */}
          {view.context.attribution.comparisonRefusal !== null ? (
            <p className="iris-meta iris-meta-measured">
              This comparison is refused: {view.context.attribution.comparisonRefusal} Both periods
              have to be measured under a compatible attribution policy before their figures can be
              set against each other.
            </p>
          ) : (
            <div className="iris-changes">
              {summary.changes.map((change) => (
                <article className="iris-change" key={change.id}>
                  <p className="iris-change-label">{change.label}</p>
                  <p className="iris-change-delta" data-direction={change.direction}>
                    {change.deltaDisplay}
                  </p>
                  <p className="iris-change-detail">{change.detail}</p>
                  <Link
                    className="iris-action"
                    href={dynamicRoute(withPeriod(change.href, query.period))}
                  >
                    Look at it
                  </Link>
                </article>
              ))}
            </div>
          )}
          <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
            Both periods measured under attribution policy {view.context.attribution.version},
            effective {view.context.attribution.effectiveFrom.slice(0, 10)}.
          </p>
          <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
            How the presentations were run, not how many there were. A direction compares two
            periods at the stated sample size — it is not a trend, and not a cause.
          </p>
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} measured />
        </div>

        <hr className="iris-rule iris-section-rule" />

        {/* --- when meetings actually happen ------------------------------ */}

        <div>
          <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
            When showroom meetings happen
          </h2>
          <Heatmap
            rows={charts.activity.rows}
            columns={charts.activity.columns}
            cells={charts.activity.cells}
            caption={`Meetings by weekday and hour, across ${charts.activity.meetingsCounted} presentations.`}
          />
          <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
            {charts.activity.busiest === null
              ? "Too few meetings to name a busiest slot."
              : `Busiest: ${charts.activity.busiest.weekday} at ${charts.activity.busiest.hour}, ${charts.activity.busiest.meetings} meetings.`}
            {charts.activity.quietest === null
              ? ""
              : ` Quietest weekday: ${charts.activity.quietest.weekday}, ${charts.activity.quietest.meetings}.`}{" "}
            An empty square is drawn empty rather than faint — a heatmap whose zero looks like a
            small value invents activity that never happened.
          </p>
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED"]} measured />
        </div>

        <hr className="iris-rule iris-section-rule" />

        {/* --- volume over time, and its composition ---------------------- */}

        <div className="iris-band">
          <div>
            <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
              Presentations week by week
            </h2>
            <TrendLine
              points={charts.trend.points}
              annotation={charts.trend.annotation}
              valueLabel={charts.trend.valueLabel}
              measured
            />
            <p className="iris-meta iris-meta-measured" style={{ marginTop: ".5rem" }}>
              The marked week is the largest single change in the series. What moved it is not in
              this data.
            </p>
          </div>

          <div className="iris-band-side">
            <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
              What those meetings became
            </h2>
            <StackedBars columns={charts.composition.columns} keys={charts.composition.keys} />
          </div>
        </div>

        <hr className="iris-rule iris-section-rule" />

        <div>
          <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: "1.25rem" }}>
            How each agent&rsquo;s meetings end
          </h2>
          <StackedBars
            columns={[
              teamOutcomeColumn,
              ...view.rings.map((ring) =>
                outcomeStackColumn(ring.name, ring.meetings, ring.slices),
              ),
            ]}
            keys={OUTCOME_STACK_KEYS}
            keyTotals={teamOutcomeColumn.parts}
          />
          <div className="iris-changes" style={{ marginTop: "1rem" }}>
            {view.rings.map((ring) => (
              <article className="iris-change" key={ring.agentId}>
                <p className="iris-change-label">{ring.name}</p>
                {ring.flag === null ? null : (
                  <p className="iris-ring-flag" data-severity={ring.flag.severity}>
                    {ring.flag.text}
                  </p>
                )}
                <Link
                  className="iris-action"
                  href={dynamicRoute(withPeriod(ring.href, query.period))}
                >
                  How they present
                </Link>
              </article>
            ))}
          </div>
          <p className="iris-meta iris-meta-measured" style={{ marginTop: "1rem" }}>
            Each bar is drawn to its own true count, stacked in ladder order &mdash; purchase at the
            base, not_interested at the top &mdash; so the shares within one bar are comparable to
            the shares within any other, agent to agent and against the team.
          </p>
          {/*
            Named where it contributed. A project with no CRM connected has no
            CRM outcome under these figures, and a chip saying otherwise is the
            same lie in miniature as a zero standing in for something unmeasured.
          */}
          <SourceChips
            sources={
              view.context.project.connectedSources.includes("crm")
                ? ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED", "CRM_OUTCOME_CONTEXT"]
                : ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]
            }
            measured
          />
        </div>

        <hr className="iris-rule iris-section-rule" />

        {/* --- what the quietest meetings had in common ------------------- */}

        <div>
          <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
            {charts.funnel.cohortLabel}
          </h2>
          {charts.funnel.empty !== null ? (
            <p className="iris-meta iris-meta-measured">{charts.funnel.empty}</p>
          ) : (
            <>
              <Funnel steps={charts.funnel.steps} totalLabel={charts.funnel.comparisonLabel} />
              <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
                {charts.funnel.disclaimer}
              </p>
              <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "CRM_OUTCOME_CONTEXT"]} measured />
            </>
          )}
        </div>

        <hr className="iris-rule iris-section-rule" />

        <div className="iris-band">
          <div>
            <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
              Longest presentations this period
            </h2>
            {/* R05 item 8: a date, a length and a line of context per row, no denominator. */}
            <RankedBars
              period={query.period}
              rows={charts.longestMeetings}
              measured
              collapseAfter={5}
            />
          </div>
          <div className="iris-band-side">
            <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
              Presentations given
            </h2>
            {/* Never collapsed: every row carries its own denominator, "N of M meetings". */}
            <RankedBars period={query.period} rows={charts.rankedAgents} measured />
            <p className="iris-meta iris-meta-measured" style={{ marginTop: ".5rem" }}>
              How many, not how well. Volume is a workload figure.
            </p>
          </div>
        </div>

        <hr className="iris-rule iris-section-rule" />

        {view.findings.map((finding, index) => (
          <Finding
            key={finding.id}
            finding={finding}
            period={query.period}
            lead={index === 0}
            measured
          />
        ))}

        <Gaps
          gaps={[
            "An outcome is what the agent recorded at the end of the meeting. Meetings with none are excluded from every rate here rather than counted as a failure.",
            "A flag is a prompt to look at how a meeting is run. It is not a ranking.",
            /*
             * Measured on 2026-09-25, rendering the page under four periods: the
             * three deal blocks were byte-identical under all four, and every
             * section listed as reading the period moved with it. "Everything
             * below them reads the period" was false for three blocks, and since
             * R05-a those three stand right under the cards. A new section is
             * added to one list or the other, not claimed by either.
             */
            "The summary cards read the whole dataset over the window you pick. The deal ladder, stalled deals and IRIS-assisted sales do not read the period either: they read the deals the CRM states, whatever the period. These read the period in the bar at the top: meetings and how many progressed, every outcome, what changed, when meetings happen, presentations week by week, what those meetings became, how each agent’s meetings end, the not-interested group, the longest presentations, presentations given, and the findings.",
          ]}
          title="How to read this"
        />
      </section>
    </div>
  );
}
