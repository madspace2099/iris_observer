import Link from "next/link";
import type { MeetingRow, PeriodPreset } from "@observer/readmodels";

import { DataTable, type DataColumn, type DataRow } from "@/components/product";
import { dynamicRoute } from "@/lib/href";
import { MEETINGS_NOT_OPENABLE } from "@/components/meetings/MeetingRegister";
import { withPeriod } from "@/lib/period";
import { Missing, isDash } from "./Rates";

/**
 * THE MEETINGS ONE AGENT HELD, AS A REGISTER.
 *
 * `AgentDetailView.recentMeetings` is the same `MeetingRow` the meeting list
 * and the unit page render, built by one projection, so the three surfaces
 * cannot disagree about what a meeting is. It is drawn here rather than
 * imported from the meeting list's own component for the narrower reason that
 * this table drops the agent column: every row on this page belongs to the
 * person the page is about, and a column repeating one name eight times is a
 * column of noise.
 *
 * ## No buyer reaches this table today
 *
 * `MeetingRow.visitor` is a `VisitorLabel`, and the type has no field a name,
 * an email or a telephone number could sit in — `visitorLabel` takes a closed
 * enum and an integer and nothing else. What appears is "First meeting",
 * "Returning · 3rd meeting" or "Not linked to a contact". That is a structural
 * guarantee rather than a convention this component is remembering to keep, and
 * it is why the column is safe to show on a surface a whole agency can open.
 * Whether a real name should appear here is reopened and under design; that
 * surface question is exactly the one `docs/22-visitor-name-display.md` §5
 * leaves to a product decision.
 *
 * ## Follow-up has four states and three of them are not "no"
 *
 * `FOLLOW_UP_STATES` separates "the recorded outcome asks for one", "the
 * recorded outcome does not", "no outcome was recorded" and "no CRM is
 * connected". The last two are absences and are drawn as absences; folding them
 * into "no follow-up needed" would turn a gap in the record into a decision
 * somebody made. `followUpLabel` is the read model's sentence and is carried on
 * the cell's `title` so a reader can ask what a state means without the column
 * growing to hold a sentence.
 */

/** The short word for each state. The long sentence is the read model's. */
const FOLLOW_UP_SHORT: Readonly<Record<MeetingRow["followUp"], string>> = {
  required: "Needed",
  not_required: "Not needed",
  not_recorded: "No outcome",
  unavailable: "No CRM",
};

export function MeetingRegister({
  rows,
  period,
  caption,
  canOpen,
  emptyNote,
}: {
  readonly rows: readonly MeetingRow[];
  readonly period: PeriodPreset;
  readonly caption: string;
  /** Whether this reader may open a meeting. See the meetings register for why. */
  readonly canOpen: boolean;
  readonly emptyNote: string;
}) {
  const columns: readonly DataColumn[] = [
    { key: "meeting", label: "Meeting" },
    { key: "duration", label: "Length", numeric: true },
    { key: "sections", label: "Sections", numeric: true },
    { key: "units", label: "Units opened", numeric: true },
    { key: "favourites", label: "Shortlisted", numeric: true },
    { key: "outcome", label: "Recorded outcome" },
    { key: "followUp", label: "Follow-up" },
    { key: "visitor", label: "Visitor" },
  ];

  const data: readonly DataRow[] = rows.map((row) => ({
    key: row.meetingId,
    cells: {
      meeting: canOpen ? (
        <Link href={dynamicRoute(withPeriod(row.href, period))}>{row.label}</Link>
      ) : (
        row.label
      ),

      /*
       * A legacy import carries the order of a presentation and not its clock,
       * and `timingAvailable` is the read model saying which kind of record
       * this is. The duration on one of those is the session's own span rather
       * than a sum of steps, so it is marked as an approximation rather than
       * printed as a measurement.
       */
      duration: isDash(row.durationDisplay) ? (
        <Missing what="Not timed" />
      ) : (
        <span title={row.timingAvailable ? undefined : "Imported without step timing."}>
          {row.durationDisplay}
          {row.timingAvailable ? null : <span className="ox-n"> · session span</span>}
        </span>
      ),

      sections: row.sectionCount,
      units: row.unitCount,
      favourites: row.favourites,

      outcome:
        row.outcome === "skipped" ? (
          <Missing what={row.outcomeLabel} />
        ) : (
          <span>{row.outcomeLabel}</span>
        ),

      followUp:
        row.followUp === "required" ? (
          <span className="ox-chip" data-tone="watch" title={row.followUpLabel}>
            <span className="ox-chip-mark" aria-hidden="true" />
            {FOLLOW_UP_SHORT[row.followUp]}
          </span>
        ) : row.followUp === "not_required" ? (
          <span className="ox-chip" data-tone="settled" title={row.followUpLabel}>
            <span className="ox-chip-mark" aria-hidden="true" />
            {FOLLOW_UP_SHORT[row.followUp]}
          </span>
        ) : (
          <Missing what={FOLLOW_UP_SHORT[row.followUp]} />
        ),

      visitor: <span className="ox-n">{row.visitor.display}</span>,
    },
  }));

  return (
    <DataTable
      caption={canOpen ? caption : `${caption} ${MEETINGS_NOT_OPENABLE}`}
      columns={columns}
      rows={data}
      codeColumn="meeting"
      period={period}
      empty={{ title: "No meetings in this period", note: emptyNote }}
    />
  );
}
