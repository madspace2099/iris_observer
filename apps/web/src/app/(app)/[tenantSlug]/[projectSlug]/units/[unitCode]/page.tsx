import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError, NotPermittedError } from "@observer/readmodels";
import type { UnitAttentionDetail, UnitDetailView } from "@observer/readmodels";

import { requireSurface } from "@/lib/authz";
import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { TrendLine } from "@/showroom/charts2";
import {
  ChartFrame,
  DataTable,
  Empty,
  Evidence,
  Figure,
  FindingList,
  PageHead,
  PersonCard,
  Sample,
  Sources,
  Synthetic,
  Tally,
  TallyItem,
  Timeline,
  Unavailable,
  type DataRow,
  type TimelineStep,
} from "@/components/product";
import { StatusChip, UnitFunnel, VerifiedOutcome } from "@/components/units";

export const metadata: Metadata = { title: "Unit" };

/**
 * ONE APARTMENT.
 *
 * The register answers across the building; this answers for one flat. What it
 * is, what buyers did with it, in what order, how far any of that travelled
 * towards a sale, who was in the room, and how much of it may be believed.
 *
 * It is a route rather than a query parameter on the register, and that was the
 * point of moving it: a flat somebody wants a colleague to look at has to be
 * sendable. The register keeps its own job — narrowing, ordering, comparing
 * forty-eight rows — and every code in it opens this.
 *
 * ## The order of the screen is the order of the questions
 *
 * **What it is**, from the catalogue. Nothing on that plate was observed; all
 * of it was supplied, and the two belong apart so a reader is never left
 * wondering which of the numbers on this page came from a buyer.
 *
 * **What buyers did with it**, six signals and a weekly shape. Measurement, so
 * it sits on paper with the attributes.
 *
 * **How far it travelled**, on graphite, because a funnel stage is a claim
 * about how strongly something is known and the sentence under each stage says
 * so. Only the two stages a system of record states about this unit are drawn
 * as verified.
 *
 * **What happened, in order**, on paper. A sequence and never a mechanism: the
 * timeline says the plan was opened and the flat was shortlisted, and it never
 * says the first produced the second.
 *
 * **Who was in the room**, on graphite, as a roster with no rank in it.
 *
 * ## Two read models, and no join
 *
 * `getUnitDetail` answers for the unit's own page. `getUnitAttention` is read a
 * second time for one thing only — the units this one was weighed against in
 * Compare, which lives on `UnitAttentionDetail` and has no home on
 * `UnitDetailView`. Nothing is computed across the two: the comparison list is
 * drawn exactly as its own projection produced it, beside figures drawn exactly
 * as theirs produced them. That the two calls exist at all is reported as a
 * gap — `competitors` belongs on the unit's own view.
 *
 * ## A unit nobody opened still has a page
 *
 * That is the whole reason `getUnitDetail` exists separately, and it is the
 * case this screen has to get right: the catalogue facts are still true, the
 * funnel still has two verified stages, and the measured region states its
 * emptiness as an answer rather than drawing a row of noughts.
 */
export default async function UnitPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string; unitCode: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug, unitCode } = await params;
  const root = `/${tenantSlug}/${projectSlug}`;
  /*
   * The last path segment is the surface key. `[unitCode]` is declared once and
   * matches nothing else — `[meetingId]`, `[threadId]` and `[agentId]` are all
   * distinct words, which is the property `requireSurface` depends on and
   * cannot check for itself.
   */
  requireSurface(viewer, "[unitCode]", root);

  const { period: periodParam } = await searchParams;
  const period = presetFrom(periodParam);
  const query = { viewer, tenantSlug, projectSlug, period };

  let detail: UnitDetailView;
  let comparison: UnitAttentionDetail | null;
  try {
    const [view, attention] = await Promise.all([
      repository.getUnitDetail(query, unitCode),
      repository.getUnitAttention(query, unitCode),
    ]);
    detail = view;
    comparison = attention.selected;
  } catch (error) {
    /*
     * A unit the catalogue does not hold is a route that does not exist, and a
     * page of dashes for it would tell the reader the flat is real and
     * unobserved. Forbidden is rendered the same way for the same reason the
     * project layout renders it the same way: telling an unauthorised reader
     * that something exists is itself a disclosure.
     */
    if (error instanceof NotFoundError || error instanceof NotPermittedError) notFound();
    throw error;
  }

  const { context, unit, signals, trend } = detail;
  const base = `${root}/units`;
  const periodLabel = context.period.label;

  /*
   * The stages no source can answer, stated once each above the funnel.
   *
   * `Figure` draws the terse missing mark inside the stage; the reason belongs
   * to the region, which is the defect `docs/12-visual-autopsy.md` recorded —
   * four panels in one viewport each repeating "the CRM is not connected". Two
   * bands at most, and only where the two reasons genuinely differ: the offer
   * stage is unanswerable on every project, the follow-up stage only where no
   * CRM is connected.
   */
  const unanswerable = detail.funnel.filter((stage) => stage.verification === "unavailable");

  const timelineSteps: readonly TimelineStep[] = detail.timeline.map((entry) => ({
    id: entry.id,
    when: entry.atDisplay,
    label: entry.label,
    detail:
      entry.detail === null
        ? `${entry.channelLabel} · ${entry.agentName}`
        : `${entry.detail} · ${entry.channelLabel} · ${entry.agentName}`,
    channel: entry.channel,
    sources: entry.sources,
  }));

  const meetingRows: readonly DataRow[] = detail.relatedMeetings.map((meeting) => ({
    key: meeting.meetingId,
    cells: {
      meeting: <Link href={dynamicRoute(withPeriod(meeting.href, period))}>{meeting.label}</Link>,
      when: meeting.startedDisplay,
      agent: meeting.agentName,
      /* Never a name, an email or a phone number. See `VisitorLabel`. */
      visitor: meeting.visitor.display,
      length: meeting.durationDisplay,
      units: meeting.unitCount,
      shortlisted: meeting.favourites,
      outcome: meeting.outcomeLabel,
      followUp: meeting.followUpLabel,
    },
  }));

  const comparisonRows: readonly DataRow[] = (comparison?.competitors ?? []).map((competitor) => ({
    key: competitor.unitCode,
    cells: {
      unit: (
        <Link href={dynamicRoute(withPeriod(`${base}/${competitor.unitCode}`, period))}>
          {competitor.unitCode}
        </Link>
      ),
      together: competitor.together,
      keptOther: competitor.keptOther,
    },
  }));

  return (
    <div className="ox-page">
      <PageHead
        kicker={`${context.project.name} · Units · ${periodLabel}`}
        title={unit.unitCode}
        answer={detail.headline}
        lede={`Floor ${unit.floor}, block ${unit.block}, facing ${unit.orientation}. ${unit.pricePerSqmDisplay}.`}
        crumbs={[
          { label: context.project.name, href: `${root}/project` },
          { label: "Units", href: base },
          { label: unit.unitCode },
        ]}
        aside={
          <>
            <StatusChip status={unit.status} />
            <Synthetic />
          </>
        }
        period={period}
      />

      <div className="ox-body">
        {detail.emptyState === null ? null : (
          <section className="ox-plane">
            <Empty title="Not opened in front of a buyer" note={detail.emptyState} />
          </section>
        )}

        {/*
         * THE PLATE. Everything measured about this flat, on the paper ground:
         * the catalogue's own figures, the six interest signals, and the weekly
         * shape. Nothing on it is a conclusion, and the conclusions above and
         * below it stay on graphite.
         */}
        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">The apartment</h2>
              <p className="ox-section-note">
                Supplied by the unit catalogue. Nothing here was observed in a meeting.
              </p>
            </div>

            <Tally>
              <TallyItem label="Status" value={<StatusChip status={unit.status} />} />
              <TallyItem
                label="Verified outcome"
                value={<VerifiedOutcome status={unit.status} />}
              />
              <TallyItem
                label="Price"
                value={<span className="ox-figure">{unit.priceDisplay}</span>}
              />
              <TallyItem
                label="Price per m²"
                value={<span className="ox-figure">{unit.pricePerSqmDisplay}</span>}
              />
              <TallyItem label="Rooms" value={<span className="ox-figure">{unit.rooms}</span>} />
              <TallyItem
                label="Area"
                value={
                  <span className="ox-value">
                    <span className="ox-figure">{unit.areaSqm}</span>
                    <span className="ox-of">m²</span>
                  </span>
                }
              />
              <TallyItem
                label="Floor"
                value={
                  <span className="ox-value">
                    <span className="ox-figure">{unit.floor}</span>
                    <span className="ox-of">block {unit.block}</span>
                  </span>
                }
              />
              <TallyItem
                label="Orientation"
                value={<span className="ox-figure">{unit.orientation}</span>}
              />
            </Tally>

            <div className="ox-section-head">
              <h2 className="ox-section-title">What buyers did with it</h2>
              {/*
               * The evidence is stated once for the region rather than under
               * each of the six figures. `UnitInterestSignals` carries no
               * `evidence` on its metrics, so a per-figure line would print "No
               * evidence" six times under six real measurements — reported as a
               * gap, and answered here with the view's own reference.
               */}
              <span className="ox-row-states">
                <Sources sources={detail.attention.sources} />
                <Evidence evidence={detail.evidence} period={period} />
              </span>
            </div>

            <Tally>
              <TallyItem label={signals.views.label} value={<Figure value={signals.views} />} />
              <TallyItem
                label={signals.uniqueSessions.label}
                value={<Figure value={signals.uniqueSessions} />}
              />
              <TallyItem
                label={signals.favourites.label}
                value={<Figure value={signals.favourites} />}
              />
              <TallyItem
                label={signals.documentOpens.label}
                value={<Figure value={signals.documentOpens} />}
              />
              <TallyItem
                label={signals.comparisons.label}
                value={<Figure value={signals.comparisons} />}
              />
              <TallyItem label={signals.shares.label} value={<Figure value={signals.shares} />} />
              <TallyItem label={trend.verdict.label} value={<Figure value={trend.verdict} />} />
            </Tally>

            {trend.series.points.length < 2 ? (
              <Empty
                title="No weekly shape yet"
                note={`${periodLabel} holds fewer than two weekly buckets for this unit, so there is nothing to draw a line between.`}
              />
            ) : (
              <ChartFrame
                title="Interest, week by week"
                period={periodLabel}
                note={`${trend.series.valueLabel}, bucketed by week. ${
                  trend.direction === "unknown"
                    ? "Too few observations to read a direction, so none is stated — the shape is drawn and left to the reader."
                    : `The read model reports the direction as ${trend.direction} against ${trend.baselineLabel}.`
                }`}
                summary={`${trend.series.valueLabel} across ${trend.series.points.length} weeks of ${periodLabel}. ${
                  trend.direction === "unknown"
                    ? "No direction is stated at this sample size."
                    : `Reported direction: ${trend.direction}.`
                }`}
              >
                <TrendLine
                  points={trend.series.points}
                  annotation={trend.series.annotation}
                  valueLabel={trend.series.valueLabel}
                />
              </ChartFrame>
            )}
          </div>
        </div>

        {/* --- how far it travelled ---------------------------------------- */}

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">From opened to sold</h2>
            <p className="ox-section-note">
              Six stages, and each says which source stands behind it. Only the two the unit
              catalogue states about this flat are drawn as verified; a shortlist is the strongest
              signal the showroom produces and it is still not a sale.
            </p>
            {/*
             * The evidence for the region, stated once.
             *
             * No stage carries an `EvidenceRef` of its own, and a "No evidence"
             * line under each of six stages would read as six failures rather
             * than as one shape of read model. The view's own reference covers
             * the readings all six rest on.
             */}
            <span className="ox-row-states">
              <Evidence evidence={detail.evidence} period={period} />
            </span>
          </div>

          {unanswerable.map((stage) => (
            <Unavailable
              key={stage.id}
              what={stage.step.label}
              why={stage.step.metric.message ?? stage.basis}
              action={null}
              period={period}
            />
          ))}

          <UnitFunnel stages={detail.funnel} />
        </section>

        {/* --- what happened, in order -------------------------------------- */}

        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">What IRIS recorded</h2>
              <p className="ox-section-note">{detail.timelineNote}</p>
            </div>

            {timelineSteps.length === 0 ? (
              <Empty
                title="Nothing was recorded against this unit"
                note={`No meeting in ${periodLabel.toLowerCase()} opened it, so there is no sequence to show.`}
              />
            ) : (
              <Timeline
                steps={timelineSteps}
                period={period}
                label={`What IRIS recorded against ${unit.unitCode}`}
              />
            )}

            <div className="ox-section-head">
              <h2 className="ox-section-title">Meetings that opened it</h2>
              <p className="ox-section-note">
                A visitor is a privacy-safe identifier. No contact name, email or telephone number
                appears on any surface of this product.
              </p>
            </div>

            <DataTable
              caption={`Meetings in ${periodLabel.toLowerCase()} that opened ${unit.unitCode}.`}
              columns={[
                { key: "meeting", label: "Meeting" },
                { key: "when", label: "Started" },
                { key: "agent", label: "Agent" },
                { key: "visitor", label: "Visitor" },
                { key: "length", label: "Length" },
                { key: "units", label: "Units opened", numeric: true },
                { key: "shortlisted", label: "Shortlisted", numeric: true },
                { key: "outcome", label: "Outcome" },
                { key: "followUp", label: "Follow-up" },
              ]}
              rows={meetingRows}
              codeColumn="meeting"
              period={period}
              empty={{
                title: "No meeting opened this unit",
                note: `Nothing in ${periodLabel.toLowerCase()} shows this flat being opened in front of a buyer.`,
              }}
            />

            <div className="ox-section-head">
              <h2 className="ox-section-title">Weighed against</h2>
              <p className="ox-section-note">
                Units this one was placed beside in Compare, and how often the other one was the one
                kept. A comparison is an observed act, not a preference anybody stated.
              </p>
            </div>

            {comparisonRows.length === 0 ? (
              <Empty
                title="Never placed in Compare"
                note={`${unit.unitCode} was not weighed against another unit in ${periodLabel.toLowerCase()}.`}
              />
            ) : (
              <DataTable
                caption={`Units ${unit.unitCode} was compared against in ${periodLabel.toLowerCase()}.`}
                columns={[
                  { key: "unit", label: "Unit" },
                  { key: "together", label: "Compared together", numeric: true },
                  { key: "keptOther", label: "The other was kept", numeric: true },
                ]}
                rows={comparisonRows}
                codeColumn="unit"
                period={period}
              />
            )}

            {comparison === null || comparison.relatedFilters.length === 0 ? (
              <Unavailable
                what="What buyers were searching for when they opened this unit"
                why="Filter state is not emitted by the current showroom build."
                action={null}
                period={period}
              />
            ) : (
              <div>
                <p className="ox-subhead">Filters active in those meetings</p>
                <ul className="ox-scope">
                  {comparison.relatedFilters.map((filter) => (
                    <li className="ox-scope-item" key={filter.label}>
                      <span>{filter.label}</span>
                      <span className="ox-n">{filter.count} meetings</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* --- who was in the room ------------------------------------------ */}

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">Who showed it</h2>
            <p className="ox-section-note">
              Not a ranking, and there is no field on this view to put one in. How often each person
              opened this flat, beside the sample their own figures rest on.
            </p>
          </div>

          {detail.relatedAgents.length === 0 ? (
            <Empty
              title="Nobody showed this unit"
              note={`No presentation in ${periodLabel.toLowerCase()} opened it, so no agent is associated with it.`}
            />
          ) : (
            <ul className="ox-people">
              {detail.relatedAgents.map((agent) => (
                <PersonCard
                  key={agent.agentId}
                  name={agent.name}
                  href={agent.href}
                  period={period}
                  /*
                   * No `role`. `.ox-person-role` is what a person DOES, not how
                   * often they did something, and putting a count there would
                   * turn a roster line into a standing about a colleague.
                   */
                >
                  <p className="ox-row-meta">
                    <span>
                      {agent.meetings} of their meetings opened {unit.unitCode}
                    </span>
                    <span>shortlisted it in {agent.favourites}</span>
                    <Sample n={agent.sampleSize} noun="meetings on this project" />
                    {agent.belowMinimum ? (
                      <span className="ox-shortfall">
                        below the minimum of {agent.minimumSampleSize} — no rank, no verdict, no
                        trend
                      </span>
                    ) : null}
                  </p>
                </PersonCard>
              ))}
            </ul>
          )}
        </section>

        {/* --- what the period says ----------------------------------------- */}

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">What the period says about {unit.unitCode}</h2>
            <p className="ox-section-note">
              Each finding carries what it is measured against, what would make it wrong, and the
              number of meetings behind it.
            </p>
          </div>

          <FindingList
            findings={detail.findings}
            period={period}
            sampleNoun="meetings"
            emptyNote={`No finding was produced for ${unit.unitCode} in this period. That is the read model's answer, not a gap in it.`}
          />
        </section>
      </div>
    </div>
  );
}
