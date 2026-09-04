import type { ReactNode } from "react";
import Link from "next/link";
import type { AskAnswer, AskHistoryView, AskSession, AskThreadSummary } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { AskField } from "./AskField";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Dots,
  Info,
  Microphone,
  OPENING_GLYPHS,
  Pencil,
  Pin,
  Send,
  Share,
  Sparkle,
  Thread,
  Trash,
} from "./icons";

/**
 * ASK IRIS, rebuilt from the design the user delivered as the source of truth.
 *
 * The composition is the export's: a composer floating above the fold, the
 * openings beneath it while nothing has been asked, and one panel — history or
 * conversation — in their place once something has. Every measurement lives in
 * `packages/ui/src/ask-iris.css`, transcribed rather than approximated; this
 * file is only the structure and the data.
 *
 * ## Every state has an address
 *
 * The export holds its state in a component: `historyOpen`, `msgs`,
 * `thinking`, `menuOpen`. This screen holds all of it in the URL instead.
 * Asking is a `GET` submit, so a question and its answer can be linked and
 * sent; opening the history is a navigation; choosing a model is a `<details>`.
 * The consequence is that the whole screen works with scripting off, that no
 * two panels can disagree about what is open, and that the period travels with
 * every one of those links — which is the rule the rest of this product
 * already lives by and the defect it has already had to fix twice.
 *
 * ## Why the frame and the panel are separate exports
 *
 * The export has a thinking state, and a thinking state is only honest if it is
 * on screen for exactly as long as the work takes. So the composer is
 * synchronous and the panel beneath it is suspended: the frame renders at once,
 * the session read hangs underneath it, and `AskThinkingPanel` is what the
 * reader sees meanwhile. Awaiting the read before rendering anything would
 * leave nothing to suspend on, and the only way to show the design's thinking
 * row would then be to fake one.
 *
 * ## What answers, and why the screen says so
 *
 * `repository.getAskSession` composes these answers from the read models,
 * deterministically. **No model writes a word of them, and none is connected**
 * — ADR-0030 gives every account its own connection and no account on this
 * deployment holds one. ADR-0033 put it plainly: a prompt that looked ready to
 * answer would be the screen telling its first lie.
 *
 * So the honesty note is not a footnote and is not dismissible. It sits above
 * the answer, every time there is one, and above the history when that is open.
 * If a model is ever connected, that note is what has to change — not the
 * layout around it.
 */

/** One place builds a link on this screen, so one place carries the period. */
export function askLink(
  root: string,
  periodParam: string,
  params: Readonly<Record<string, string>> = {},
): string {
  const here = `${root}/ask`;
  const search = new URLSearchParams();
  if (periodParam !== "") search.set("period", periodParam);
  for (const [key, value] of Object.entries(params)) search.set(key, value);
  const query = search.toString();
  return query === "" ? here : `${here}?${query}`;
}

/** "Petra Novák" → "PN". Initials, because there is no photograph to show. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/* ============================================================================
 * THE FRAME — ground, composer, and whatever hangs beneath.
 * ========================================================================= */

export function AskFrame({
  root,
  periodParam,
  projectLabel,
  question,
  historyOpen,
  composerLabel,
  models,
  children,
}: {
  readonly root: string;
  readonly periodParam: string;
  readonly projectLabel: string;
  /** The question as it was asked, verbatim, so the field can hold it again. */
  readonly question: string;
  readonly historyOpen: boolean;
  /** What composed the answer. Not a model name unless a model wrote it. */
  readonly composerLabel: string;
  /** Models the account holds. Empty on this deployment, and stated as empty. */
  readonly models: readonly string[];
  readonly children: ReactNode;
}) {
  const here = `${root}/ask`;
  const asked = question.trim().length > 0;

  return (
    <div className="ask-root ask-page">
      <div className="ask-ground" aria-hidden="true" />

      <div className="ask-main">
        {/*
         * The page's real heading. The design's first words are a placeholder
         * inside a textarea, and a screen with no `h1` is a screen a reader
         * cannot find the top of — so the heading exists and is not painted.
         * It names the project, because that is what the answers are about.
         */}
        <h1 className="ask-sr">Ask IRIS about {projectLabel}</h1>

        <div className="ask-lead" data-compact={historyOpen || asked ? "true" : "false"} />

        <div className="ask-hero">
          {/*
           * `method="get"`: the form posts back to this same route with the
           * question in the query, which is what makes an answer a place rather
           * than a moment. History is left alone deliberately — a reader who
           * asked three questions should be able to walk back through them with
           * the browser's own back button.
           */}
          <form className="ask-card" method="get" action={here}>
            {periodParam !== "" ? <input type="hidden" name="period" value={periodParam} /> : null}

            <AskField
              name="q"
              defaultValue={question}
              label={`Ask IRIS about ${projectLabel}`}
              placeholder="Ask IRIS…"
            />

            <div className="ask-actions">
              <div className="ask-model-wrap">
                {/*
                 * A `<details>` rather than a scripted menu. It opens on click
                 * and on Enter, closes on Escape, is announced as a disclosure,
                 * and costs nothing to ship. The export's popup geometry is
                 * reproduced by the stylesheet.
                 */}
                <details className="ask-model-details">
                  <summary className="ask-model" aria-label="Model">
                    <span className="ask-model-name">{composerLabel}</span>
                    <ChevronDown />
                  </summary>

                  <div className="ask-model-menu">
                    <p className="ask-menu-note">
                      Answers here are composed by Observer&rsquo;s own read models, not written by
                      a language model.
                    </p>
                    <span className="ask-model-option" aria-current="true">
                      <span>{composerLabel}</span>
                      <span className="ask-model-dot" aria-hidden="true" />
                    </span>
                    {models.length === 0 ? (
                      <p className="ask-menu-note">
                        This account holds no model connection, so there is nothing else to choose.
                        One is added in Settings.
                      </p>
                    ) : (
                      models.map((model) => (
                        <span
                          key={model}
                          className="ask-model-option"
                          aria-disabled="true"
                          title="Connected to this account, but not yet used to answer on this surface"
                        >
                          <span>{model}</span>
                        </span>
                      ))
                    )}
                  </div>
                </details>
              </div>

              <div className="ask-tools">
                {/*
                 * Drawn, and honestly unavailable. `next.config.ts` sends
                 * `Permissions-Policy: microphone=()`, so the capability is
                 * refused at the header before any code could ask for it — a
                 * button that opened a recorder here could not work even if one
                 * were written.
                 */}
                <button
                  type="button"
                  className="ask-btn"
                  aria-disabled="true"
                  aria-label="Dictate a question. Not available: this build does not enable the microphone."
                  title="Dictation is not enabled in this build"
                >
                  <Microphone />
                </button>

                <Link
                  className="ask-btn"
                  href={dynamicRoute(
                    historyOpen
                      ? askLink(root, periodParam)
                      : askLink(root, periodParam, { history: "1" }),
                  )}
                  /*
                   * `aria-current`, not `aria-pressed`. This is an anchor, so
                   * its role is `link`, and `aria-pressed` is not among the
                   * attributes that role supports — axe reports it as
                   * `aria-allowed-attr` and a screen reader is entitled to
                   * ignore it. `aria-current` is global, means the right thing
                   * ("this is the view you are on"), and is what the primary
                   * navigation beside it already uses.
                   */
                  {...(historyOpen ? { "aria-current": "true" as const } : {})}
                  aria-label={historyOpen ? "Close earlier questions" : "Earlier questions"}
                  title="Earlier questions"
                >
                  <Clock />
                </Link>

                <button type="submit" className="ask-btn ask-send" aria-label="Send" title="Send">
                  <Send />
                </button>
              </div>
            </div>
          </form>
        </div>

        {/*
         * One quiet line, and the shortest one that does the job.
         *
         * The design has nothing here, and a first draft of this said three
         * things — how to send, how to break a line, and that answers are
         * linkable. Two of those a reader discovers by doing them, and the
         * paragraph took 38px out of the space the composition puts between the
         * composer and the openings. What is left is the one behaviour that is
         * genuinely invisible: a textarea that sends on Enter.
         */}
        <p className="ask-hint">Enter sends · Shift + Enter for a new line</p>

        {children}
      </div>
    </div>
  );
}

/* ============================================================================
 * THE OPENINGS
 * ========================================================================= */

export function AskOpeningList({
  suggestions,
  root,
  periodParam,
}: {
  readonly suggestions: readonly string[];
  readonly root: string;
  readonly periodParam: string;
}) {
  if (suggestions.length === 0) {
    return (
      <div className="ask-panel" data-kind="chat">
        <div className="ask-empty">
          <p className="ask-empty-title">Nothing to ask about yet</p>
          <p className="ask-empty-note">
            The openings on this screen are the questions this project&rsquo;s read models can
            already answer. This one has not recorded enough for any of them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="ask-openings">
      {suggestions.map((suggestion, index) => {
        const Glyph = OPENING_GLYPHS[index % OPENING_GLYPHS.length] ?? OPENING_GLYPHS[0];
        return (
          <li key={suggestion}>
            {/*
             * A link, not a button that fills the field. The export fills the
             * composer and waits for a second press; a link asks the question,
             * which is what the reader wanted when they pressed it, and it
             * gives the answer an address on the way.
             */}
            <Link
              className="ask-opening"
              href={dynamicRoute(askLink(root, periodParam, { q: suggestion }))}
            >
              <span className="ask-opening-mark" aria-hidden="true">
                <Glyph />
              </span>
              <span className="ask-opening-text">{suggestion}</span>
              <span className="ask-opening-go" aria-hidden="true">
                <ChevronRight />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ============================================================================
 * THE COMPOSING STATE
 * ========================================================================= */

export function AskThinkingPanel({
  question,
  projectLabel,
  periodLabel,
  viewerName,
}: {
  readonly question: string;
  readonly projectLabel: string;
  readonly periodLabel: string;
  readonly viewerName: string;
}) {
  return (
    <div className="ask-panel" data-kind="chat">
      <ol className="ask-log" aria-label={`Conversation about ${projectLabel}`} aria-busy="true">
        <li className="ask-msg" data-who="you">
          <span className="ask-avatar" aria-hidden="true">
            {initialsOf(viewerName)}
          </span>
          <div className="ask-msg-body">
            <span className="ask-msg-who">{viewerName}</span>
            <p className="ask-msg-text">{question}</p>
          </div>
          <span className="ask-msg-when">{periodLabel}</span>
        </li>

        <li className="ask-thinking">
          <span className="ask-avatar" data-who="iris" aria-hidden="true">
            <Sparkle />
          </span>
          <span className="ask-dots">
            <span className="ask-dot" aria-hidden="true" />
            <span className="ask-dot" aria-hidden="true" />
            <span className="ask-dot" aria-hidden="true" />
            {/*
             * "Composing", not "thinking". The export writes "IRIS is
             * thinking…" and this surface does not think: it reads the same
             * figures every other screen draws and assembles a sentence around
             * them. The word is the one honest change to the design's copy.
             */}
            <span className="ask-thinking-word">Composing from the read models…</span>
          </span>
        </li>
      </ol>
    </div>
  );
}

/* ============================================================================
 * THE CONVERSATION
 * ========================================================================= */

export function AskConversationPanel({
  question,
  answer,
  session,
  viewerName,
  composerLabel,
  root,
  periodParam,
}: {
  readonly question: string;
  readonly answer: AskAnswer | null;
  readonly session: AskSession;
  readonly viewerName: string;
  readonly composerLabel: string;
  readonly root: string;
  readonly periodParam: string;
}) {
  return (
    <>
      <p className="ask-note">
        <span className="ask-note-mark" aria-hidden="true">
          <Info />
        </span>
        <span>
          Composed by Observer&rsquo;s read models for {session.context.projectLabel},{" "}
          {session.context.periodLabel.toLowerCase()}. No language model wrote any of this, and none
          is connected to this account.
        </span>
      </p>

      <div className="ask-panel" data-kind="chat">
        <ol className="ask-log" aria-label={`Conversation about ${session.context.projectLabel}`}>
          <li className="ask-msg" data-who="you">
            <span className="ask-avatar" aria-hidden="true">
              {initialsOf(viewerName)}
            </span>
            <div className="ask-msg-body">
              <span className="ask-msg-who">{viewerName}</span>
              <p className="ask-msg-text">{question}</p>
            </div>
            <span className="ask-msg-when">{session.context.periodLabel}</span>
          </li>

          <li className="ask-msg" data-who="iris">
            <span className="ask-avatar" data-who="iris" aria-hidden="true">
              <Sparkle />
            </span>
            <div className="ask-msg-body">
              <span className="ask-msg-who">{composerLabel}</span>

              {answer === null ? (
                <>
                  {/*
                   * Refusal, stated as one. The read models compose a fixed set
                   * of answers; a question outside it is told so and shown what
                   * IS answerable, rather than given a plausible sentence
                   * assembled to fill the space. That failure mode is the whole
                   * reason this surface does not call a model yet.
                   */}
                  <p className="ask-msg-text">
                    That is not a question Observer can answer from this project&rsquo;s read models
                    today. These are the ones it can:
                  </p>
                  <ul className="ask-follow">
                    {session.suggestions.map((suggestion) => (
                      <li key={suggestion}>
                        <Link
                          className="ask-follow-item"
                          href={dynamicRoute(askLink(root, periodParam, { q: suggestion }))}
                        >
                          {suggestion}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="ask-msg-text">{answer.answer}</p>

                  {answer.figures.length > 0 ? (
                    <dl className="ask-figures">
                      {answer.figures.map((figure) => (
                        <div className="ask-figure" key={figure.label}>
                          <dt>{figure.label}</dt>
                          <dd>{figure.value}</dd>
                          {figure.note !== null ? (
                            <dt className="ask-figure-note">{figure.note}</dt>
                          ) : null}
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {answer.caveat !== null ? <p className="ask-caveat">{answer.caveat}</p> : null}

                  {answer.evidence !== null || answer.actionHref !== null ? (
                    <ul className="ask-evidence">
                      {answer.evidence !== null ? (
                        <li>
                          <Link
                            className="ask-evidence-link"
                            href={dynamicRoute(answer.evidence.href)}
                          >
                            {answer.evidence.observationCount.toLocaleString("en-GB")} observations
                          </Link>
                        </li>
                      ) : null}
                      {answer.actionHref !== null && answer.actionLabel !== null ? (
                        <li>
                          <Link
                            className="ask-evidence-link"
                            href={dynamicRoute(answer.actionHref)}
                          >
                            {answer.actionLabel}
                          </Link>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}

                  {answer.followUps.length > 0 ? (
                    <ul className="ask-follow">
                      {answer.followUps.map((followUp) => (
                        <li key={followUp}>
                          <Link
                            className="ask-follow-item"
                            href={dynamicRoute(askLink(root, periodParam, { q: followUp }))}
                          >
                            {followUp}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
            <span className="ask-msg-when">{session.context.periodLabel}</span>
          </li>
        </ol>
      </div>
    </>
  );
}

/* ============================================================================
 * THE HISTORY
 * ========================================================================= */

export function AskHistoryPanel({ history }: { readonly history: AskHistoryView }) {
  const groups: readonly { readonly label: string; readonly rows: readonly AskThreadSummary[] }[] =
    history.pinned.length > 0
      ? [
          { label: "Pinned", rows: history.pinned },
          { label: "Earlier", rows: history.threads },
        ]
      : [{ label: "Earlier", rows: history.threads }];

  return (
    <>
      <p className="ask-note">
        <span className="ask-note-mark" aria-hidden="true">
          <Info />
        </span>
        <span>{history.demonstrationNotice}</span>
      </p>

      <section className="ask-panel" data-kind="history" aria-labelledby="ask-history-heading">
        <h2 className="ask-panel-title" id="ask-history-heading">
          HISTORY
        </h2>

        <div className="ask-scroll">
          {history.threads.length === 0 ? (
            <div className="ask-empty">
              <p className="ask-empty-title">No earlier questions</p>
              <p className="ask-empty-note">{history.emptyState}</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <p className="ask-group">{group.label}</p>
                <ul className="ask-rows">
                  {group.rows.map((row) => (
                    <li className="ask-row" key={`${group.label}-${row.threadId}`}>
                      <span className="ask-row-mark" aria-hidden="true">
                        <Thread />
                      </span>
                      <Link className="ask-row-title" href={dynamicRoute(row.href)}>
                        {row.title}
                      </Link>
                      <span className="ask-row-when">{row.askedAtDisplay}</span>

                      {/*
                       * Rename, share, pin and delete are drawn because the
                       * design draws them, and every one is refused because
                       * nothing stores a conversation: ADR-0022 gave up
                       * server-side session state, and the audit migration
                       * records in its own words that the question and the
                       * answer are never written down. A control that appeared
                       * to rename something and lost it on the next request
                       * would be worse than one that says it cannot.
                       */}
                      <button
                        type="button"
                        className="ask-row-act"
                        data-reveal="true"
                        aria-disabled="true"
                        aria-label={`Rename “${row.title}”. Not available: conversations are not stored.`}
                        title="Conversations are not stored, so they cannot be renamed"
                      >
                        <Pencil />
                      </button>

                      <details className="ask-row-more">
                        <summary
                          className="ask-row-act"
                          aria-label={`More options for “${row.title}”`}
                        >
                          <Dots />
                        </summary>
                        <div className="ask-row-menu" role="group">
                          <p className="ask-menu-note">
                            Nothing stores these conversations yet, so none of these can be done.
                          </p>
                          <span className="ask-menu-item" aria-disabled="true">
                            <Share />
                            Share
                          </span>
                          <span className="ask-menu-item" aria-disabled="true">
                            <Pencil size={17} />
                            Rename
                          </span>
                          <span className="ask-menu-item" aria-disabled="true">
                            <Pin />
                            Pin chat
                          </span>
                          <hr className="ask-menu-rule" />
                          <span
                            className="ask-menu-item"
                            data-tone="destructive"
                            aria-disabled="true"
                          >
                            <Trash />
                            Delete
                          </span>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
