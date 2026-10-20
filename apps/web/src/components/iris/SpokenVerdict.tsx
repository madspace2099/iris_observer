import type { CSSProperties } from "react";

/**
 * THE PAGE'S MAIN FINDING, SAID BY IRIS (ADR-0048).
 *
 * The owner, 2026-10-20, on Sales Flow: the verdict "is very inconspicuous, my
 * attention almost slides over it — yet this should be the main message". So
 * the sentence becomes the page's headline in earnest, it types itself in, and
 * a small instrument beside it speaks while it does.
 *
 * ## Everything here is CSS, and the server writes every character
 *
 * This is a server component. The sentence is in the HTML from the first byte,
 * one span per character, each laid out from the first paint at opacity 0 and
 * shown by its own `animation-delay` (`iris.css`, "the spoken verdict"), so
 * nothing below the heading moves while it types and there is no hydration to
 * mismatch. The caret is each character's `::after`, lit for exactly that
 * character's step, and the character is shown whole as its step begins, so
 * the caret is never drawn inside a half-faded letter; the last one blinks
 * three times and fades. The mark's speaking (a turning scan arc, a ping, five
 * level bars) runs for the same span and settles into one slow breathing ring.
 *
 * Under reduced motion, and in print, every animation is off: the sentence
 * stands complete, no caret, and the mark is its resting frame.
 *
 * ## One accessible name, once
 *
 * The heading is named by `aria-label` and its characters are `aria-hidden`, so
 * a screen reader hears the sentence rather than its letters. The characters
 * are the only text inside the `<h1>`, so its text is the sentence exactly once.
 *
 * ## Honest about who is speaking
 *
 * The sentence is composed by Observer's read models, not by a language model,
 * so the label names IRIS and the meetings it read and nothing else: never
 * "AI", never a model. The count is the view's own, passed in.
 *
 * `replay` is whatever should make IRIS say it again — the period, the summary
 * window. The block is keyed on it and on the sentence, so a change remounts it
 * and the CSS starts over.
 */

/** A character every 20ms, and the whole sentence inside 2.4s however long it is. */
const STEP_MS = 20;
const LONGEST_MS = 2400;

/** One turn of the scan arc, one ping, one swing of a level bar. */
const TURN_MS = 1100;
const PING_MS = 900;
const LEVEL_MS = 380;

/** The level bars, as a short waveform: x and full height. */
const LEVELS = [
  [-6, 6],
  [-3, 10],
  [0, 13],
  [3, 9],
  [6, 5],
] as const;

export function SpokenVerdict({
  sentence,
  meetings,
  locale,
  replay = "",
}: {
  /** The read model's verdict, word for word. */
  readonly sentence: string;
  /**
   * The meetings the sentence was read from, as the view counts them (Sales
   * Flow's `verdictMeetings`, elsewhere `meetingCount`). Printed, never computed
   * here; with none, the label is IRIS's name alone.
   */
  readonly meetings: number;
  /** The project's locale, which formats the count. */
  readonly locale: string;
  readonly replay?: string;
}) {
  const characters = Array.from(sentence);
  const step = Math.round(Math.min(STEP_MS, LONGEST_MS / Math.max(1, characters.length)) * 10) / 10;
  const total = Math.round(step * characters.length);
  const style = {
    "--sv-step": `${step}ms`,
    "--sv-total": `${total}ms`,
    "--sv-turns": Math.max(1, Math.round(total / TURN_MS)),
    "--sv-pings": Math.max(1, Math.round(total / PING_MS)),
    "--sv-levels": 2 * Math.ceil(total / (2 * LEVEL_MS)) + 2,
  } as CSSProperties;

  return (
    <div className="iris-spoken" key={`${replay}|${sentence}`} style={style}>
      {/* First in the DOM, as it is painted: above the sentence, on a desk and on a phone. */}
      <p className="iris-spoken-by">
        <span className="iris-spoken-name">IRIS</span>
        {meetings > 0 &&
          ` · read from ${new Intl.NumberFormat(locale).format(meetings)} ${meetings === 1 ? "meeting" : "meetings"}`}
      </p>

      <h1 className="iris-section iris-spoken-line" aria-label={sentence}>
        <span aria-hidden="true">
          {characters.map((character, i) => (
            <span className="iris-spoken-ch" key={i} style={{ "--i": i } as CSSProperties}>
              {character}
            </span>
          ))}
        </span>
      </h1>

      <svg
        className="iris-spoken-mark"
        viewBox="-26 -26 52 52"
        aria-hidden="true"
        focusable="false"
      >
        <circle className="iris-spoken-field" r="25" />
        <circle className="iris-spoken-ring" r="24.5" />
        <circle className="iris-spoken-ticks" r="20.5" pathLength={360} />
        <g className="iris-spoken-scan">
          <circle r="24.5" pathLength={360} />
        </g>
        <circle className="iris-spoken-inner" r="12.5" />
        <circle className="iris-spoken-ping" r="12.5" />
        <g className="iris-spoken-voice">
          {LEVELS.map(([x, height], i) => (
            <rect
              key={x}
              className="iris-spoken-level"
              x={x - 0.8}
              y={-height / 2}
              width={1.6}
              height={height}
              rx={0.8}
              style={{ "--b": i } as CSSProperties}
            />
          ))}
        </g>
        <g className="iris-spoken-idle">
          <circle className="iris-spoken-breath" r="7" />
          <circle className="iris-spoken-core" r="2.4" />
        </g>
      </svg>
    </div>
  );
}
