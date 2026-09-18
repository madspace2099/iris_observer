import Link from "next/link";
import type { MeetingReplay, PeriodPreset, ReportScopeView } from "@observer/readmodels";
import { ExportReport } from "@/components/report";

import { Evidence, PageHead, Sources, Synthetic } from "@/components/product";
import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { MeetingJourney } from "./MeetingJourney";
import { MeetingOutcomes } from "./MeetingOutcomes";

/**
 * ONE MEETING THAT HAS ALREADY HAPPENED.
 *
 * The drill-down the whole product points at. Every register, every unit page
 * and every agent comparison eventually ends here, at one presentation
 * reconstructed in the order it was given, and this is the surface where the
 * reader stops looking at rates and looks at what a buyer actually did.
 *
 * ## Where the seam falls, and why it falls there
 *
 * Four regions, three of them on graphite and one on paper.
 *
 *   DERIVED SUMMARY   graphite. A sentence Observer worked out, not a reading.
 *   HOW IT ENDED      graphite. Two conclusions about the meeting, one of them
 *                     the statement that nothing verified it.
 *   THE JOURNEY       paper. Times, sections, unit codes, counts — a dense
 *                     measured body, which is the one thing ADR-0034 puts on
 *                     the light ground.
 *   WHAT IT CANNOT SAY  graphite. Statements about the source's limits.
 *
 * A reader arrives on graphite, drops to paper for the record itself, and comes
 * back to graphite for what the record does not cover. The seam is doing the
 * work a heading would otherwise have to: above it what we say, below it what
 * was measured.
 *
 * ## The derived summary is labelled twice
 *
 * `MeetingReplay.headline` is not an observation. It is a sentence assembled
 * from the session — its length, its step count, how many units were opened —
 * and it is the closest thing this screen has to an answer. Because it is
 * derived it is labelled on both axes at once: the word "Derived" in the
 * section title, and `IRIS calculated` on the source chip beneath it, which is
 * the contract's own name for `IRIS_SHOWROOM_DERIVED`. Nothing on this screen
 * asks the reader to guess which sentences Observer worked out.
 *
 * The summary the brief asks for — three two-bedroom apartments viewed, two
 * shortlisted, the strongest interest in the south-facing units — needs the
 * unit CATALOGUE beside the replay: rooms, orientation and price band are unit
 * attributes and `MeetingReplay` carries unit codes. Producing that sentence
 * here would mean joining two read models in a component, which ADR-0012
 * forbids outright, so the read model's own headline is what is shown and the
 * richer summary is reported as a missing field rather than assembled on the
 * page.
 *
 * ## ADR-0018 is a property of the route, not of this file
 *
 * The pre-meeting brief is prohibited on every buyer-visible surface. This is
 * the other half of the same route — the meeting that has already run — and the
 * page above enforces the surface's role list before either half is reached.
 * Nothing here renders a brief, and nothing here is reachable from a
 * buyer-facing surface.
 */
export function MeetingReplayView({
  replay,
  period,
  base,
  crmConnected,
  report,
}: {
  readonly replay: MeetingReplay;
  /** The meeting's own report scope, for the export dialog and the page it opens. */
  readonly report: ReportScopeView;
  readonly period: PeriodPreset;
  /** `/{tenantSlug}/{projectSlug}`. The register and the project hang off it. */
  readonly base: string;
  readonly crmConnected: boolean;
}) {
  return (
    <div className="ox-page">
      <PageHead
        kicker="Meeting replay"
        title={replay.startedDisplay}
        /*
         * No `answer`. `PageHead` is explicit that a small number of surfaces —
         * a register, a single meeting replay — genuinely state their subject
         * rather than a verdict about it, and that forcing one to invent a
         * conclusion produces the confident sentence with nothing behind it
         * that the rest of this system works to prevent. What this screen has
         * instead is a DERIVED summary, and it is labelled as one a region
         * below rather than promoted into the position a conclusion holds.
         */
        lede={
          replay.agentHref === null ? (
            `Presented by ${replay.agentName}.`
          ) : (
            <>
              Presented by{" "}
              <Link className="ox-link" href={dynamicRoute(withPeriod(replay.agentHref, period))}>
                {replay.agentName}
              </Link>
              .
            </>
          )
        }
        crumbs={[
          { label: "Project", href: `${base}/project` },
          { label: "Meetings", href: `${base}/meetings` },
          { label: replay.startedDisplay },
        ]}
        aside={
          <>
            <Synthetic />
            <Link className="ox-btn" href={dynamicRoute(withPeriod(`${base}/meetings`, period))}>
              Every meeting in the period
            </Link>
            <ExportReport
              report={report}
              pageHref={withPeriod(`${base}/report?meeting=${replay.meetingId}`, period)}
            />
          </>
        }
        period={period}
      />

      <div className="ox-body">
        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">Derived summary</h2>
            <p className="ox-section-note">
              Worked out from the session record. Every figure inside it is drawn again, one by one,
              in the journey below.
            </p>
          </div>

          <p className="ox-answer">{replay.headline}</p>

          <div className="ox-finding-foot">
            <Sources sources={["IRIS_SHOWROOM_DERIVED"]} />
            <Evidence evidence={replay.evidence} period={period} />
          </div>
        </section>

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">How the meeting ended</h2>
          </div>

          <MeetingOutcomes replay={replay} period={period} crmConnected={crmConnected} />
        </section>

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">The visitor journey</h2>
            <p className="ox-section-note">
              Section by section, in the order the source recorded them. A step follows another
              step; nothing below claims that one step produced the next.
            </p>
          </div>

          {replay.timingAvailable ? null : (
            /*
             * The honest branch, preserved from the surface this replaces.
             *
             * A legacy import recorded the ORDER of a presentation and never
             * its clock. The sequence below is exactly what was recorded and
             * the times were never captured, so none are shown — an invented
             * timestamp would make a real sequence look like a measured pace.
             */
            <p className="ox-finding-caveat">
              This session came from the legacy analytics. The order below is exactly what was
              recorded; the times were never captured, so none are shown.
            </p>
          )}
        </section>

        {/*
         * THE ONE PAPER PLATE ON THIS SCREEN.
         *
         * Times, section names, unit codes, counts of entries — the densest
         * measured body the product has, and the case ADR-0034 wrote the paper
         * ground for. It is held off the graphite by `--ox-inset` and pads
         * itself by `--ox-pad`, so its text stands on the same left edge as
         * every sentence above it.
         */}
        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <MeetingJourney replay={replay} period={period} />
          </div>
        </div>

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">What this record cannot say</h2>
            <p className="ox-section-note">
              The read model&rsquo;s own statement of its limits, once for the whole meeting rather
              than beside every row it applies to.
            </p>
          </div>

          <ul className="ox-scope">
            {replay.gaps.map((gap) => (
              <li className="ox-scope-item" key={gap}>
                <span>{gap}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
