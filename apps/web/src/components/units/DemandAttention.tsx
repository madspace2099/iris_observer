import Link from "next/link";
import type {
  AttentionCheck,
  AttentionKind,
  AttentionState,
  PeriodPreset,
} from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { AttentionList, Sample } from "@/components/product";

/**
 * HIGH INTEREST, LOW CONVERSION.
 *
 * The one state a unit register exists to surface. A flat that nobody opens is
 * a marketing question; a flat that everybody opens and nobody keeps, or keeps
 * and nobody follows up, is a question somebody can answer this week — and it
 * is invisible in a table sorted by views, because the two columns that
 * disagree sit ten inches apart.
 *
 * Two of the six checks in `ATTENTION_KIND_DEFINITIONS` ask exactly that pair
 * of questions, from the two ends:
 *
 *   viewed_never_shortlisted     opened again and again, never kept.
 *   high_interest_no_follow_up   kept, and then nothing was recorded.
 *
 * They are read straight off `getAttention` and neither is recomputed here. A
 * screen that derived its own version of this state would be a second answer to
 * a question the product already answers on the attention surface, three clicks
 * away and disagreeing.
 *
 * ## Why the checks are drawn even when nothing is raised
 *
 * "Nothing is wrong" and "we could not look" are different answers and an empty
 * panel renders them identically. `AttentionCheck` carries `clear` and
 * `unavailable` as distinct states with a sentence for each — a project with no
 * CRM connected genuinely cannot be asked whether a shortlist was followed up,
 * and saying so is the honest reading. So the alerts are one list and the
 * questions are another, and both are always present.
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

/** The two questions this region asks, in the order a flat travels through. */
const KINDS: readonly AttentionKind[] = ["viewed_never_shortlisted", "high_interest_no_follow_up"];

const SAMPLE_NOUNS: Readonly<Record<string, string>> = {
  viewed_never_shortlisted: "recorded views",
  high_interest_no_follow_up: "meetings that shortlisted a unit",
};

export function DemandAttention({
  states,
  checks,
  period,
  meetingCount,
  periodLabel,
}: {
  /** Every raised state from `getAttention`. Filtered here, never recomputed. */
  readonly states: readonly AttentionState[];
  readonly checks: readonly AttentionCheck[];
  readonly period: PeriodPreset;
  /** Meetings the checks were asked of. The denominator for the whole region. */
  readonly meetingCount: number;
  readonly periodLabel: string;
}) {
  const mine = states.filter((state) => KINDS.includes(state.kind));
  const asked = checks.filter((check) => KINDS.includes(check.kind));

  return (
    <section className="ox-plane">
      <div className="ox-section-head">
        <h2 className="ox-section-title">High interest, low conversion</h2>
        <p className="ox-section-note">
          Asked of {meetingCount === 1 ? "one meeting" : `${meetingCount} meetings`} in{" "}
          {periodLabel}. A unit opened repeatedly and never kept, and a unit kept with nothing
          recorded afterwards, are two ends of one question the register cannot show in a column.
        </p>
      </div>

      <AttentionList
        alerts={mine.map((state) => state.alert)}
        period={period}
        label="High interest, low conversion"
        emptyNote="Neither question was raised in this period. What each of them asked, and what it found, is below."
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
              {state.subjects.map((subject) => (
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
            </ul>
          </div>
        ),
      )}
    </section>
  );
}
