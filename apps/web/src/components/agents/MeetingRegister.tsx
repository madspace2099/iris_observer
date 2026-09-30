import Link from "next/link";
import { type Language, type MeetingRow, type PeriodPreset } from "@observer/readmodels";

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
 * ## The buyer's name stands beside the label, behind the register's gate
 *
 * `MeetingRow.visitor` is a `VisitorLabel`: a closed enum and an integer —
 * "First meeting", "Returning · 3rd meeting", "Not linked to a contact" —
 * with no field a name could sit in. `MeetingRow.visitorName` is the name,
 * beside it and never inside it: joined per render by the read model from the
 * contact directory and stored nowhere, null for a walk-in, an erased contact,
 * a withdrawn behavioural-linking consent, a contact with no name recorded,
 * and for every viewer outside `AGENT_REGISTER_ROLES`. That is
 * `docs/22-visitor-name-display.md` §5's decision (B) and §6's three
 * promises. This component renders the two strings it is given and assembles
 * neither; whether it is rendered at all is the agent screen's decision, on
 * the server, for the meeting drill-down's roles.
 *
 * ## Follow-up has three states and one of them is not "no"
 *
 * `FOLLOW_UP_STATES` separates "the recorded outcome asks for one", "the
 * recorded outcome does not" and "no outcome was recorded". The last is an
 * absence and is drawn as one; folding it into "no follow-up needed" would turn
 * a gap in the record into a decision somebody made. `followUpLabel` is the
 * read model's sentence and is carried on the cell's `title` so a reader can
 * ask what a state means without the column growing to hold a sentence. A
 * fourth state, "No CRM", used to stand here; the outcome is the room's record
 * and no CRM is asked.
 */

/*
 * The register's own words, in each language a report can be printed in. The
 * short word for each follow-up state is here; the long sentence is the read
 * model's. Slovak and Hungarian are drafts for review (P2-17).
 */
interface RegisterWords {
  readonly columns: readonly [string, string, string, string, string, string, string, string];
  readonly followUp: Readonly<Record<MeetingRow["followUp"], string>>;
  readonly notTimed: string;
  readonly imported: string;
  readonly span: string;
  readonly empty: string;
  readonly notOpenable: string;
}

const REGISTER_WORDS: Readonly<Record<Language, RegisterWords>> = {
  en: {
    columns: [
      "Meeting",
      "Length",
      "Sections",
      "Units opened",
      "Shortlisted",
      "Recorded outcome",
      "Follow-up",
      "Visitor",
    ],
    followUp: { required: "Needed", not_required: "Not needed", not_recorded: "No outcome" },
    notTimed: "Not timed",
    imported: "Imported without step timing.",
    span: " · session span",
    empty: "No meetings in this period",
    notOpenable: MEETINGS_NOT_OPENABLE,
  },
  sk: {
    columns: [
      "Stretnutie",
      "Dĺžka",
      "Sekcie",
      "Otvorené byty",
      "Obľúbené",
      "Zaznamenaný výsledok",
      "Ďalší kontakt",
      "Návštevník",
    ],
    followUp: { required: "Potrebný", not_required: "Nepotrebný", not_recorded: "Bez výsledku" },
    notTimed: "Bez merania času",
    imported: "Importované bez časovania krokov.",
    span: " · rozpätie stretnutia",
    empty: "V tomto období žiadne stretnutia",
    notOpenable:
      "Prehrávanie stretnutia nie je súčasťou prístupu tohto konta, preto sú riadky nižšie uvedené bez odkazov.",
  },
  hu: {
    columns: [
      "Találkozó",
      "Hossz",
      "Szakaszok",
      "Megnyitott lakások",
      "Kedvencek",
      "Rögzített eredmény",
      "Utánkövetés",
      "Látogató",
    ],
    followUp: {
      required: "Szükséges",
      not_required: "Nem szükséges",
      not_recorded: "Nincs eredmény",
    },
    notTimed: "Nincs időmérés",
    imported: "Lépésidőzítés nélkül importálva.",
    span: " · a találkozó teljes hossza",
    empty: "Ebben az időszakban nincs találkozó",
    notOpenable:
      "A találkozó visszajátszása nem része ennek a fióknak, ezért az alábbi sorok hivatkozás nélkül szerepelnek.",
  },
};

export function MeetingRegister({
  rows,
  period,
  caption,
  canOpen,
  emptyNote,
  language,
}: {
  readonly rows: readonly MeetingRow[];
  readonly period: PeriodPreset;
  readonly caption: string;
  /** Whether this reader may open a meeting. See the meetings register for why. */
  readonly canOpen: boolean;
  readonly emptyNote: string;
  /** The words' language: English on the screens, the reader's choice on a printed report. */
  readonly language: Language;
}) {
  const words = REGISTER_WORDS[language];
  const FOLLOW_UP_SHORT = words.followUp;
  const columns: readonly DataColumn[] = [
    { key: "meeting", label: words.columns[0] },
    { key: "duration", label: words.columns[1], numeric: true },
    { key: "sections", label: words.columns[2], numeric: true },
    { key: "units", label: words.columns[3], numeric: true },
    { key: "favourites", label: words.columns[4], numeric: true },
    { key: "outcome", label: words.columns[5] },
    { key: "followUp", label: words.columns[6] },
    { key: "visitor", label: words.columns[7] },
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
        <Missing what={words.notTimed} />
      ) : (
        <span title={row.timingAvailable ? undefined : words.imported}>
          {row.durationDisplay}
          {row.timingAvailable ? null : <span className="ox-n">{words.span}</span>}
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

      visitor: (
        <span>
          {row.visitorName === null ? null : (
            <>
              <span className="ox-visitor-name">{row.visitorName}</span>{" "}
            </>
          )}
          <span className="ox-n">{row.visitor.display}</span>
        </span>
      ),
    },
  }));

  return (
    <DataTable
      caption={canOpen ? caption : `${caption} ${words.notOpenable}`}
      columns={columns}
      rows={data}
      codeColumn="meeting"
      period={period}
      empty={{ title: words.empty, note: emptyNote }}
    />
  );
}
