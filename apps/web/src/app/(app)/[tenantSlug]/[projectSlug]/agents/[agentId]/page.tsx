import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError, NotPermittedError, type PeriodPreset } from "@observer/readmodels";

import { requireSurface } from "@/lib/authz";
import { maySeeSurface } from "@/lib/routes";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";
import {
  ChartFrame,
  DataTable,
  Evidence,
  Figure,
  FindingList,
  PageHead,
  Sample,
  Sources,
  Synthetic,
  Tally,
  TallyItem,
  Tier,
  Unavailable,
  type DataColumn,
  type DataRow,
} from "@/components/product";
import { MeetingRegister, Missing, ShareFigure, StageFunnel } from "@/components/agents";
import { OutcomeKey, OutcomeRing, PairedRates } from "@/showroom/charts";
import { SectionSequence, TrendLine } from "@/showroom/charts2";

export const metadata: Metadata = { title: "Sales agent" };

/**
 * ONE SALES AGENT.
 *
 * The roster names colleagues beside one another; this is one of them on their
 * own — how they present, where their meetings go, and what sample stands
 * behind every figure.
 *
 * ## The boundary this inherits, unchanged
 *
 * ADR-0029 reversed the rule that hid colleagues from each other and was
 * precise about what it did not open. The boundary is the PROJECT, not the
 * role: two agents assigned to one project may read one another's working
 * figures, and an agent on another project may read neither, whether by this
 * route, the read model, a tool call or Ask. The IRIS rating stays
 * MADSPACE-only — it is feedback on the software, not a colleague's figure —
 * and it is not on this page at all.
 *
 * None of that is enforced by this page choosing what to render. It is enforced
 * by `requireSurface` above and by the project context the repository applies
 * to every read, which is why this route may carry the same role list as the
 * roster it is opened from.
 *
 * ## Association, at every point, and never anything stronger
 *
 * Every figure here is a thing that was recorded beside another thing that was
 * recorded. The funnel is a sequence of observed states and its label reads
 * "of", which is a fraction. The buyer-interest rows are rates over the agent's
 * own meetings set against the same rate across the project, and the read model
 * is explicit that they do not sum to one and are not a pie — a meeting that
 * showed a one-room flat and a four-room penthouse counts in both. Nothing on
 * this page says that a habit produced an outcome, at any sample size
 * (ADR-0010).
 *
 * ## What the sample floor does to this screen
 *
 * `AgentDetailView` carries `sampleSize`, `minimumSampleSize` and
 * `belowMinimum` on the VIEW rather than only on each metric, and that is the
 * shape of the rule: below the floor the suppression is a property of the
 * *page*. The read model already returns every rate as an `insufficient`
 * `MetricValue`, so `Figure` draws the raw figure with its shortfall and no
 * comparison. This file adds the one thing a `MetricValue` cannot express — the
 * series over time is not drawn at all, since a line is read as a direction
 * whatever the caption says, and a direction is a trend.
 *
 * Kingsford Yard is the project that forces this: three weeks live, seven
 * meetings. Opened there, this page shows counts, the absences the read model
 * states, no trend and no verdict.
 */
export default async function AgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string; agentId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug, agentId } = await params;
  const root = `/${tenantSlug}/${projectSlug}`;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "[agentId]", root);
  const search = await searchParams;

  const period = presetFrom(search.period) as PeriodPreset;

  /*
   * A 404 rather than an empty page.
   *
   * `getAgentDetail` returns null — and the repository raises — for somebody who
   * held no meeting on this project in this period. That is not a refusal and
   * not a blank surface: the reader asked for a person who does not present on
   * this development, and the honest answer says so without confirming whether
   * they exist on a development the reader cannot see. `NotPermittedError` is
   * caught with it for the same reason: a grant the viewer does not hold must
   * not be distinguishable from a person who is not there.
   */
  let view;
  try {
    view = await repository.getAgentDetail({ viewer, tenantSlug, projectSlug, period }, agentId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof NotPermittedError) notFound();
    throw error;
  }

  const periodLabel = view.context.period.label;
  const meetingsHref = `${root}/meetings?agent=${view.agentId}`;

  /*
   * The ten-second answer, and the two things it may be.
   *
   * Below the floor it is the suppression sentence: how many meetings, how far
   * short, and what the page will therefore not say. Above it, the strongest
   * association the read model produced about how this person presents. Where
   * there is neither, the head carries no answer rather than an invented one —
   * a confident sentence with nothing behind it is the failure the whole
   * absence vocabulary exists to prevent.
   */
  const answer =
    view.suppressionNote ??
    /* The habit's own floor, on the timed set: the read model's reason, not the habit. */
    view.profile.signatureNote ??
    (view.profile.signature === null
      ? null
      : `${view.name} spends ${view.profile.signature.overIndex.toFixed(1)}× the team's share of presentation time in ${view.profile.signature.label}, across the ${view.profile.timedMeetings} of ${view.sampleSize} meetings the source could time end to end.`);

  /*
   * WHETHER THE PAGE HAS AN EVIDENCE REFERENCE TO OFFER AT ALL.
   *
   * `Evidence` states "No evidence" in words for a null reference, which is
   * exactly right beside one claim and wrong thirteen times down one screen —
   * the visual autopsy's defect is a repeated absence, whatever the absence is.
   * So the line is drawn per figure only where a reference exists, and a region
   * where none does says so once, below the figures.
   *
   * The agent read models return `evidence: null` on every metric in
   * `activity`, `followUp`, `recordedOutcomes` and `funnel`, even though the
   * view itself carries one. That is reported as a gap rather than papered over
   * with a reference this page would have had to invent.
   */
  const activityHasEvidence = view.activity.some((metric) => metric.evidence !== null);
  const outcomesHaveEvidence = view.recordedOutcomes.some((o) => o.metric.evidence !== null);
  const funnelHasEvidence = view.funnel.some((step) => step.metric.evidence !== null);

  /*
   * THE SHARE COLUMN EXISTS ONLY WHERE A SHARE MAY BE READ.
   *
   * Below the floor every row of this table would carry the same shortfall
   * sentence — "14 of 20 meetings needed", six times, in one column — which is
   * the repeated absence again in a third costume. The column is dropped
   * instead and the region says why once. The counts stay: "7 of 14" is a
   * complete figure with its own denominator and needs no rate beside it.
   */
  const unitColumns: readonly DataColumn[] = [
    { key: "unit", label: "Unit" },
    { key: "meetings", label: "Meetings that opened it", numeric: true },
    ...(view.belowMinimum
      ? []
      : [{ key: "share", label: "Share of their meetings", numeric: true }]),
    { key: "favourites", label: "Shortlisted", numeric: true },
  ];

  const unitRows: readonly DataRow[] = view.commonUnits.map((unit) => ({
    key: unit.unitCode,
    cells: {
      unit: <Link href={dynamicRoute(withPeriod(unit.href, period))}>{unit.unitCode}</Link>,
      meetings: (
        <span className="ox-value">
          <span className="ox-figure">{unit.meetings}</span>
          <span className="ox-of">of {view.sampleSize}</span>
        </span>
      ),
      share: (
        <ShareFigure
          share={unit.share}
          sampleSize={view.sampleSize}
          minimumSampleSize={view.minimumSampleSize}
          locale={view.context.project.locale}
          qualifier="of their meetings"
        />
      ),
      favourites:
        unit.favourites === 0 ? (
          <Missing what="Never shortlisted" />
        ) : (
          <span className="ox-value">
            <span className="ox-figure">{unit.favourites}</span>
          </span>
        ),
    },
  }));

  return (
    <div className="ox-page">
      <PageHead
        kicker={`${view.context.project.name} · Sales Agents · ${periodLabel}`}
        title={view.name}
        answer={answer}
        lede={
          <>
            Presenting for {view.organisationName}. Every figure below is what was recorded beside
            something else that was recorded, at the sample printed with it. There is no score on
            this page and no field the read model could put one in.
          </>
        }
        crumbs={[
          { label: view.context.project.name, href: `${root}/ask` },
          { label: "Sales Agents", href: `${root}/agents` },
          { label: view.name },
        ]}
        aside={
          <>
            <Synthetic />
            <Sample n={view.sampleSize} noun="meetings" />
            <Evidence evidence={view.evidence} period={period} />
          </>
        }
        period={period}
      />

      <div className="ox-body">
        {/*
         * No page-level "the CRM is not connected" any more.
         *
         * A band used to stand here saying that without a CRM this page held
         * figures that could not exist — follow-ups recorded, two funnel
         * stages, the outcome-recorded rate. Every one of those is the outcome
         * the agent recorded in the room, which the read model now carries on
         * every project; nothing on this page is withheld for want of a CRM,
         * so there is nothing for a band to explain.
         */}

        {/* --- ACTIVITY, on the measured ground ------------------------- */}

        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">Activity in this period</h2>
              <p className="ox-section-note">
                Counts, a median and a coverage share. A count is never suppressed: the sample size
                is the figure a reader most needs when it is small.
              </p>
            </div>

            <Tally>
              {view.activity.map((metric) => (
                <TallyItem
                  key={metric.metricId}
                  label={metric.label}
                  value={<Figure value={metric} />}
                  evidence={
                    metric.evidence === null ? null : (
                      <Evidence evidence={metric.evidence} period={period} />
                    )
                  }
                />
              ))}
            </Tally>

            {activityHasEvidence ? null : (
              <p className="ox-section-note">
                None of these figures carries an evidence reference: the read model computes them
                from the period&rsquo;s sessions without recording a drill-down. The sessions
                themselves are the register at the foot of this page.
              </p>
            )}

            {/* --- follow-up, and the half nobody records ---------------- */}

            <p className="ox-subhead">Follow-up</p>

            <Tally>
              <TallyItem
                label={view.followUp.recorded.label}
                value={<Figure value={view.followUp.recorded} />}
                evidence={
                  view.followUp.recorded.evidence === null ? null : (
                    <Evidence evidence={view.followUp.recorded.evidence} period={period} />
                  )
                }
              />
              <TallyItem
                label={view.followUp.completed.label}
                value={<Figure value={view.followUp.completed} />}
              />
            </Tally>

            {/*
             * The second of the page's two absences, and it belongs to this
             * region alone.
             *
             * "Recorded as needed" and "actually done" are two questions, and
             * the second has no source at all — not even a connected CRM
             * answers it, since Observer holds the meeting and the activity
             * after it belongs elsewhere. Drawn on every project: the first
             * figure now stands everywhere, so the second's absence has to be
             * stated everywhere, or a reader takes the reminder for the call.
             *
             * No action is offered. Connecting a CRM belongs to the MADSPACE
             * administration surface and is not this reader's to do, and a
             * control that looks ready and does nothing is forbidden.
             */}
            <Unavailable
              what="Follow-ups completed"
              why={
                view.followUp.completed.message ?? "No source records whether a follow-up happened."
              }
              action={null}
              period={period}
            />

            <p className="ox-section-note">{view.followUp.note}</p>

            {/*
             * THE OUTCOMES THEY RECORDED, BY THEIR COMMERCIAL WORD.
             *
             * This subhead read "Verified outcomes" over a count of the
             * agent's own entries, said a system of record stood behind it,
             * and drew the region only where a CRM was connected — the
             * register's removed "Verified outcome" column, on a second
             * surface. No deal is linked to a meeting (ADR-0039), so nothing
             * here can be confirmed outside the showroom; the replay says the
             * same of the same fact, and this says it in the same words.
             */}

            <p className="ox-subhead">Outcomes they recorded</p>

            <Tally>
              {view.recordedOutcomes.map((outcome) => (
                <TallyItem
                  key={outcome.outcome}
                  label={outcome.label}
                  value={<Figure value={outcome.metric} />}
                  evidence={
                    <>
                      <Tier tier={outcome.tier} />
                      <Sources sources={outcome.sources} />
                      {outcome.metric.evidence === null ? null : (
                        <Evidence evidence={outcome.metric.evidence} period={period} />
                      )}
                    </>
                  }
                />
              ))}
            </Tally>

            <p className="ox-section-note">
              What {view.name} entered on the showroom&rsquo;s outcome widget as a purchase or a
              reservation. It is the agent&rsquo;s own record — not a reservation and not a sale,
              and no CRM or other system of record has confirmed it: Observer links no deal to a
              meeting. Kept apart from the outcome mix below, which is every outcome including the
              ones nobody recorded. The tier on each says how strong the claim is; the source says
              what kind of fact it rests on.
              {outcomesHaveEvidence
                ? ""
                : " Neither figure carries a drill-down reference; the meetings behind them are in the register at the foot of this page."}
            </p>
          </div>
        </div>

        {/* --- THE FUNNEL ----------------------------------------------- */}

        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">Where their meetings reached</h2>
              <p className="ox-section-note">
                Five states, each a count of meetings that reached it, with the count it is a
                fraction of beside it. A stage no source can answer draws no bar at all — a track at
                zero standing in for something unmeasured is the reading this treatment exists to
                prevent.
              </p>
            </div>

            <StageFunnel
              steps={view.funnel}
              period={period}
              label={`Stages ${view.name}'s meetings reached`}
            />

            <p className="ox-section-note">
              Nothing here says that one stage produced the next. Each figure is a count of meetings
              that reached a state, set against the count it is a fraction of.
              {funnelHasEvidence
                ? ""
                : " No stage carries a drill-down reference; the meetings behind them are in the register at the foot of this page."}
            </p>
          </div>
        </div>

        {/* --- THE SHAPES, on the ground charts belong to --------------- */}

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">How they present, and what it met</h2>
          </div>

          <div className="ox-cols" data-cols="2">
            <ChartFrame
              title="How their meetings ended"
              period={periodLabel}
              note="Parts of one whole: every meeting of theirs in the period, by the outcome the agent recorded at the end of it. The count in the middle is the denominator. Meetings with no outcome recorded are a slice of their own rather than being folded into one that says something happened."
              summary={`Outcome mix across ${view.sampleSize} meetings: ${view.outcomeMix.map((slice) => `${slice.label} ${slice.count}`).join(", ")}.`}
            >
              <OutcomeRing
                slices={view.outcomeMix}
                total={view.sampleSize}
                size={148}
                label={`${view.name}: ${view.sampleSize} meetings`}
              />
              <OutcomeKey slices={view.outcomeMix} />
            </ChartFrame>

            {/*
             * THE COMPARISON IS THE THING THE FLOOR SUPPRESSES, NOT THE FIGURE.
             *
             * A paired rate sets this person's behaviour against the project's,
             * which is a judgement about how they work; over fourteen meetings
             * it is a judgement drawn from fourteen meetings. Below the floor
             * the same facts are shown as what they are — counts of their own
             * meetings, each with its own denominator — and the project's rate
             * is not put beside them at all.
             */}
            {view.belowMinimum ? (
              <div className="ox-chart">
                <div className="ox-chart-head">
                  <h3 className="ox-chart-title">What their buyers opened</h3>
                  <span className="ox-chart-period">{periodLabel}</span>
                </div>
                <Tally>
                  {view.buyerInterest.map((row) => (
                    <TallyItem
                      key={row.id}
                      label={`${row.label} apartments`}
                      value={
                        row.meetings === 0 ? (
                          <Missing what="None opened" />
                        ) : (
                          <span className="ox-value">
                            <span className="ox-figure">{row.meetings}</span>
                            <span className="ox-of">of {view.sampleSize} meetings</span>
                          </span>
                        )
                      }
                    />
                  ))}
                </Tally>
                <p className="ox-chart-note">
                  Meetings of theirs in which at least one apartment of that size was opened. A
                  meeting that showed a one-room flat and a four-room penthouse counts in both, so
                  these do not sum to the meeting count. The project&rsquo;s own rate is not set
                  beside them: at {view.sampleSize} meetings,{" "}
                  {view.minimumSampleSize - view.sampleSize} short of {view.minimumSampleSize}, that
                  comparison would be a judgement about how somebody works drawn from a sample too
                  thin to carry one.
                </p>
              </div>
            ) : (
              <ChartFrame
                title="What their buyers opened"
                period={periodLabel}
                note="Each row is one size of apartment. The left mark is the share of this agent's meetings in which at least one unit of that size was opened; the right mark is the same rate across the whole project. The rows do not sum to one and this is not a mix — a meeting that showed a one-room flat and a four-room penthouse counts in both."
                summary={`Share of meetings opening each unit size, ${view.name} against the project: ${view.buyerInterest.map((row) => `${row.label}, ${Math.round(row.share * 100)}% against ${Math.round(row.teamShare * 100)}%`).join("; ")}.`}
              >
                <PairedRates
                  rows={view.buyerInterest.map((row) => ({
                    id: row.id,
                    label: row.label,
                    left: row.share,
                    right: row.teamShare,
                    note: `${row.meetings} of their ${view.sampleSize} meetings opened a ${row.label} unit`,
                  }))}
                  leftLabel={view.name.split(" ")[0] ?? "Agent"}
                  rightLabel="Project"
                />
              </ChartFrame>
            )}
          </div>

          {/*
           * THE TEAM'S MEDIAN IS THE COMPARISON THE FLOOR SUPPRESSES HERE.
           *
           * The same rule as "What their buyers opened" two charts up, which
           * withholds the project's rate below the floor and says why. This
           * chart printed the team's median beside every stop regardless, and
           * its summary — what a screen reader gets — said "team median" too.
           * Below the floor neither does, and the reason stands under the
           * chart in the same words.
           */}
          <ChartFrame
            title={`${view.name}: running order and time in each section`}
            period={periodLabel}
            note={
              view.belowMinimum
                ? "The order is where each section falls on average across their meetings, not one meeting's path — nobody presents the same way twice. The bar is their median stay in that section against their own longest stop."
                : "The order is where each section falls on average across their meetings, not one meeting's path — nobody presents the same way twice. The bar is their median stay in that section against their own longest stop; the team's median is printed beside it, since a section time on its own has no scale."
            }
            summary={`${view.profile.sections.length} sections, in running order: ${view.profile.sections
              .map(
                (s) =>
                  `${s.order}. ${s.label}, median ${s.dwellDisplay}${
                    view.belowMinimum ? "" : `, team median ${s.teamDwellDisplay}`
                  }`,
              )
              .join("; ")}.`}
          >
            <SectionSequence
              rows={view.profile.sections}
              agentLabel={view.name.split(" ")[0] ?? "This agent"}
              showTeam={!view.belowMinimum}
            />
            {view.belowMinimum ? (
              <p className="ox-chart-note">
                The team&rsquo;s median is not printed beside their stops: at {view.sampleSize}{" "}
                meetings, {view.minimumSampleSize - view.sampleSize} short of{" "}
                {view.minimumSampleSize}, that comparison would be a judgement about how somebody
                works drawn from a sample too thin to carry one.
              </p>
            ) : null}
          </ChartFrame>

          {/*
           * THE ONE SUPPRESSION THIS FILE MAKES ON TOP OF THE READ MODEL'S.
           *
           * A line between points is read as a direction whether or not a
           * caption says otherwise, and a direction is a trend.
           * `docs/10-policies.md` §6 forbids one below the floor, so the series
           * is withheld rather than drawn with a disclaimer under it — every
           * meeting behind it is listed in the register further down, which is
           * the raw figure the policy asks for.
           */}
          {view.belowMinimum ? (
            <p className="ox-result">
              <span className="ox-chip" data-tone="none">
                <span className="ox-chip-mark" aria-hidden="true" />
                No trend
              </span>
              <span>
                {view.suppressionNote ??
                  `${view.sampleSize} meetings is below the ${view.minimumSampleSize} this product needs.`}{" "}
                A series over time is read as a direction whatever is written beneath it, so none is
                drawn. Every meeting is listed below.
              </span>
            </p>
          ) : (
            <ChartFrame
              title="Presentations, week by week"
              period={periodLabel}
              note={`${view.sessionsOverTime.valueLabel} in each week of the period. Weeks are calendar weeks of the project's own time zone, and a part-week at either end is drawn as what it holds rather than scaled up.`}
              summary={`${view.sessionsOverTime.valueLabel} by week: ${view.sessionsOverTime.points.map((point) => `${point.label}, ${point.value}`).join("; ")}.`}
            >
              <TrendLine
                points={view.sessionsOverTime.points}
                annotation={view.sessionsOverTime.annotation}
                valueLabel={view.sessionsOverTime.valueLabel}
              />
            </ChartFrame>
          )}
        </section>

        {/* --- THE UNITS THEY KEEP OPENING ------------------------------ */}

        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">The apartments they keep opening</h2>
              <p className="ox-section-note">
                An association with this presenter&rsquo;s habit and nothing more. A unit opened in
                most of somebody&rsquo;s meetings may be the one the buyers ask for or the one the
                agent reaches for, and this figure cannot tell the two apart.
              </p>
            </div>

            <DataTable
              caption={`Units opened in the largest share of ${view.name}'s meetings in ${periodLabel.toLowerCase()}, at most six.`}
              columns={unitColumns}
              rows={unitRows}
              codeColumn="unit"
              period={period}
              empty={{
                title: "No unit was opened in this period",
                note: `No meeting of ${view.name}'s in ${periodLabel.toLowerCase()} opened an apartment in the catalogue. The presentations happened; nothing in the residences was reached.`,
              }}
            />

            {view.belowMinimum ? (
              <p className="ox-section-note">
                No share is shown against these counts. At {view.sampleSize} meetings —{" "}
                {view.minimumSampleSize - view.sampleSize} short of {view.minimumSampleSize} — a
                rate over this person&rsquo;s meetings is not a figure to act on, and the count
                already carries the denominator it is a fraction of.
              </p>
            ) : null}

            <p className="ox-subhead">Where else they present</p>

            {view.projects.length === 0 ? (
              <p className="ox-result">
                <span>
                  No other project this account may open holds a meeting of theirs in this period.
                </span>
              </p>
            ) : (
              <ul className="ox-list">
                {view.projects.map((project) => (
                  <li className="ox-row" key={project.projectId}>
                    <div>
                      <h3 className="ox-row-name">
                        {project.isCurrent ? (
                          project.projectName
                        ) : (
                          <Link href={dynamicRoute(withPeriod(project.href, period))}>
                            {project.projectName}
                          </Link>
                        )}
                      </h3>
                      <p className="ox-row-meta">
                        <span>
                          {project.meetings} meeting{project.meetings === 1 ? "" : "s"} in{" "}
                          {periodLabel.toLowerCase()}
                        </span>
                      </p>
                    </div>
                    <div className="ox-row-states">
                      {project.isCurrent ? (
                        <span className="ox-chip" data-tone="settled">
                          <span className="ox-chip-mark" aria-hidden="true" />
                          This project
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="ox-section-note">
              Scoped to the projects this account holds, never to the projects the agent holds. An
              agency selling for two developers is the ordinary arrangement, and a list that showed
              the rest of it would be a commercial fact about somebody else read off a staff page.
            </p>
          </div>
        </div>

        {/* --- THE MEETINGS -------------------------------------------- */}

        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">Their most recent meetings</h2>
              <p className="ox-section-note">
                No buyer is named here and none can be. The visitor column is a privacy-safe label
                built from a closed vocabulary and a count of previous meetings; the type it comes
                from has no field a name, an address or a telephone number could sit in.
              </p>
            </div>

            <MeetingRegister
              rows={view.recentMeetings}
              period={period}
              canOpen={maySeeSurface(viewer.role, "[meetingId]")}
              caption={`${view.name}'s most recent meetings in ${periodLabel.toLowerCase()}, newest first, at most eight. Open one for the presentation reconstructed step by step.`}
              emptyNote={`No meeting of ${view.name}'s falls inside ${periodLabel.toLowerCase()}.`}
            />

            {/*
             * The screen's action. Eight rows is a sample of the register and
             * the register itself is a surface, so the way out of this table is
             * a link to it rather than a control that would have to page.
             */}
            <div className="ox-btn-row">
              <Link className="ox-btn" href={dynamicRoute(withPeriod(meetingsHref, period))}>
                Every meeting of theirs in this period
              </Link>
            </div>
          </div>
        </div>

        {/* --- FINDINGS ------------------------------------------------- */}

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">What this period found</h2>
          </div>
          <FindingList
            findings={view.findings}
            period={period}
            emptyNote={`No finding about ${view.name} was produced for this period. That is the read model's answer rather than a gap in it.`}
          />
        </section>

        {/* --- HOW TO READ IT ------------------------------------------ */}

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">How to read this</h2>
          </div>
          <p className="ox-section-note">
            Nothing on this page ranks {view.name} against a colleague and nothing adds these
            figures into a score. An outcome is what the agent recorded at the end of a meeting;
            every rate that uses one silently drops the meetings that recorded none, and the count
            of those is on the roster. Below {view.minimumSampleSize} meetings a rate is shown as a
            raw figure with its shortfall beside it, no series is drawn, and no comparison is made.
          </p>
        </section>
      </div>
    </div>
  );
}
