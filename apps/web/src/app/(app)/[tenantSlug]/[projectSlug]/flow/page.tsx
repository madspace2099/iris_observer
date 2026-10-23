import type { Metadata } from "next";
import Link from "next/link";
import {
  KPI_WINDOWS,
  type KpiWindowId,
  type PeriodPreset,
  DEFAULT_LANGUAGE,
} from "@observer/readmodels";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { maySeeSurface } from "@/lib/routes";
import { presetFrom, withPeriod } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { AssistedSales, FlowLadder } from "@/components/flow";
import { ChangeKpis } from "@/components/flow/ChangeKpis";
import { InfoTip } from "@/components/iris/InfoTip";
import { SpokenVerdict } from "@/components/iris/SpokenVerdict";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { Measure } from "@/showroom/Measure";
import { PresenterBars, seatTones } from "@/components/agents/PresenterBars";
import { AgentName, AgentPortrait, type PortraitSize } from "@/components/agents/Portrait";
import { portraitSources } from "@/lib/portraits/server";
import {
  OUTCOME_KEYS,
  OutcomeKey,
  OutcomeRing,
  PeriodSteps,
  outcomeParts,
} from "@/showroom/charts";
import { Funnel, Heatmap, KpiCard, OutcomeRows, RankedBars, TrendLine } from "@/showroom/charts2";
import { DrawIn } from "@/showroom/DrawIn";
import { RadialHistogram, Sized } from "@/showroom/forms";
import { BubbleLens } from "@/showroom/BubbleLens";
import { FlowRail, type FlowScreen } from "@/components/flow/FlowRail";
import "@/components/flow/sales-flow.css";
import "@/components/flow/flow-screens.css";

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
 * The per-agent outcome mix is one `OutcomeRows` call — the team first, then
 * every presenter in the read model's order, one shared key, ladder order in
 * every row — not a ring per agent. The owner found the stacked columns that
 * stood here unreadable (2026-10-20, ADR-0041): a row gives each bar the
 * card's width, each name its own line, and each group its own whole, so a
 * share in one row compares with the same share in any other. A flag is
 * raised where a pattern is worth a conversation, and it is written as a fact
 * an agent can answer, never a rank.
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
 * Both were dropped: `OutcomeRing` draws the true total in its centre and
 * `OutcomeKey` states every slice's own count. The rate came back with the
 * outcome rows, written by the read model with its own denominator
 * (`ProgressedFigure`: "81% progressed · 29 of 36 recorded"), so the page
 * still rounds nothing.
 *
 * ONE SCREEN AT A TIME (the owner, 2026-10-22, ADR-0059). Every block is a
 * screen (`.flow-screen`) as tall as the viewport under the sticky header, and
 * the page's scroller snaps from one to the next (`flow-screens.css`), so the
 * next chart is never visible under the one being read. Each screen keeps its
 * title, its drawing, the figure it stands on and its source; definitions and
 * method notes stand behind its `i`. Two pairs share a screen: the meetings and
 * every outcome, and the longest presentations and who gave them.
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
  /*
   * A presentation opens its replay only for a role the replay admits (R08-6),
   * read as the meeting register and a unit's page read it. Any other reader
   * gets the rows as text, and an assisted sale opens its unit instead.
   */
  const canOpenMeeting = maySeeSurface(viewer.role, "[meetingId]");
  const { period, window: windowParam } = await searchParams;

  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(period) as PeriodPreset,
    language: DEFAULT_LANGUAGE,
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

  /*
   * A face beside every presenter the page names (ADR-0054): one address per
   * agent, read once here and reused by every row that names them, so the
   * browser fetches each face once. The seat colour tints initials, nothing else.
   */
  const portraits = await portraitSources(view.context.tenant, projectSlug, [
    ...new Set([
      ...charts.lens.agents.map((agent) => agent.id),
      ...view.rings.map((ring) => ring.agentId),
      ...charts.funnel.byAgent.map((agent) => agent.agentId),
      ...charts.longestMeetings.flatMap((row) => (row.agentId === undefined ? [] : [row.agentId])),
    ]),
  ]);
  const tones = seatTones(charts.lens.agents.map((agent) => agent.id));
  const face = (agentId: string, name: string, size: PortraitSize = "row") => (
    <AgentPortrait
      key={agentId}
      name={name}
      src={portraits[agentId] ?? null}
      tone={tones[agentId]}
      size={size}
      alt=""
    />
  );
  const faces = (
    people: readonly { readonly agentId: string; readonly name: string }[],
    size: PortraitSize = "row",
  ) => Object.fromEntries(people.map((p) => [p.agentId, face(p.agentId, p.name, size)]));
  const nameOf = new Map(charts.lens.agents.map((agent) => [agent.id, agent.label]));

  // The team's own counts: its row, and both outcome keys. The key never sums
  // the rows, because the team row is an aggregate of the presenters beside it.
  const teamParts = outcomeParts(view.outcomes);
  // A period with no meeting: one sentence, not a key of noughts over empty bars.
  const noOutcomes = `${view.context.period.label} holds no meeting, so there is no outcome to draw.`;

  const base = `/${tenantSlug}/${projectSlug}/flow`;
  const windowHref = (id: KpiWindowId) => {
    const search = new URLSearchParams();
    if (period !== undefined) search.set("period", period);
    if (id !== "month") search.set("window", id);
    const qs = search.toString();
    return qs === "" ? base : `${base}?${qs}`;
  };

  /*
   * A window is picked on the summary's own screen, the second (ADR-0059), so
   * the page stays where it is: by default Next scrolls to the page's top when
   * that top is out of view, which would throw the reader back to the verdict.
   */
  const windowChips = KPI_WINDOWS.map((w) => (
    <Link
      prefetch={false}
      key={w.id}
      className="iris-chip"
      aria-current={w.id === kpiWindow ? "true" : undefined}
      href={dynamicRoute(windowHref(w.id))}
      scroll={false}
    >
      {w.label}
    </Link>
  ));

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

  /*
   * The screens in the page's order, for the rail (ADR-0059). The deal screens
   * stand only where a CRM delivered deals; without one, the ladder's sentence
   * closes the summary screen rather than holding a screen of its own.
   */
  const crm = view.ladder.source === "crm";
  const screens: readonly FlowScreen[] = [
    { id: "flow-verdict", label: "The verdict" },
    { id: "flow-summary", label: "The summary figures" },
    ...(crm
      ? [
          { id: "flow-ladder", label: "The deal ladder" },
          { id: "flow-stalled", label: "Stalled deals" },
        ]
      : []),
    ...(view.assisted.source === "crm"
      ? [{ id: "flow-assisted", label: "IRIS-assisted sales" }]
      : []),
    { id: "flow-meetings", label: "Meetings, and every outcome" },
    { id: "flow-changes", label: "What changed" },
    { id: "flow-day", label: "The day, hour by hour" },
    { id: "flow-week", label: "When meetings happen" },
    { id: "flow-lens", label: "Nearest a purchase" },
    { id: "flow-trend", label: "Presentations over time" },
    { id: "flow-agents", label: "How each agent’s meetings end" },
    { id: "flow-not-interested", label: "The not-interested group" },
    { id: "flow-presentations", label: "Presentations given" },
    { id: "flow-findings", label: "Findings" },
  ];

  return (
    <div className="iris-one iris-salesflow">
      {/* Keyed as the screens it watches are, so its observer follows them when they are replaced. */}
      <FlowRail key={`rail-${query.period}-${kpiWindow}`} screens={screens} />
      <section className="iris-plane iris-stack">
        {/* The verdict is the first screen, alone (ADR-0048, ADR-0059). */}
        <div className="flow-screen flow-verdict" id="flow-verdict">
          <p className="iris-kicker iris-kicker-measured">
            Sales flow · {view.context.period.label}
          </p>
          <SpokenVerdict
            sentence={view.verdict}
            meetings={view.verdictMeetings}
            locale={view.context.project.locale}
            replay={`${query.period}-${kpiWindow}`}
          />
        </div>

        {/* --- the figures, over a window the reader picks ---------------- */}

        <div
          className="flow-screen d-card"
          id="flow-summary"
          key={`kpi-${query.period}-${kpiWindow}`}
        >
          <div className="iris-window">
            <p className="iris-kicker iris-kicker-measured" style={{ margin: 0 }}>
              Summary over
            </p>
            <div className="iris-mode-strip">{windowChips}</div>
            {/*
             * A phone's way to the same choice: the window in force on one
             * line, the seven folded under it rather than four rows of chips
             * above the figures (`sales-flow.css`).
             */}
            <details className="iris-window-pick">
              <summary className="iris-chip">
                Summary over: {KPI_WINDOWS.find((w) => w.id === kpiWindow)?.label}
                <span aria-hidden="true"> ▾</span>
              </summary>
              <div className="iris-mode-strip">{windowChips}</div>
            </details>
          </div>

          {/*
           * The plan's four groups (R05 item 2), named and defined, and every
           * word of them the read model's. A group nothing measures is printed
           * empty with what is missing, never dropped. "Typical length" stands
           * in the row outside any group. The definition stands behind the `i`
           * beside the name (the owner, 2026-10-20); what is missing does not.
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
                  <header className="iris-titled">
                    <p className="iris-kicker iris-kicker-measured" id={`kpi-group-${item.id}`}>
                      {item.label}
                    </p>
                    <InfoTip id={`kpi-${item.id}`} label={item.label}>
                      {item.definition}
                    </InfoTip>
                  </header>
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

          {/*
           * With no CRM the ladder is one sentence, said here rather than on a
           * screen of its own: a whole screen for a refusal would be an empty
           * frame, and the refusal stays in view.
           */}
          {view.ladder.source === "crm" ? null : (
            <div className="flow-aside">
              <h2 className="iris-kicker iris-kicker-measured">
                The deal ladder, as the CRM states it
              </h2>
              <p className="iris-meta iris-meta-measured">{view.ladder.note}</p>
            </div>
          )}
        </div>

        {/*
         * The order from here is the plan's (v3 :1039, R05's target layout,
         * approved 2026-09-24): the groups above, then the current pipeline,
         * stalled deals, and the details last. IRIS-assisted sales stay with the
         * deal blocks beside which they already stood. The plan's first-showing-
         * to-sale block is not built (P2-06 is blocked), and Cycle time says so.
         */}
        {/*
         * The deal ladder is the CRM's (ADR-0021). It is drawn only from deals a
         * connector delivered, every rung verified because the CRM stated it.
         * The note's own figures stay in view (the denominators the rungs stand
         * on); its explanation is behind the `i`.
         */}
        {view.ladder.source === "crm" ? (
          <div className="flow-screen d-card" id="flow-ladder">
            <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
              <h2 className="iris-kicker iris-kicker-measured">
                The deal ladder, as the CRM states it
              </h2>
              <InfoTip id="deal-ladder" label="the deal ladder">
                {view.ladder.note}
              </InfoTip>
            </header>
            <DrawIn kind="sweep">
              <FlowLadder
                language={view.context.language}
                stages={view.ladder.stages.map((stage) => ({ ...stage, meta: stage.daysDisplay }))}
                noun="deals"
              />
            </DrawIn>
            <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
              {view.ladder.total}{" "}
              {view.ladder.total === 1 ? "deal as it stands" : "deals as they stand"} now
              {view.ladder.unmapped === 0 ? null : ` · ${view.ladder.unmapped} not mapped`}
              {view.ladder.lost === 0 ? null : ` · ${view.ladder.lost} lost`}
            </p>
            <SourceChips sources={["CRM_OUTCOME_CONTEXT"]} measured />
          </div>
        ) : null}

        {/*
         * WHAT IS STUCK, AND FOR HOW LONG (docs/02-views.md §4.1: deals grouped
         * by stage, sorted by time stuck). Time in stage sits on the ladder's
         * own rungs; this is the same deals one by one, longest on their rung
         * first, each opening the unit it is about. The list is ordered by time
         * and never by outcome, and an undated deal is counted beside it rather
         * than drawn at zero days.
         */}
        {view.ladder.source === "crm" ? (
          <div className="flow-screen d-card" id="flow-stalled">
            <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
              <h2 className="iris-kicker iris-kicker-measured">
                Stalled deals, longest on their rung first
              </h2>
              {view.ladder.stalled.length === 0 ? null : (
                <InfoTip id="stalled-deals" label="stalled deals">
                  <p>{view.ladder.stalledNote}</p>
                  <p>
                    Each row is one buyer&rsquo;s deal. A flat can carry several, so a flat sold to
                    one buyer can still hold another buyer&rsquo;s open deal.
                  </p>
                </InfoTip>
              )}
            </header>
            {view.ladder.stalled.length === 0 ? (
              <p className="iris-meta iris-meta-measured">{view.ladder.stalledNote}</p>
            ) : (
              <>
                <RankedBars
                  period={query.period}
                  rows={view.ladder.stalled.map((deal) => ({
                    id: deal.externalId,
                    /*
                     * An open deal, on its flat. The CRM's own key
                     * ("D-mtg_sr0004") read as debug output (review,
                     * 2026-10-23), and the flat alone read as the flat stuck:
                     * one frame below, the same flat stood sold to another
                     * buyer (review, round 9). A suffix on every row told no
                     * row apart; which deals sit on a sold flat is the read
                     * model's to say, and the `i` says a flat can hold both.
                     */
                    label:
                      deal.unitCode === null
                        ? "Open deal on no flat"
                        : `Open deal on ${deal.unitCode}`,
                    sub: `${deal.stageLabel} since ${deal.enteredDisplay}`,
                    value: deal.daysInStage,
                    display: deal.daysDisplay,
                    href: deal.unitHref === null ? null : withPeriod(deal.unitHref, query.period),
                  }))}
                  measured
                  // R05 item 8. No row carries a denominator; the count sits in the note below.
                  collapseAfter={5}
                  tone="late"
                />
                {/*
                 * The list's denominator stays in view, and so do the open
                 * deals it cannot place; the rest is behind the `i`.
                 */}
                <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
                  {view.ladder.stalled.length} of {view.ladder.open} open{" "}
                  {view.ladder.open === 1 ? "deal" : "deals"}
                  {view.ladder.undated === 0
                    ? null
                    : ` · ${String(view.ladder.undated)} with no stage date`}
                </p>
                <SourceChips sources={["CRM_OUTCOME_CONTEXT"]} measured />
              </>
            )}
          </div>
        ) : null}

        {/*
         * IRIS-ASSISTED SALES (ADR-0039). Drawn only where a CRM is connected,
         * for the ladder's reason: no deal, no sale to place against a showing.
         * The card is the component's own; the screen is its frame.
         */}
        {view.assisted.source === "crm" ? (
          <div className="flow-screen" id="flow-assisted">
            <AssistedSales
              assisted={view.assisted}
              period={query.period}
              canOpen={canOpenMeeting}
              irisLedHref={`${base}/iris-led`}
            />
          </div>
        ) : null}

        {/*
         * THE MEETINGS AND EVERY OUTCOME, ONE SCREEN (the owner, 2026-10-22,
         * ADR-0059): they were two cards side by side (ADR-0052) and are now one
         * card, each half keeping its own title. Side by side the steps fill
         * the height the ring sets; stacked, each is its own height.
         */}
        <div
          className="flow-screen d-card iris-band iris-band-even flow-pair"
          id="flow-meetings"
          key={`steps-${query.period}`}
        >
          <div className="iris-steps-card">
            <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
              <h2 className="iris-kicker iris-kicker-measured">
                Meetings, and how many progressed
              </h2>
              {view.periods.some((p) => p.inPeriod) ? (
                <InfoTip id="meetings-progressed" label="meetings, and how many progressed">
                  The lighter column is every meeting; the solid part is those that reached a
                  follow-up or better. Beneath each is the median length — a part-week is compared
                  against the same days of the week before, never against a whole one.
                </InfoTip>
              ) : null}
            </header>
            {view.periods.some((p) => p.inPeriod) ? (
              <PeriodSteps periods={view.periods} />
            ) : (
              /* Six columns of "not in this period" would be a chart with nothing on it. */
              <p className="iris-meta iris-meta-measured">
                Today, this week and this month count back from today, and{" "}
                {view.context.period.label.toLowerCase()} holds none of them.
                {view.meetingCount === 0
                  ? null
                  : ` Its ${view.meetingCount} ${view.meetingCount === 1 ? "meeting is" : "meetings are"} counted by outcome beside this.`}
              </p>
            )}
          </div>

          <div className="iris-band-side">
            <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".75rem" }}>
              Every outcome
            </h2>
            <div className="iris-ring-hero">
              <OutcomeRing slices={view.outcomes} total={view.meetingCount} size={248} measured />
              <OutcomeKey slices={view.outcomes} />
            </div>
          </div>
        </div>

        {/* --- what changed in how meetings are run ----------------------- */}

        <div className="flow-screen d-card" id="flow-changes">
          {/*
           * The title and its `i` are the read model's words, so they name the
           * comparison the arrows make, and what an arrow does not claim (ADR-0060).
           */}
          <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
            <h2 className="iris-kicker iris-kicker-measured">{summary.kpis.title}</h2>
            <InfoTip id="what-changed" label="what changed">
              <p>{summary.kpis.about}</p>
              {/*
               * The arrows' basis and steps, only where arrows are drawn: a
               * withheld window's reason stands in view (`ChangeKpis`), and a
               * basis for arrows nobody sees described what is not there.
               */}
              {summary.kpis.empty === null && summary.kpis.withheld === null ? (
                <p>{summary.kpis.basis}</p>
              ) : null}
            </InfoTip>
          </header>
          {/*
           * A SCREEN OF FIGURES (ADR-0060): the three that stood here, and what
           * else the showroom measures, each against the same figure 7 days
           * earlier. A screen without arrows says why once, in the read model's words.
           */}
          <ChangeKpis kpis={summary.kpis} period={query.period} />

          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} measured />
        </div>

        {/* --- when meetings actually happen ------------------------------ */}

        {/*
         * THE DAY AS A CLOCK FACE (gallery D, ported 2026-10-20).
         *
         * Every meeting of the period by the hour it started, all twenty-four
         * hours and every day together, counted in the weekday grid's own pass
         * (`ActivityMatrix.day`) so the two cannot disagree. It reads the
         * period, never `?window`, so it is keyed on the period alone. The dial
         * carries its total; the busiest hour is the one line beside it, and
         * what the count is and is not stands behind the `i` (ADR-0059).
         */}
        <div className="flow-screen d-card" id="flow-day" key={`day-${query.period}`}>
          <div className="iris-band">
            <div>
              <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
                <h2 className="iris-kicker iris-kicker-measured">The day, hour by hour</h2>
                {charts.activity.day.total === 0 ? null : (
                  <InfoTip id="day" label="the day, hour by hour">
                    <p>
                      {charts.activity.day.total}{" "}
                      {charts.activity.day.total === 1 ? "meeting" : "meetings"},{" "}
                      {view.context.period.label.toLowerCase()}, by the hour each started, in the
                      project&rsquo;s own time zone ({view.context.project.timeZone}).
                    </p>
                    <p>
                      {charts.activity.day.outsideGrid === 0
                        ? "Every one started inside the weekday grid's hours."
                        : `${charts.activity.day.outsideGrid} started outside 09:00–19:00 and are counted only here.`}{" "}
                      A count of when meetings start, not a judgement of which hour sells.
                    </p>
                  </InfoTip>
                )}
              </header>
              {charts.activity.day.total === 0 ? (
                <p className="iris-meta iris-meta-measured">
                  No meeting in this period, so there is no hour to draw.
                </p>
              ) : (
                <DrawIn kind="turn">
                  <div className="dld-centred">
                    <Sized
                      xl={<RadialHistogram data={charts.activity.day} size="xl" />}
                      l={<RadialHistogram data={charts.activity.day} size="l" />}
                    />
                  </div>
                </DrawIn>
              )}
            </div>
            <div className="iris-band-side">
              {/* With no meeting the dial says so; a busiest hour would count nothing. */}
              {charts.activity.day.total === 0 || charts.activity.day.busiest === null ? null : (
                <p className="flow-takeaway">
                  Busiest: {charts.activity.day.busiest.display},{" "}
                  {charts.activity.day.busiest.count} of {charts.activity.day.total}
                  {charts.activity.day.busiest.hours > 1 ? " each" : ""}.
                </p>
              )}
              <Link
                prefetch={false}
                className="iris-action"
                href={dynamicRoute(
                  withPeriod(`/${tenantSlug}/${projectSlug}/meetings`, query.period),
                )}
              >
                Open the meetings
              </Link>
              <SourceChips sources={["IRIS_SHOWROOM_OBSERVED"]} measured />
            </div>
          </div>
        </div>

        {/*
         * The grid's caption carries its denominator; the busiest and quietest
         * slots are its one line, and why an empty square is drawn empty stands
         * behind the `i` (ADR-0059).
         */}
        <div className="flow-screen d-card" id="flow-week" key={`heat-${query.period}`}>
          <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
            <h2 className="iris-kicker iris-kicker-measured">When showroom meetings happen</h2>
            <InfoTip id="week" label="when showroom meetings happen">
              An empty square is drawn empty rather than faint — a heatmap whose zero looks like a
              small value invents activity that never happened.
            </InfoTip>
          </header>
          <Heatmap
            rows={charts.activity.rows}
            columns={charts.activity.columns}
            cells={charts.activity.cells}
            caption={`Meetings by weekday and hour, across ${charts.activity.meetingsCounted} of ${charts.activity.day.total} presentations.`}
          />
          <p className="flow-takeaway" style={{ marginTop: ".75rem" }}>
            {charts.activity.busiest === null
              ? "Too few meetings to name a busiest slot."
              : `Busiest: ${charts.activity.busiest.weekday} at ${charts.activity.busiest.hour}, ${charts.activity.busiest.meetings} meetings.`}
            {charts.activity.quietest === null
              ? ""
              : ` Quietest weekday: ${charts.activity.quietest.weekday}, ${charts.activity.quietest.meetings}.`}
          </p>
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED"]} measured />
        </div>

        {/*
         * EVERY MEETING BY WHO PRESENTED IT AND HOW IT ENDED (gallery D's
         * bubble lens, ported 2026-10-20).
         *
         * The period's recorded meetings, never the lab's rehearsal: one bubble
         * per meeting the rule sizes, in its presenter's seat colour, at the
         * size of the outcome recorded at its end. A bubble opens its meeting
         * only for a reader the replay admits. Keyed on the period, so the lens
         * starts again at the period's last days.
         */}
        <div className="flow-screen d-card" id="flow-lens" key={`lens-${query.period}`}>
          {/*
           * What the bubbles are and what their sizes do not claim stand behind
           * the `i` (the owner, 2026-10-22), in the read model's words. With no
           * bubble drawn the lead is the card's one sentence, and stays in view.
           */}
          <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
            <h2 className="iris-kicker iris-kicker-measured">
              Which meetings are nearest a purchase, and whose
            </h2>
            {charts.lens.meetings.length === 0 ? null : (
              <InfoTip id="lens" label="which meetings are nearest a purchase">
                <p>{charts.lens.lead}</p>
                <p>{charts.lens.note}</p>
              </InfoTip>
            )}
          </header>
          {charts.lens.meetings.length === 0 ? (
            <p className="iris-meta iris-meta-measured">{charts.lens.lead}</p>
          ) : (
            <>
              {/*
               * No count line here: the owner asked for the lead, counts and
               * all, behind the `i` (2026-10-22, ADR-0052 amended). The lens
               * still says what it holds in view ("10 of 10 in view"). It opens
               * on its own seven days, where a bubble is drawn at full size and
               * takes its screen; a month is one press away (ADR-0059, review).
               */}
              <DrawIn kind="bloom">
                <BubbleLens
                  data={{
                    ...charts.lens,
                    meetings: charts.lens.meetings.map((m) => ({
                      ...m,
                      href:
                        canOpenMeeting && m.href !== null ? withPeriod(m.href, query.period) : null,
                    })),
                  }}
                  portraits={portraits}
                />
              </DrawIn>
            </>
          )}
          <p className="ox-sr">{charts.lens.summary}</p>
          {charts.lens.nearest.length === 0 ? null : (
            <div className="iris-lens-nearest">
              <h3>The nearest, latest first</h3>
              <ol>
                {charts.lens.nearest.map((row) => {
                  const label =
                    canOpenMeeting && row.href !== null ? (
                      <Link
                        prefetch={false}
                        href={dynamicRoute(withPeriod(row.href, query.period))}
                      >
                        {row.label}
                      </Link>
                    ) : (
                      <span>{row.label}</span>
                    );
                  return (
                    <li key={row.id}>
                      {row.agentId === undefined ? (
                        label
                      ) : (
                        <AgentName
                          name={nameOf.get(row.agentId) ?? ""}
                          src={portraits[row.agentId] ?? null}
                          tone={tones[row.agentId]}
                          size="chip"
                        >
                          {label}
                        </AgentName>
                      )}
                      <em>{row.value}</em>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {/* The way on and the source on one line, so the screen fits 1280 × 720 (review, round 9). */}
          <div className="flow-foot">
            <Link
              prefetch={false}
              className="iris-action"
              href={dynamicRoute(
                withPeriod(
                  `/${tenantSlug}/${projectSlug}/meetings?outcome=reservation`,
                  query.period,
                ),
              )}
            >
              Every reservation in the register
            </Link>
            <SourceChips sources={["IRIS_SHOWROOM_OBSERVED"]} measured />
          </div>
        </div>

        {/* --- volume over time, and how it ended -------------------------- */}

        {/*
         * ONE BLOCK, TWO DRAWINGS (the owner, 2026-10-22, ADR-0052). "What those
         * meetings became" stood beside "Presentations week by week" and the
         * owner could not tell which meetings "those" were: they are the same
         * presentations, counted week by week on the left and, month by month on
         * the right, by how they ended. One card, one title, each drawing named
         * by its span; the method of both stands behind the one `i`. A refusal
         * (too few weeks, no meeting) stays in view where the drawing would be.
         */}
        <div
          className="flow-screen d-card iris-band iris-band-titled"
          id="flow-trend"
          key={`trend-${query.period}`}
        >
          <header className="iris-titled">
            <h2 className="iris-kicker iris-kicker-measured">
              Presentations over time, and how they ended
            </h2>
            <InfoTip id="over-time" label="presentations over time, and how they ended">
              {charts.trend.annotation === null ? null : (
                <p>
                  The marked week is the largest single change in the series. What moved it is not
                  in this data.
                </p>
              )}
              <p>
                Week by week, only the weeks the period holds whole are drawn: a week still running,
                or one the period cuts, is not set against a full one.
              </p>
              {view.meetingCount === 0 ? null : (
                <p>
                  Month by month, each month is its own whole. Its figure is the share of the
                  month&rsquo;s recorded meetings that reached a follow-up or better; below{" "}
                  {AGENT_MIN_SAMPLE} recorded it states no rate.
                </p>
              )}
            </InfoTip>
          </header>

          <div>
            <h3 className="iris-kicker" style={{ marginBottom: ".75rem" }}>
              Week by week
            </h3>
            {/*
             * Drawn for a screen of its own (ADR-0059): the wide drawing 400
             * units tall, 720 wide, so the line takes most of the screen beside
             * the month rows and still fits a 600px screen at its column's
             * width; a phone's drawing 260, about a third of its screen. Never
             * capped by the screen's height, which scaled its 12px ticks under
             * 12 (review round 1). It was as tall as the month rows beside it
             * (ADR-0052); on a screen of its own the line is the drawing that
             * leads.
             */}
            <TrendLine
              points={charts.trend.points}
              annotation={charts.trend.annotation}
              valueLabel={charts.trend.valueLabel}
              height={260}
              wideHeight={400}
              measured
            />
            {/* The line needs two points; below that the sentence says why there is none. */}
            {charts.trend.points.length < 2 ? (
              <p className="iris-meta iris-meta-measured" style={{ marginTop: ".5rem" }}>
                Too few whole weeks with meetings in this period to draw a line.
              </p>
            ) : null}
          </div>

          <div className="iris-band-side">
            <h3 className="iris-kicker" style={{ marginBottom: ".75rem" }}>
              Month by month, how they ended
            </h3>
            {view.meetingCount === 0 ? (
              <p className="iris-meta iris-meta-measured">{noOutcomes}</p>
            ) : (
              <OutcomeRows
                label="Month by month, how they ended"
                rows={charts.composition.columns}
                keys={charts.composition.keys}
                keyCounts={teamParts}
              />
            )}
          </div>
        </div>

        <div className="flow-screen d-card" id="flow-agents" key={`agents-${query.period}`}>
          <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
            <h2 className="iris-kicker iris-kicker-measured">
              How each agent&rsquo;s meetings end
            </h2>
            <InfoTip id="agents" label="how each agent’s meetings end">
              Every row is its own whole, its parts in ladder order from purchase on the left, so a
              share in one row compares with the same share in any other, presenter to presenter and
              against the team. The hatched part is meetings with no outcome recorded; every rate
              stands on the recorded ones only. Presenters keep the roster&rsquo;s order, not a
              ranking, and a row with fewer than {AGENT_MIN_SAMPLE} recorded meetings states no
              rate.
            </InfoTip>
          </header>
          {view.meetingCount === 0 ? (
            <p className="iris-meta iris-meta-measured">{noOutcomes}</p>
          ) : (
            <OutcomeRows
              label="How each agent’s meetings end, the team first"
              lead={{
                label: "Team",
                total: view.meetingCount,
                parts: teamParts,
                figure: view.team,
              }}
              rows={view.rings.map((ring) => ({
                agentId: ring.agentId,
                label: ring.name,
                total: ring.meetings,
                parts: outcomeParts(ring.slices),
                figure: ring.figure,
              }))}
              keys={OUTCOME_KEYS}
              keyCounts={teamParts}
              // On the name's line, so the bars keep their width and the screen its one panel.
              marks={faces(view.rings, "chip")}
              // Each part opens its meetings in the register (ADR-0053), for a reader it admits.
              open={
                maySeeSurface(viewer.role, "meetings")
                  ? { register: `/${tenantSlug}/${projectSlug}/meetings`, period: query.period }
                  : undefined
              }
            />
          )}
          {/*
           * A flag, one line beside its presenter, and their page one press
           * away. Five cards, three holding only a name and a button, took a
           * sixth of the screen and pushed it past 1280 × 720 (review, round 9);
           * every presenter's page is also a name on the presentations screen.
           */}
          {view.rings.some((ring) => ring.flag !== null) ? (
            <ul className="flow-agent-flags">
              {view.rings.flatMap((ring) =>
                ring.flag === null
                  ? []
                  : [
                      <li key={ring.agentId}>
                        <AgentName
                          name={ring.name}
                          src={portraits[ring.agentId] ?? null}
                          tone={tones[ring.agentId]}
                          size="chip"
                        />
                        <span className="iris-ring-flag" data-severity={ring.flag.severity}>
                          {ring.flag.text}
                        </span>
                        <Link
                          prefetch={false}
                          className="flow-agent-open"
                          href={dynamicRoute(withPeriod(ring.href, query.period))}
                        >
                          {/* The visible words open the name (WCAG 2.5.3), the presenter after them. */}
                          How they present<span className="ox-sr">: {ring.name}</span>
                        </Link>
                      </li>,
                    ],
              )}
            </ul>
          ) : null}
          {/*
            Named where it contributed, and the CRM contributes nothing here,
            connected or not: the rows, the rates and the flags are the outcomes
            agents recorded in the room (as on the Sales Agents roster). Said in
            words since ADR-0052, "deal stages from your CRM" under them was a
            plain false sentence.
          */}
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} measured />
        </div>

        {/* --- what the quietest meetings had in common ------------------- */}

        <div className="flow-screen d-card" id="flow-not-interested" key={`funnel-${query.period}`}>
          {/* The group's count is in its heading and the comparison's under the bands. */}
          <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
            <h2 className="iris-kicker iris-kicker-measured">{charts.funnel.cohortLabel}</h2>
            {charts.funnel.empty !== null || charts.funnel.disclaimer === "" ? null : (
              <InfoTip id="not-interested" label="the not-interested group">
                {charts.funnel.disclaimer}
              </InfoTip>
            )}
          </header>
          {charts.funnel.empty !== null ? (
            <p className="iris-meta iris-meta-measured">{charts.funnel.empty}</p>
          ) : (
            <>
              <Funnel
                data={charts.funnel}
                period={query.period}
                canOpen={maySeeSurface(viewer.role, "meetings")}
                marks={faces(charts.funnel.byAgent)}
              />
              {/* The outcome is the one recorded in the room; the medians and rates are derived from it. */}
              <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} measured />
            </>
          )}
        </div>

        {/*
         * THE LONGEST PRESENTATIONS AND WHO GAVE THEM, ONE SCREEN (the owner,
         * 2026-10-22, ADR-0059): one card, each half keeping its own title.
         * What a count of presentations does not claim stands behind the `i`.
         */}
        <div
          className="flow-screen d-card iris-band iris-band-even flow-pair"
          id="flow-presentations"
          key={`longest-${query.period}`}
        >
          <div>
            <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
              Longest presentations this period
            </h2>
            {/* R05 item 8: a date, a length and a line of context per row, no denominator. */}
            <RankedBars
              period={query.period}
              rows={
                canOpenMeeting
                  ? charts.longestMeetings
                  : charts.longestMeetings.map((row) => ({ ...row, href: null }))
              }
              measured
              collapseAfter={5}
              // Each meeting wears the face of who gave it, the name its line opens with (ADR-0054).
              marks={Object.fromEntries(
                charts.longestMeetings.flatMap((row) =>
                  row.agentId === undefined
                    ? []
                    : [[row.id, face(row.agentId, nameOf.get(row.agentId) ?? "")]],
                ),
              )}
            />
          </div>
          <div className="iris-band-side">
            <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
              <h2 className="iris-kicker iris-kicker-measured">Presentations given</h2>
              <InfoTip id="presentations-given" label="presentations given">
                How many, not how well. Volume is a workload figure.
              </InfoTip>
            </header>
            {/* Never collapsed: every row carries its own denominator, "N of M meetings".
                Each name wears its portrait or initials, in its seat colour (ADR-0054). */}
            <PresenterBars
              period={query.period}
              rows={charts.rankedAgents}
              tenant={view.context.tenant}
              projectSlug={projectSlug}
              seatOrder={charts.lens.agents.map((agent) => agent.id)}
              measured
            />
          </div>
        </div>

        {/* The findings, and how to read the page, are the last screen. */}
        <div className="flow-screen flow-findings" id="flow-findings">
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
               * R05-a those three stand right under the cards. The list of every
               * screen that reads the period was a 75-word line on the video's last
               * screen (review, 2026-10-23); the screens from the meetings on are
               * the ones that do, so the line names where they start. A new screen
               * that does not read the period goes above the meetings, or is named here.
               */
              "The summary cards read the whole dataset over the window you pick. The deal ladder, stalled deals and IRIS-assisted sales read the deals the CRM states, whatever the period. Every screen from the meetings on reads the period in the bar at the top.",
            ]}
            title="How to read this"
          />
        </div>
      </section>
    </div>
  );
}
