import Link from "next/link";
import { FOLLOW_UP_LABELS, type MeetingRow, type PeriodPreset } from "@observer/readmodels";

import { DataTable, Unavailable, type DataColumn, type DataRow } from "@/components/product";
import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { Chip } from "./Chip";
import { FOLLOW_UP_TONES, OUTCOME_TONES } from "./vocabulary";

/**
 * THE MEETING REGISTER — every showroom presentation in the period, as a table.
 *
 * This is the densest measured body in the product, so it is the clearest case
 * for the paper ground ADR-0034 defines: nine columns of readings, one row per
 * presentation, nothing here concluded and nothing here to decide. The plate is
 * applied by the page rather than by this component, for the same reason
 * `PageHead` can never be put on paper — where the seam falls is a property of
 * the screen's composition and not of the thing being composed.
 *
 * ## Nine columns, and the one that is not a measurement
 *
 * Eight of the nine are things a source recorded: when, who presented, which
 * surface it ran on, how long, which units were opened, how many were
 * shortlisted. The ninth — the recorded outcome — is a tap on the showroom's
 * outcome widget at the end of the meeting, and it is the one column on this
 * screen that can be misread as a transaction. A row reading "Purchase" says
 * that the agent selected Purchase, not that a flat was sold. The page states
 * that above the table in words; the column header says "Recorded outcome"
 * rather than "Outcome" so the qualification survives a reader who scrolled
 * past the sentence.
 *
 * ## The visitor column carries no person
 *
 * `VisitorLabel` is privacy-safe by construction rather than by review: the
 * type has no field a name, an email or a phone number could sit in, and its
 * `display` is produced from a closed vocabulary and a count of previous
 * meetings (`docs/05-identity.md` §2 rule 3, `docs/10-policies.md` §3). This
 * component renders that string and never assembles one, so there is no call
 * site here through which a contact detail could reach the screen.
 *
 * ## Follow-up, and the state that belongs to the region rather than the row
 *
 * `FollowUpState` has four members and three of them are facts about the
 * meeting: a follow-up was recorded as needed, was recorded as not needed, or
 * no outcome was recorded at all. The fourth, `unavailable`, is not about the
 * meeting — it says no CRM is connected to the project, which is true of every
 * row at once. It is therefore stated ONCE, in a band above the table, and each
 * cell carries only the terse missing mark. Four dozen rows each repeating "No
 * CRM connected" is the defect `docs/12-visual-autopsy.md` §9 records, at
 * table scale.
 *
 * ## There are no sort controls, and that is deliberate
 *
 * `DataTable` can render a sortable header, and `MeetingFilters` has no sort
 * axis — the read model returns the register newest first and offers no other
 * order. A header that looked sortable and reordered nothing would be exactly
 * the control-that-does-nothing the doctrine forbids, so no `sort` is passed
 * and the ordering is stated in the caption instead. The gap is reported.
 */

/**
 * The units a meeting opened, each one a route to its own page.
 *
 * The single most important cell for the test the doctrine ends on: hide the
 * logo, and a column of unit codes standing beside a duration and a shortlist
 * count is unmistakably a building being sold. A count alone would have been a
 * number about anything.
 *
 * An empty list is a genuine zero and says so in words. It is NOT drawn with
 * the missing treatment: a presentation that never reached the Residences
 * section really did open no units, and that is an answer rather than an
 * absence of one.
 */
function Units({
  codes,
  base,
  period,
}: {
  readonly codes: readonly string[];
  readonly base: string;
  readonly period: PeriodPreset;
}) {
  if (codes.length === 0) return <span className="ox-n">None opened</span>;

  return (
    <span className="ox-row-states">
      {codes.map((code) => (
        <Link
          className="ox-evidence"
          key={code}
          href={dynamicRoute(withPeriod(`${base}/units/${encodeURIComponent(code)}`, period))}
        >
          {code}
        </Link>
      ))}
    </span>
  );
}

const COLUMNS: readonly DataColumn[] = [
  { key: "when", label: "When" },
  { key: "agent", label: "Agent" },
  { key: "visitor", label: "Visitor" },
  { key: "channel", label: "Channel" },
  { key: "duration", label: "Length", numeric: true },
  { key: "units", label: "Units opened" },
  { key: "favourites", label: "Shortlisted", numeric: true },
  { key: "outcome", label: "Recorded outcome" },
  { key: "followUp", label: "Follow-up" },
];

export function MeetingRegister({
  rows,
  base,
  period,
  caption,
  emptyState,
  crmConnected,
}: {
  readonly rows: readonly MeetingRow[];
  /** `/{tenantSlug}/{projectSlug}`. Unit and meeting routes hang off it. */
  readonly base: string;
  readonly period: PeriodPreset;
  /** What this register lists, in a sentence, including its ordering. */
  readonly caption: string;
  /** The read model's own words for an empty result. Never composed here. */
  readonly emptyState: string;
  /** Whether the project has a CRM at all. Governs the band above the table. */
  readonly crmConnected: boolean;
}) {
  const data: readonly DataRow[] = rows.map((row) => ({
    key: row.meetingId,
    cells: {
      when: (
        <Link href={dynamicRoute(withPeriod(row.href, period))}>
          {row.label}
          <span className="ox-sr"> — open this meeting</span>
        </Link>
      ),
      agent: row.agentName,
      visitor: row.visitor.display,
      channel: row.channelLabel,
      /*
       * A legacy import carries the session's own length and not a sum of timed
       * steps, and `timingAvailable` is the read model saying so. The figure is
       * real either way, so it is printed either way; what changes is that the
       * weaker one explains itself on hover and the register's findings state
       * the same thing once, in full, for every row it applies to.
       */
      duration: row.timingAvailable ? (
        row.durationDisplay
      ) : (
        <span title="From the legacy import: the session's own length, not a sum of timed steps.">
          {row.durationDisplay}
        </span>
      ),
      units: <Units codes={row.unitsViewed} base={base} period={period} />,
      favourites: row.favourites,
      outcome: (
        <Chip
          tone={OUTCOME_TONES[row.outcome]}
          title="Recorded by the agent at the end of the meeting."
        >
          {row.outcomeLabel}
        </Chip>
      ),
      followUp:
        row.followUp === "unavailable" ? (
          /*
           * The terse mark, and the reason only on hover. The band above the
           * table carries it in full; repeating it here would be the same
           * sentence forty times in one viewport.
           */
          <span className="ox-value" data-missing="true" title={row.followUpLabel}>
            Unavailable
          </span>
        ) : (
          <Chip tone={FOLLOW_UP_TONES[row.followUp]} title={row.followUpLabel}>
            {FOLLOW_UP_LABELS[row.followUp]}
          </Chip>
        ),
    },
  }));

  return (
    <>
      {crmConnected ? null : (
        /*
         * Inside the plate rather than above it, deliberately.
         *
         * This states why one COLUMN cannot be answered, so it belongs beside
         * the column and not in the graphite band with the screen's
         * conclusions. There is no action: a developer looking at a project
         * whose CRM belongs to the agency cannot connect it, and a control that
         * sent them somewhere they cannot act would be worse than none.
         */
        <Unavailable
          what="Follow-up state"
          why="no CRM is connected to this project, so no meeting on it carries a verified follow-up"
          action={null}
          period={period}
        />
      )}

      <DataTable
        caption={caption}
        columns={COLUMNS}
        rows={data}
        codeColumn="when"
        period={period}
        empty={{ title: "No meetings to show", note: emptyState }}
      />
    </>
  );
}
