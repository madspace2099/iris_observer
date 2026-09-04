import type { ReactNode } from "react";
import Link from "next/link";
import type { AskContext, PeriodPreset } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

/**
 * THE PROMPT, AND THE SENTENCE THAT KEEPS IT HONEST.
 *
 * The card, the field, the model control, the send button and the notice
 * beneath them are the approved artefact — `.irs-ask*` in `iris-shell.css`,
 * reviewed and accepted with ADR-0033 — and they are kept, measurement for
 * measurement. Three things about them changed, and each is a consequence of
 * the surface having become real rather than a taste.
 *
 * ## 1. The send control works, because there is now something behind it
 *
 * The reviewed prototype disabled it. That was right at the time: no account on
 * this deployment holds a model connection (ADR-0030), the configured key is
 * refused, and a prompt that looked ready to answer would have been the screen
 * telling its first lie. But `repository.getAskSession` returns a real
 * `AskSession` composed by the read models, so there IS an answer path — it is
 * simply not a model. The card is a `<form method="get">`, the button submits
 * it, and the question lands in the URL where it can be linked and returned to.
 *
 * A GET form rather than a client component: nothing here needs script, the
 * answer is server-rendered, and this application keeps nothing in the browser
 * — a test scans `apps/web/src` for `localStorage`, `sessionStorage` and
 * `indexedDB` and expects zero hits, so a question either lives in the query
 * string or it does not survive a refresh.
 *
 * ## 2. The model control is a statement, not a picker
 *
 * The artefact draws a dropdown for choosing a model. There is no model and
 * nothing to choose, so it is rendered as what it truthfully is: a label saying
 * where the answers come from. It has no chevron and it is not a button,
 * because a disabled control shaped like a menu still promises a menu. This is
 * the one place the approved geometry is used for a different element, and the
 * gap is reported rather than papered over.
 *
 * ## 3. The microphone is drawn, disabled, and says why
 *
 * The artefact has voice. `apps/web/next.config.ts` sends
 * `Permissions-Policy: camera=(), microphone=(), geolocation=()`, so the
 * browser refuses the microphone to this document whatever any code asks for —
 * voice is dead at the header, not in the component. The doctrine's answer to a
 * control with nothing behind it is that it is disabled, carries
 * `aria-disabled`, and states its reason; the reason is in the notice in
 * readable words rather than only in a `title`, because a `disabled` button
 * cannot take focus and a tooltip nobody can reach is not a statement.
 *
 * ## The scope line
 *
 * `AskContext` exists so that the reader can see what a question will be
 * answered against BEFORE they ask it. An assistant whose scope is invisible
 * produces answers nobody can check. Project and period are the shell's context
 * band as well; they are repeated here because this is the sentence the answer
 * is qualified by, and a reader composing a question should not have to look up
 * to the frame to know what "this period" means.
 */
export function AskComposer({
  action,
  context,
  period,
  question,
  selection,
  clearSelectionHref,
  children,
}: {
  /** The Ask IRIS path. Both forms on this screen submit back to it. */
  readonly action: string;
  /** Project, period and selection, as the read model states them. */
  readonly context: AskContext;
  readonly period: PeriodPreset;
  /** What the reader last asked, so a re-read of the URL refills the field. */
  readonly question: string;
  readonly selection: string | null;
  /** Where "answer without the selection" goes. Null when nothing is selected. */
  readonly clearSelectionHref: string | null;
  /** The openings, and anything else that belongs inside the composition. */
  readonly children?: ReactNode;
}) {
  return (
    <div className="irs-ask">
      <p className="ox-section-note">
        Answering about <strong>{context.projectLabel}</strong> over{" "}
        <strong>{context.periodLabel}</strong>
        {context.selectionLabel === null ? null : (
          <>
            , narrowed to <strong>{context.selectionLabel}</strong>
          </>
        )}
        .
        {clearSelectionHref === null ? null : (
          <>
            {" "}
            <Link
              className="ox-btn"
              data-weight="quiet"
              href={dynamicRoute(withPeriod(clearSelectionHref, period))}
            >
              Answer about the whole project
            </Link>
          </>
        )}
      </p>

      <form className="irs-ask-card" method="get" action={action}>
        {/*
         * The label is for assistive technology only. The artefact has no
         * visible label above the field — the placeholder and the surrounding
         * composition carry it — and a visible one here would break a card
         * whose whole geometry is one 181px well.
         */}
        <label className="ox-sr" htmlFor="ask-prompt">
          Ask IRIS about {context.projectLabel}
        </label>

        {/* The period and any selection survive the submit. See AskOpenings. */}
        <input type="hidden" name="period" defaultValue={period} />
        {selection === null ? null : (
          <input type="hidden" name="selection" defaultValue={selection} />
        )}

        {/*
         * `defaultValue`, not `value`. The field is uncontrolled: the browser
         * owns it between renders and the server owns it across submits, and a
         * `value` with no `onChange` would freeze the control and make React
         * warn about a field it cannot change.
         */}
        <textarea
          id="ask-prompt"
          name="q"
          className="irs-ask-field"
          placeholder="Ask IRIS…"
          spellCheck={false}
          defaultValue={question}
        />

        <div className="irs-ask-foot">
          <span className="ox-btn-row">
            {/*
             * Not a button and not a select. There is nothing to choose. It
             * states where the answer comes from, in the control's own place
             * and geometry.
             */}
            <span
              className="irs-ask-model"
              title="No account on this deployment holds a model connection. Answers are composed by Observer's read models."
            >
              <span>Read models</span>
            </span>

            <button
              type="button"
              className="ox-btn"
              disabled
              aria-disabled="true"
              title="Voice input is switched off for this document by Permissions-Policy: microphone=()."
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <path d="M12 19v3" />
              </svg>
              Voice
            </button>
          </span>

          <button
            type="submit"
            className="irs-ask-send"
            aria-label={`Ask this question about ${context.projectLabel}`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
      </form>

      <p className="irs-ask-notice">
        <strong>Composed, not written.</strong>
        <span>
          No account on this deployment holds a model connection, and none is used. Every answer
          here is assembled by Observer&rsquo;s read models from the same facts the other screens
          draw, so the same question over the same period returns the same figures — and every
          figure keeps the evidence it rests on. Voice input is switched off for this document at
          the header (<code>Permissions-Policy: microphone=()</code>), so the microphone cannot be
          turned on from this screen.
        </span>
      </p>

      {children}
    </div>
  );
}
