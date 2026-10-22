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
import { InfoTip } from "@/components/iris/InfoTip";
import { SpokenVerdict } from "@/components/iris/SpokenVerdict";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { Measure } from "@/showroom/Measure";
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
        <SpokenVerdict
          sentence={view.verdict}
          meetings={view.verdictMeetings}
          locale={view.context.project.locale}
          replay={`${query.period}-${kpiWindow}`}
        />

        {/* --- the figures, over a window the reader picks ---------------- */}

        <div className="d-card" key={`kpi-${query.period}-${kpiWindow}`}>
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
         * A chart region like the others on the page, so it wears their card.
         */}
        <div className="d-card">
          <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
            <h2 className="iris-kicker iris-kicker-measured">
              The deal ladder, as the CRM states it
            </h2>
            {view.ladder.source === "crm" ? (
              <InfoTip id="deal-ladder" label="the deal ladder">
                {view.ladder.note}
              </InfoTip>
            ) : null}
          </header>
          {view.ladder.source === "crm" ? (
            <>
              <FlowLadder
                language={view.context.language}
                stages={view.ladder.stages.map((stage) => ({ ...stage, meta: stage.daysDisplay }))}
                noun="deals"
              />
              {/*
               * The note's own figures stay in view (the denominators the rungs
               * stand on); its explanation is behind the `i`.
               */}
              <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
                {view.ladder.total}{" "}
                {view.ladder.total === 1 ? "deal as it stands" : "deals as they stand"} now
                {view.ladder.unmapped === 0 ? null : ` · ${view.ladder.unmapped} not mapped`}
                {view.ladder.lost === 0 ? null : ` · ${view.ladder.lost} lost`}
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
            <div className="d-card">
              <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
                <h2 className="iris-kicker iris-kicker-measured">
                  Stalled deals, longest on their rung first
                </h2>
                {view.ladder.stalled.length === 0 ? null : (
                  <InfoTip id="stalled-deals" label="stalled deals">
                    {view.ladder.stalledNote}
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
          </>
        ) : null}

        {/*
         * IRIS-ASSISTED SALES (ADR-0039). Drawn only where a CRM is connected,
         * for the ladder's reason: no deal, no sale to place against a showing.
         */}
        {view.assisted.source === "crm" ? (
          <>
            <hr className="iris-rule iris-section-rule" />
            <AssistedSales
              assisted={view.assisted}
              period={query.period}
              canOpen={canOpenMeeting}
              irisLedHref={`${base}/iris-led`}
            />
          </>
        ) : null}

        <hr className="iris-rule iris-section-rule" />

        {/*
         * The steps and the ring share one row (the owner, 2026-10-22,
         * ADR-0052): the ring large with its key beside it, and the steps
         * filling the height the ring sets rather than leaving a black field
         * under six short columns.
         */}
        <div className="iris-band iris-band-even" key={`steps-${query.period}`}>
          <div className="d-card iris-steps-card">
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

          <div className="iris-band-side d-card">
            <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".75rem" }}>
              Every outcome
            </h2>
            <div className="iris-ring-hero">
              <OutcomeRing slices={view.outcomes} total={view.meetingCount} size={248} measured />
              <OutcomeKey slices={view.outcomes} />
            </div>
          </div>
        </div>

        <hr className="iris-rule iris-section-rule" />

        {/* --- what changed in how meetings are run ----------------------- */}

        <div>
          {/*
           * The policy the two periods were measured under, and what a direction
           * does not claim, stand behind the `i`; a refusal never does.
           */}
          <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
            <h2 className="iris-kicker iris-kicker-measured">
              What changed since {view.context.period.baselineLabel}
            </h2>
            <InfoTip id="what-changed" label="what changed">
              {/* Only true when nothing was refused; a refusal states its own reason. */}
              {view.context.attribution.comparisonRefusal === null ? (
                <p>
                  Both periods measured under attribution policy {view.context.attribution.version},
                  effective {view.context.attribution.effectiveFrom.slice(0, 10)}.
                </p>
              ) : null}
              <p>
                How the presentations were run, not how many there were. A direction compares two
                periods at the stated sample size — it is not a trend, and not a cause.
              </p>
            </InfoTip>
          </header>
          {/*
           * THE POLICY-VERSION GUARD (docs/10-policies.md §1): a comparison
           * across two attribution policies is refused with its reason, never
           * silently drawn. Under one policy the figures are drawn and the
           * version is stated behind the `i` above them, so a reader can see
           * what "comparable" rested on.
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
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} measured />
        </div>

        <hr className="iris-rule iris-section-rule" />

        {/* --- when meetings actually happen ------------------------------ */}

        {/*
         * THE DAY AS A CLOCK FACE (gallery D, ported 2026-10-20).
         *
         * Every meeting of the period by the hour it started, all twenty-four
         * hours and every day together, counted in the weekday grid's own pass
         * (`ActivityMatrix.day`) so the two cannot disagree. It reads the
         * period, never `?window`, so it is keyed on the period alone.
         */}
        <div className="d-card" key={`day-${query.period}`}>
          <div className="iris-band">
            <div>
              <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
                The day, hour by hour
              </h2>
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
              {/* With no meeting the dial says so; these would count nothing. */}
              {charts.activity.day.total === 0 ? null : (
                <>
                  <p className="iris-meta iris-meta-measured">
                    {charts.activity.day.total}{" "}
                    {charts.activity.day.total === 1 ? "meeting" : "meetings"},{" "}
                    {view.context.period.label.toLowerCase()}, by the hour each started, in the
                    project&rsquo;s own time zone ({view.context.project.timeZone}).
                  </p>
                  {charts.activity.day.busiest === null ? null : (
                    <p className="iris-meta iris-meta-measured">
                      Busiest: {charts.activity.day.busiest.display},{" "}
                      {charts.activity.day.busiest.count} of {charts.activity.day.total}
                      {charts.activity.day.busiest.hours > 1 ? " each" : ""}.
                    </p>
                  )}
                  <p className="iris-meta iris-meta-measured">
                    {charts.activity.day.outsideGrid === 0
                      ? "Every one started inside the weekday grid's hours below."
                      : `${charts.activity.day.outsideGrid} started outside 09:00–19:00 and are counted only here.`}{" "}
                    A count of when meetings start, not a judgement of which hour sells.
                  </p>
                </>
              )}
              <Link
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

        <div className="d-card" key={`heat-${query.period}`}>
          <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
            When showroom meetings happen
          </h2>
          <Heatmap
            rows={charts.activity.rows}
            columns={charts.activity.columns}
            cells={charts.activity.cells}
            caption={`Meetings by weekday and hour, across ${charts.activity.meetingsCounted} of ${charts.activity.day.total} presentations.`}
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
        <div className="d-card" key={`lens-${query.period}`}>
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
            <DrawIn kind="bloom">
              <BubbleLens
                initialSpan="month"
                data={{
                  ...charts.lens,
                  meetings: charts.lens.meetings.map((m) => ({
                    ...m,
                    href:
                      canOpenMeeting && m.href !== null ? withPeriod(m.href, query.period) : null,
                  })),
                }}
              />
            </DrawIn>
          )}
          <p className="ox-sr">{charts.lens.summary}</p>
          {charts.lens.nearest.length === 0 ? null : (
            <div className="iris-lens-nearest">
              <h3>The nearest, latest first</h3>
              <ol>
                {charts.lens.nearest.map((row) => (
                  <li key={row.id}>
                    {canOpenMeeting && row.href !== null ? (
                      <Link href={dynamicRoute(withPeriod(row.href, query.period))}>
                        {row.label}
                      </Link>
                    ) : (
                      <span>{row.label}</span>
                    )}
                    <em>{row.value}</em>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <Link
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

        <hr className="iris-rule iris-section-rule" />

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
        <div className="d-card iris-band iris-band-titled" key={`trend-${query.period}`}>
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
            <TrendLine
              points={charts.trend.points}
              annotation={charts.trend.annotation}
              valueLabel={charts.trend.valueLabel}
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
                label="What those meetings became, month by month"
                rows={charts.composition.columns}
                keys={charts.composition.keys}
                keyCounts={teamParts}
              />
            )}
          </div>
        </div>

        <hr className="iris-rule iris-section-rule" />

        <div className="d-card" key={`agents-${query.period}`}>
          <header className="iris-titled" style={{ marginBottom: "1.25rem" }}>
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
                label: ring.name,
                total: ring.meetings,
                parts: outcomeParts(ring.slices),
                figure: ring.figure,
              }))}
              keys={OUTCOME_KEYS}
              keyCounts={teamParts}
            />
          )}
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
          {/*
            Named where it contributed, and the CRM contributes nothing here,
            connected or not: the rows, the rates and the flags are the outcomes
            agents recorded in the room (as on the Sales Agents roster). Said in
            words since ADR-0052, "deal stages from your CRM" under them was a
            plain false sentence.
          */}
          <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} measured />
        </div>

        <hr className="iris-rule iris-section-rule" />

        {/* --- what the quietest meetings had in common ------------------- */}

        <div className="d-card" key={`funnel-${query.period}`}>
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
              <Funnel steps={charts.funnel.steps} totalLabel={charts.funnel.comparisonLabel} />
              <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "CRM_OUTCOME_CONTEXT"]} measured />
            </>
          )}
        </div>

        <hr className="iris-rule iris-section-rule" />

        <div className="iris-band" key={`longest-${query.period}`}>
          <div className="d-card">
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
            />
          </div>
          <div className="iris-band-side d-card">
            <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
              Presentations given
            </h2>
            {/* Never collapsed: every row carries its own denominator, "N of M meetings". */}
            <RankedBars period={query.period} rows={charts.rankedAgents} measured tone="volume" />
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
            "The summary cards read the whole dataset over the window you pick. The deal ladder, stalled deals and IRIS-assisted sales do not read the period either: they read the deals the CRM states, whatever the period. These read the period in the bar at the top: meetings and how many progressed, every outcome, what changed, when meetings happen, the day hour by hour, every meeting by who presented it and how it ended, presentations over time and how they ended, how each agent’s meetings end, the not-interested group, the longest presentations, presentations given, and the findings.",
          ]}
          title="How to read this"
        />
      </section>
    </div>
  );
}
