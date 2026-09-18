import type { PeriodPreset } from "@observer/readmodels";

import { glyphFor, type OpeningGlyph } from "./questions";

/**
 * THE QUESTIONS WORTH ASKING, AS CONTROLS THAT REALLY ASK THEM.
 *
 * The approved artefact draws these as a column of wide one-line rows beneath
 * the prompt, and `iris-shell.css` §"the questions worth asking" is that
 * design: `.irs-suggestion`, a 44px mark, the question, a chevron. The rows are
 * kept exactly as approved. What changes is what they DO.
 *
 * ## They ask, rather than filling the field
 *
 * `components/iris/AskIris.tsx` — the reviewed prototype — sets the textarea
 * from a suggestion and stops there, because at the time there was nothing to
 * send to and a send control that appeared to work would have been the screen
 * telling its first lie. There is something to send to now:
 * `repository.getAskSession` prepares a real answer for each of these questions
 * out of this project's own read models. So a row asks its question.
 *
 * ## Each row is a submit button in a GET form, and that is the whole mechanism
 *
 * `<button type="submit" name="q" value="…">` submits that one value. The
 * consequences are the reason this is not a click handler:
 *
 *   - It works with no JavaScript at all. Nothing on this surface needs script,
 *     which is also why there is no client component here to leak state into.
 *   - The asked question ends up IN THE URL, so an answer can be linked, sent
 *     to a colleague and returned to. This application stores nothing in the
 *     browser — a test scans `apps/web/src` for `localStorage`,
 *     `sessionStorage` and `indexedDB` and expects zero — so the query string
 *     is the only place a question can live.
 *   - It is a real control. The doctrine forbids a control that looks ready and
 *     does nothing, and every row here navigates to an answer that exists.
 *
 * It is a SEPARATE form from the prompt card for one blunt reason: both carry a
 * field named `q`, and a single form would submit the textarea's `q` and the
 * pressed button's `q` together, leaving the page with an array where it
 * expects a question.
 *
 * ## Only answerable questions are offered
 *
 * The caller passes the questions the read model actually prepared an answer
 * for. An opening that landed on "there is no prepared answer for this" would
 * be a control that looks ready and does nothing by a slower route.
 */

const ICON_PATHS: Readonly<Record<OpeningGlyph, readonly string[]>> = {
  trend: ["M16 7h6v6", "m22 7-8.5 8.5-5-5L2 17"],
  units: ["M3 21h18", "M5 21V7l7-4 7 4v14", "M9 21v-6h6v6"],
  period: ["M3 12a9 9 0 1 0 9-9", "M3 4v5h5", "M12 7v5l3 2"],
  people: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
    "M22 21v-2a4 4 0 0 0-3-3.87",
  ],
  next: [
    "M12 2v4",
    "M12 18v4",
    "M4.9 4.9l2.9 2.9",
    "M16.2 16.2l2.9 2.9",
    "M2 12h4",
    "M18 12h4",
    "M4.9 19.1l2.9-2.9",
    "M16.2 7.8l2.9-2.9",
  ],
};

function Glyph({ icon }: { readonly icon: OpeningGlyph }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[icon].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function AskOpenings({
  action,
  questions,
  period,
  selection,
  label,
}: {
  /** The Ask IRIS path itself. The form submits back to this screen. */
  readonly action: string;
  /** Questions the read model has prepared an answer for. Nothing else. */
  readonly questions: readonly string[];
  readonly period: PeriodPreset;
  /** What was selected when the reader arrived, carried across the submit. */
  readonly selection: string | null;
  /** The accessible name of the list of openings. */
  readonly label: string;
}) {
  if (questions.length === 0) return null;

  return (
    <form method="get" action={action} aria-label={label}>
      {/*
       * A GET submit REPLACES the whole query string with this form's fields,
       * so anything the reader had chosen that is not a field here is gone the
       * moment they press a row. The period above all: a reader who chose
       * "Last 28 days", asked a question and was silently returned to the
       * quarter would be reading an answer measured over a span they did not
       * pick. `withPeriod` cannot help — there is no href to rewrite — so it
       * travels as a hidden field, unconditionally, default value included.
       */}
      <input type="hidden" name="period" defaultValue={period} />
      {selection === null ? null : (
        <input type="hidden" name="selection" defaultValue={selection} />
      )}

      <ul className="irs-suggestions">
        {questions.map((question) => (
          <li key={question}>
            <button type="submit" name="q" value={question} className="irs-suggestion">
              <span className="irs-suggestion-mark">
                <Glyph icon={glyphFor(question)} />
              </span>
              <span>{question}</span>
              <svg
                className="irs-suggestion-chevron"
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </form>
  );
}
