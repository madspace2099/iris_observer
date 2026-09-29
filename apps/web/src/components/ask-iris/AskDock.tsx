import { AskBarField } from "./AskBarField";
import { PeriodField } from "./PeriodField";
import { PromptGlow } from "./PromptGlow";
import { Microphone, Send } from "./icons";

/**
 * THE PROMPT BAR, AT THE END OF EVERY SURFACE EXCEPT ASK IRIS.
 *
 * The user delivered this as its own export and asked for it on Sales Flow,
 * Project and Sales Agents in place of the floating "Ask Observer" panel that
 * used to sit there — and asked for it gone from Ask IRIS, because that screen
 * already is a prompt at full size.
 *
 * It is deliberately NOT the Ask screen's composer shrunk. The export makes it
 * a different object: 72px rather than 181, one line of 17px rather than three
 * of 24, and two controls rather than four. The model picker and the history
 * button are absent, which is the right reduction for a bar riding under a
 * working analytical screen — it asks a question and hands the reader to the
 * answer, and everything else about a conversation belongs on the surface that
 * holds conversations.
 *
 * ## In the flow, not fixed
 *
 * It was `position: fixed` at the foot of the viewport. A fixed bar over a
 * scrolling document covers something at some scroll position whatever its
 * size — measured on the roster at four sizes and three positions, a
 * focusable link sat under it in nine of twenty-four — so "it covers
 * nothing" was a rule narrowed after each measurement. The layout renders it
 * as the last child of `<main>`, after the page's content, and
 * `fixed-covers-nothing.spec.ts` is the guard the rule never had. From the
 * top of a long page the header's ASK IRIS item is the door.
 *
 * ## Asking from here opens the answer over there
 *
 * A `GET` submit to `/{tenant}/{project}/ask`, so a question typed on Sales
 * Flow arrives on Ask IRIS with its answer, at an address that can be sent to a
 * colleague. That is the whole behaviour the old rail promised and could not
 * deliver — it streamed to a model path no account on this deployment can
 * reach — and it costs one navigation.
 *
 * The period travels with it, because "why did demand fall" is a different
 * question over 28 days than over a quarter, and a prompt that dropped the
 * period would answer the wrong one without saying so. It did drop it: the
 * layout that renders this bar cannot see the query, so it passed an empty
 * period and this paragraph was false. `PeriodField` reads the period off
 * the URL in the browser, as the shell reads its own.
 *
 * ## Hidden on Ask IRIS by the stylesheet, not by a prop
 *
 * `:root:has(.ask-page) .ask-dock { display: none }`. The layout is a server
 * component and does not know which route rendered beneath it; the alternative
 * was threading a flag through the shell into every page. `display: none` also
 * takes the bar out of the tab order and the accessibility tree, which a
 * visibility or opacity rule would not.
 */
export function AskDock({
  root,
  projectLabel,
}: {
  /** `/{tenant}/{project}`. */
  readonly root: string;
  readonly projectLabel: string;
}) {
  return (
    <div className="ask-dock ask-root">
      <div className="ask-dock-inner">
        <div className="ask-hero">
          {/*
           * The same shader, at the bar size. It needs no variant: the card's
           * live width, height and radius arrive as uniforms from a
           * ResizeObserver, so 72px tall and 181px tall are the same code.
           */}
          <PromptGlow />

          <form className="ask-bar" method="get" action={`${root}/ask`} data-glow-card="">
            <PeriodField />

            <AskBarField name="q" label={`Ask IRIS about ${projectLabel}`} />

            <div className="ask-bar-tools">
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

              <button type="submit" className="ask-btn ask-send" aria-label="Send" title="Send">
                <Send />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
