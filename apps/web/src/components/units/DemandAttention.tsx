import Link from "next/link";
import {
  sentence,
  type AttentionCheck,
  type AttentionKind,
  type AttentionState,
  type Language,
  type PeriodPreset,
  type Sentence,
} from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { AttentionList, Sample } from "@/components/product";
import { SUBJECTS_SHOWN } from "@/components/attention";

/**
 * HIGH INTEREST, NEVER SHORTLISTED.
 *
 * The one state a unit register exists to surface. A flat that nobody opens is
 * a marketing question; a flat that everybody opens and nobody keeps, or keeps
 * and nobody follows up, is a question somebody can answer this week — and it
 * is invisible in a table sorted by views, because the two columns that
 * disagree sit ten inches apart.
 *
 * One check in `ATTENTION_KIND_DEFINITIONS` asks it:
 *
 *   viewed_never_shortlisted     opened again and again, never kept.
 *
 * Its other end, "kept, and then nothing was recorded", was retired on
 * 2026-10-02 (R04-1, R07-3): a shortlist that ended "Presentation only" or "Not
 * interested" is accounted for, and one with no recorded outcome is the meeting
 * register's own check. Measured before it went, nothing was left for it.
 *
 * The check is read straight off `getAttention` and not recomputed here. A
 * screen that derived its own version of this state would be a second answer to
 * a question the product already answers on the attention surface, three clicks
 * away and disagreeing.
 *
 * ## Why the checks are drawn even when nothing is raised
 *
 * "Nothing is wrong" and "we could not look" are different answers and an empty
 * panel renders them identically. `AttentionCheck` carries `clear` and
 * `unavailable` as distinct states with a sentence for each — a check that
 * could not be asked says so, and that is the honest reading. So the alerts are
 * one list and the questions are another, and both are always present.
 *
 * ## The sample size, and the noun this file has to supply
 *
 * No verdict without a sample size. `AttentionState` carries `sampleSize` and
 * `minimumSampleSize` but no noun for them, and the two states count different
 * things — meetings in one, recorded views in the other. `Sample` requires the
 * noun and has no default, for exactly the reason that a wrong denominator is
 * worse than a verbose call site, so the words live here and the gap is
 * reported: the noun belongs beside the number in the read model.
 */

/** The question this region asks. */
const KINDS: readonly AttentionKind[] = ["viewed_never_shortlisted"];

const SAMPLE_NOUNS: Readonly<Record<string, string>> = {
  viewed_never_shortlisted: "recorded views",
};

/*
 * "Asked of 3 meetings in quarter to date." A single meeting is spelled out,
 * in each language; after "z" Slovak takes the genitive.
 */
export const DEMAND_ATTENTION_ASKED_SENTENCE: Sentence = {
  en: {
    text: "Asked of {meetings|count} in {period}.",
    words: { meetings: { one: "one meeting", other: "{count} meetings" } },
  },
  sk: {
    text: "Vyhodnotené z {meetings|count} v období {period}.",
    words: {
      meetings: { one: "jedného stretnutia", few: "{count} stretnutí", other: "{count} stretnutí" },
    },
  },
  hu: {
    text: "{meetings|count} alapján vizsgálva, {az:period} időszakban.",
    words: { meetings: { one: "Egy találkozó", other: "{count} találkozó" } },
  },
};

export function DemandAttention({
  states,
  checks,
  period,
  meetingCount,
  periodLabel,
  language,
}: {
  /** Every raised state from `getAttention`. Filtered here, never recomputed. */
  readonly states: readonly AttentionState[];
  readonly checks: readonly AttentionCheck[];
  readonly period: PeriodPreset;
  /** Meetings the checks were asked of. The denominator for the whole region. */
  readonly meetingCount: number;
  readonly periodLabel: string;
  /** The words' language; the page passes the reader's once there is a choice. */
  readonly language: Language;
}) {
  const mine = states.filter((state) => KINDS.includes(state.kind));
  const asked = checks.filter((check) => KINDS.includes(check.kind));

  return (
    <section className="ox-plane">
      <div className="ox-section-head">
        <h2 className="ox-section-title">High interest, never shortlisted</h2>
        <p className="ox-section-note">
          {sentence(language, DEMAND_ATTENTION_ASKED_SENTENCE, {
            count: meetingCount,
            period: periodLabel,
          })}{" "}
          A unit opened repeatedly and never kept is a question the register cannot show in a
          column.
        </p>
      </div>

      <AttentionList
        language={language}
        alerts={mine.map((state) => state.alert)}
        period={period}
        label="High interest, never shortlisted"
        emptyNote="The question was not raised in this period. What it asked, and what it found, is below."
      />

      <ul className="ox-scope">
        {asked.map((check) => {
          const raised = mine.find((state) => state.kind === check.kind) ?? null;
          return (
            <li className="ox-scope-item" key={check.kind}>
              <span>{check.label}</span>
              {raised === null ? (
                <p className="ox-section-note">{check.reason}</p>
              ) : (
                <span className="ox-row-states">
                  <Sample n={raised.sampleSize} noun={SAMPLE_NOUNS[check.kind] ?? "records"} />
                  {raised.belowMinimum ? (
                    <span className="ox-shortfall">
                      below the minimum of {raised.minimumSampleSize} — named, not ranked
                    </span>
                  ) : null}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/*
       * WHAT THE RAISED STATE IS ACTUALLY ABOUT.
       *
       * `AlertItem` carries the sentence and the one action; `subjects` carries
       * the flats and meetings the sentence is about, and dropping them would
       * leave a reader agreeing with a statement they cannot act on. They are
       * listed under the alerts rather than inside them, because the alert list
       * is a shared primitive with no slot for them and hand-rolling a second
       * alert list to gain one would be a dialect.
       */}
      {mine.map((state) =>
        state.subjects.length === 0 ? null : (
          <div key={state.kind}>
            <p className="ox-subhead">{state.alert.title}</p>
            <ul className="ox-chipset">
              {state.subjects.slice(0, SUBJECTS_SHOWN).map((subject) => (
                <li key={subject.id}>
                  {subject.href === null ? (
                    /*
                     * No route, so nothing that looks like a control. A chip
                     * styled as a toggle that does not navigate is the
                     * control-that-does-nothing the doctrine forbids, and it is
                     * worst here, standing beside chips that do.
                     */
                    <span className="ox-n">{subject.label}</span>
                  ) : (
                    <Link
                      className="ox-toggle"
                      href={dynamicRoute(withPeriod(subject.href, period))}
                    >
                      {subject.label}
                    </Link>
                  )}
                </li>
              ))}
              {state.subjects.length > SUBJECTS_SHOWN ? (
                <li>
                  <span className="ox-n">and {state.subjects.length - SUBJECTS_SHOWN} more</span>
                </li>
              ) : null}
            </ul>
          </div>
        ),
      )}
    </section>
  );
}
