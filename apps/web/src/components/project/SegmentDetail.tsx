import Link from "next/link";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type { PeriodPreset, SegmentInterest } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { ChartFrame, Empty, Sample, Tabs, Tally, TallyItem } from "@/components/product";
import { PairedRates } from "@/showroom/charts";
import { RankedBars } from "@/showroom/charts2";
import { Count, Ratio, shareText } from "./Reading";
import { Plane } from "./Section";

/**
 * INSIDE ONE SEGMENT — what is interesting about it, not merely how much.
 *
 * "Are two-room flats interesting to buyers" is answered by the parity scales
 * above. This region answers the harder half: *what about them*. Four different
 * acts, kept apart rather than averaged into a single engagement number,
 * because they are four different questions and they call for four different
 * campaigns — the balcony is the view, the floor cut is the layout, the plan is
 * what a buyer takes away, the screenshot is what they show somebody else.
 *
 * Each rate is drawn against the same rate for every other unit in the scheme,
 * which is the only thing that makes it mean anything: "40% of two-room
 * openings got a balcony view" is a number, and "40% against 37% for the rest"
 * is a finding, and the second one is usually much duller than the first. A
 * paired dot puts the difference itself on the page rather than asking the
 * reader to compare two bar lengths from different baselines.
 *
 * ## The segment lives in the URL and the chips are links
 *
 * There is no client state here and there cannot be. A reader who chose a
 * segment and sent the address to a colleague must be sending the segment as
 * well, and this application holds nothing in browser storage — a test scans
 * `apps/web/src` for `localStorage`, `sessionStorage` and `indexedDB` and
 * expects none. `Tabs` renders `.ox-toggle` chips rather than `.ox-tab`
 * underlines because these do not move the reader to another surface, they
 * re-cut the one they are on, and the shell already draws the underlined row
 * above for the four faces of Project.
 *
 * ## This region is graphite
 *
 * It carries the segment's `soWhat` — a conclusion — and its controls, and
 * ADR-0034 puts both above the seam. The readings inside it are six figures and
 * two charts rather than a register, so paper is not earned here: paper is for
 * the stacking plan, the filter table and the movement register on this screen.
 *
 * ## Why the action is the audience builder and why it carries no criteria
 *
 * A screen without an action is not finished, and the useful thing to do with
 * "these buyers behave like this" is to reach them. The link therefore goes to
 * the audience builder — and it goes there with NO criteria attached, which is
 * a deliberate retreat from the baseline screen. That one built
 * `?rooms=${segment.id === "rooms-2" ? 2 : 3}`, which reads the segment's
 * definition out of its identifier string and silently answers "3" for every
 * segment that is not two-room, including an orientation or a price band.
 * `SegmentInterest` carries no href and no criteria, so the honest link is the
 * one that opens the builder rather than the one that pretends to have filled
 * it in. Reported as a gap.
 */
export function SegmentDetail({
  segments,
  selected,
  root,
  locale,
  periodLabel,
  meetingCount,
  period,
}: {
  readonly segments: readonly SegmentInterest[];
  readonly selected: SegmentInterest | null;
  readonly root: string;
  readonly locale: string;
  readonly periodLabel: string;
  readonly meetingCount: number;
  readonly period: PeriodPreset;
}) {
  const belowFloor = meetingCount < AGENT_MIN_SAMPLE;

  return (
    <Plane
      id="project-segment"
      title={selected === null ? "Inside a segment" : `Inside ${selected.label.toLowerCase()}`}
      /*
       * "The four acts are kept apart" and not "kept apart BECAUSE they are
       * four different questions". The word is banned from rendered prose on
       * this product and a test scans for it, and the ban is not a style rule
       * to be argued with per sentence: a screen where the word appears in a
       * harmless place is a screen where a reviewer has to read every sentence
       * to find out whether it appears in a harmful one.
       */
      note="How buyers examined the units in this segment, each act against the same rate for every other unit in the scheme. The four acts are kept apart: they are four different questions and four different campaigns."
      aside={
        <Link
          className="ox-btn"
          href={dynamicRoute(withPeriod(`${root}/audience`, period))}
          title="Opens the audience builder. The segment's own definition is not carried across; see the note in this component."
        >
          Build an audience
        </Link>
      }
    >
      <Tabs
        label="Unit segment"
        period={period}
        tabs={segments.map((segment) => ({
          key: segment.id,
          label: segment.label,
          href: `${root}/project?segment=${encodeURIComponent(segment.id)}`,
          current: selected !== null && selected.id === segment.id,
        }))}
      />

      {selected === null ? (
        <Empty
          title="No segment is selected"
          note="Choose one of the segments above. Each is a cut of the same period and the same meetings; nothing is filtered out of the building or the registers below."
        />
      ) : (
        <>
          <p className="ox-lede">{selected.soWhat}</p>

          <Tally>
            <TallyItem
              label="Share of available stock"
              value={
                <Ratio
                  value={selected.stockShare}
                  of={`${selected.availableUnits} available units`}
                  locale={locale}
                />
              }
            />
            <TallyItem
              label="Share of looking time"
              value={
                <Ratio
                  value={selected.attentionShare}
                  of="of all time on any unit"
                  locale={locale}
                />
              }
            />
            <TallyItem
              label="Share of shortlisting"
              value={
                <Ratio
                  value={selected.favouriteShare}
                  of="of every unit shortlisted"
                  locale={locale}
                />
              }
            />
            <TallyItem
              label="Share of comparisons"
              value={
                <Ratio
                  value={selected.compareShare}
                  of="of every unit put side by side"
                  locale={locale}
                />
              }
            />
            <TallyItem
              label="Share of what was sent on"
              value={
                <Ratio value={selected.shareShare} of="of every unit shared" locale={locale} />
              }
            />
            <TallyItem
              label="Meetings that opened one"
              value={
                <Count
                  value={selected.meetings}
                  of={`of ${meetingCount} presentations`}
                  note={`of ${meetingCount} presentations — no meeting opened a unit in this segment`}
                />
              }
              evidence={<Sample n={selected.meetings} noun="meetings" />}
            />
          </Tally>

          {/*
           * THE INDEX, AND THE SENTENCE THAT STOPS IT BEING READ AS THE OTHER
           * ONE.
           *
           * Two read models on this screen publish an index against parity for
           * the same segment label and they are not the same number.
           * `PulseSegment.attentionIndex`, drawn on the scales above, is the
           * segment's share of MEANINGFUL VIEWS on units over its share of the
           * stock. `SegmentInterest.index`, stated here, is its share of DWELL
           * TIME inside meetings over the same denominator. On Northgate they
           * read 0.68× and 0.51× for three-room units, three inches apart, both
           * correct and neither reconcilable by a reader who is not told which
           * quantity each counts.
           *
           * That is the defect this codebase has already fixed twice in other
           * costumes — two panels answering "how many meetings are in this
           * period" differently — and the fix available to a screen is not to
           * hide one of them but to say what each measures in the sentence next
           * to it. Reported as a read-model gap: two indices with one word for
           * them belong under two words.
           *
           * It is also a rank, so it is stated only above the sample floor, and
           * as a sentence rather than a seventh figure in the tally: it is
           * derived from two figures already standing there, and repeating it as
           * their peer would invite the reader to take it as a third
           * measurement.
           */}
          {belowFloor ? null : (
            <p className="ox-section-note">
              {selected.label} units take {shareText(selected.attentionShare, locale)} of the time
              buyers spent on any unit, on {shareText(selected.stockShare, locale)} of the available
              stock — {selected.index.toFixed(2)}× their share of it. The scales above index a
              different quantity, openings of a unit rather than time spent on one, so the two
              figures are not the same reading and will not agree.
            </p>
          )}

          {selected.examinedHow.length === 0 ? null : (
            <ChartFrame
              title="How they examined the units"
              period={periodLabel}
              note="Share of unit openings in this segment that included each act, against the same share for every other unit in the scheme. One opening may include several acts, so the four do not sum to a whole."
              legend={[
                { label: `Filled dot · ${selected.label.toLowerCase()} units` },
                { label: "Hollow dot · every other unit" },
              ]}
              summary={selected.examinedHow
                .map(
                  (act) =>
                    `${act.label}: ${shareText(act.rate, locale)} of ${selected.label.toLowerCase()} openings against ${shareText(act.otherRate, locale)} elsewhere`,
                )
                .join(". ")}
            >
              <PairedRates
                leftLabel={selected.label}
                rightLabel="Every other unit"
                rows={selected.examinedHow.map((act) => ({
                  id: act.id,
                  label: act.label,
                  left: act.rate,
                  right: act.otherRate,
                  note: "share of units opened that got this",
                }))}
              />
            </ChartFrame>
          )}

          {selected.attendedTo.length === 0 || belowFloor ? null : (
            <ChartFrame
              title="What those buyers spent their time on"
              period={periodLabel}
              note={`Share of the time the meetings that opened one of these units spent on any named place. The ${Math.min(8, selected.attendedTo.length)} largest of ${selected.attendedTo.length} recorded. Ordered by that share, which is why it is withheld below the sample floor.`}
              summary={selected.attendedTo
                .slice(0, 8)
                .map((item) => `${item.label}: ${shareText(item.share, locale)} of place time`)
                .join(". ")}
            >
              <RankedBars
                rows={selected.attendedTo.slice(0, 8).map((item) => ({
                  id: `${item.category}:${item.label}`,
                  label: item.label,
                  sub: item.category,
                  value: item.share,
                  display: shareText(item.share, locale),
                }))}
              />
            </ChartFrame>
          )}
        </>
      )}
    </Plane>
  );
}
