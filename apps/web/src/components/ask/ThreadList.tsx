import Link from "next/link";
import {
  DEFAULT_LANGUAGE,
  plural,
  type AskThreadSummary,
  type Language,
  type PeriodPreset,
  type PluralForms,
} from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

/**
 * EARLIER QUESTIONS, AS A REGISTER.
 *
 * Ask IRIS is a primary interface rather than a chatbot, and the difference
 * shows here: a question worth asking is worth returning to, so each one keeps
 * a URL instead of scrolling out of a transcript. This is the index of those
 * URLs.
 *
 * ## It sits on paper, and the reason is the same everywhere
 *
 * ADR-0034 puts what was MEASURED on the paper ground and what we CONCLUDE on
 * graphite. A row here is a record — a title, a stamp, the project and period
 * it was answered against, how many turns it holds — and a column of records is
 * exactly the dense measured body paper exists for. The screen's conclusion
 * about the list stays above it, on graphite. The caller applies the plate; the
 * list draws inside whatever ground it is given, because every rule in the
 * sheet is written against token names rather than colours.
 *
 * ## `pinned` is a state the read model holds, not one this surface sets
 *
 * `AskThreadSummary.pinned` is real: the read model marks two of the
 * demonstration threads. It is drawn as a chip because that is what it is — a
 * fact about the row. Nothing on this deployment WRITES it, so no pin control
 * is drawn. That refusal is stated once for the whole region by the screen
 * rather than repeated as a dead control on every row: `docs/12-visual-autopsy`
 * §9 records four panels in one viewport each repeating the same absence, and a
 * pin, a rename and a delete on five rows would be fifteen versions of that.
 *
 * ## Nobody held these conversations, and the type says so
 *
 * `AskThreadOrigin` is a single-member union — `demonstration` — precisely so
 * that no component can compare its way into presenting one of these as
 * somebody's own past question. There is no value to test against, so this
 * component draws no "real" variant, and the screen states the origin in words
 * from the read model's own `demonstrationNotice`.
 */
/** A conversation's length. The Slovak and Hungarian forms are the ones a count takes standing alone. */
export const THREAD_TURNS: PluralForms = {
  en: { one: "turn", other: "turns" },
  sk: { one: "výmena", few: "výmeny", other: "výmen" },
  hu: { one: "forduló", other: "forduló" },
};

export function ThreadList({
  threads,
  period,
  label,
  language = DEFAULT_LANGUAGE,
}: {
  readonly threads: readonly AskThreadSummary[];
  readonly period: PeriodPreset;
  /** The accessible name of the register. */
  readonly label: string;
  /** The words' language; the page passes the reader's once there is a choice. */
  readonly language?: Language;
}) {
  if (threads.length === 0) return null;

  return (
    <ul className="ox-threads" aria-label={label}>
      {threads.map((thread) => (
        <li className="ox-thread-row" key={thread.threadId}>
          {/*
           * `h3`: the register always sits under a section heading, and the
           * title of a conversation is a heading rather than a cell — it is
           * what a reader scans for and what a screen reader lists.
           */}
          <h3 className="ox-thread-title">
            <Link href={dynamicRoute(withPeriod(thread.href, period))}>{thread.title}</Link>
          </h3>

          <span className="ox-thread-when">{thread.askedAtDisplay}</span>

          <span className="ox-thread-context">
            {thread.projectLabel} · {thread.periodLabel}
            {thread.selectionLabel === null ? null : <> · {thread.selectionLabel}</>} ·{" "}
            {thread.turnCount} {plural(language, thread.turnCount, THREAD_TURNS)}
            {thread.pinned ? (
              <>
                {" "}
                {/*
                 * The human diamond. In this system blue means "a person
                 * decided this, and a person can change it" — which is exactly
                 * what a pin is, even on a deployment where the changing is not
                 * built yet.
                 */}
                <span className="ox-chip" data-tone="human">
                  <span className="ox-chip-mark" aria-hidden="true" />
                  Pinned
                </span>
              </>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
