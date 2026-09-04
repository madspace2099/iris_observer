"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The docked bar's field, with the export's rotating placeholder.
 *
 * The delivered design cycles a set of questions through the empty field to
 * teach what can be asked — the same job the five openings do on the Ask
 * screen, in the space a 72px bar has. It is the only looping motion in this
 * product, and it is here because it carries the surface's whole affordance
 * rather than decorating it: a bar with a static "Ask IRIS…" tells a reader
 * that they may type, and nothing about what is worth typing.
 *
 * ## It stops for three reasons, and each of them matters
 *
 * **Reduced motion.** `prefers-reduced-motion: reduce` leaves the static
 * placeholder and never starts a timer. The export does this too.
 *
 * **Focus, or any typed character.** A placeholder rewriting itself under a
 * cursor is a field fighting the person using it, and a reader who has begun a
 * question should not have the box moving while they think.
 *
 * **A hidden tab.** `visibilitychange` pauses it, so a background tab is not
 * running a timer to animate text nobody is looking at.
 *
 * ## Why the cadence is fixed rather than random
 *
 * The export jitters each keystroke with `Math.random()`. This does not: the
 * repository's determinism rule exists so that two runs of the same screen
 * produce the same thing, and a screenshot harness that catches this field
 * mid-word should catch it at the same place every time. The typing reads the
 * same; only the reproducibility differs.
 */

/** The questions the bar offers, and the resting placeholder at index zero. */
const LINES: readonly string[] = [
  "Ask IRIS…",
  "What changed in the pipeline this week?",
  "Which units are at risk of stalling?",
  "Which apartments need attention right now?",
  "Which agents need support right now?",
  "What should we focus on next?",
];

const REST = LINES[0] ?? "Ask IRIS…";

/** Type, hold, erase — in milliseconds, and none of them random. */
const TYPE_MS = 58;
const ERASE_MS = 24;
const HOLD_MS = 2400;
const BETWEEN_MS = 420;

export function AskBarField({ name, label }: { readonly name: string; readonly label: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [placeholder, setPlaceholder] = useState(REST);
  const [typed, setTyped] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (typed || focused) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setPlaceholder(REST);
      return;
    }

    let line = 1;
    let cut = 0;
    let phase: "type" | "hold" | "erase" = "type";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const tick = (): void => {
      if (stopped) return;

      if (document.visibilityState !== "visible") {
        timer = setTimeout(tick, 400);
        return;
      }

      const text = LINES[line] ?? REST;
      let wait = TYPE_MS;

      if (phase === "type") {
        cut += 1;
        if (cut >= text.length) {
          phase = "hold";
          wait = HOLD_MS;
        }
      } else if (phase === "hold") {
        phase = "erase";
        wait = ERASE_MS;
      } else {
        cut -= 2;
        wait = ERASE_MS;
        if (cut <= 0) {
          cut = 0;
          phase = "type";
          line = line + 1 >= LINES.length ? 1 : line + 1;
          wait = BETWEEN_MS;
        }
      }

      setPlaceholder(cut === 0 ? REST : text.slice(0, cut));
      timer = setTimeout(tick, wait);
    };

    timer = setTimeout(tick, 900);
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [typed, focused]);

  const still = typed || focused;

  return (
    <>
      <label className="ask-sr" htmlFor="ask-dock-prompt">
        {label}
      </label>
      <textarea
        id="ask-dock-prompt"
        ref={field}
        className="ask-bar-field"
        name={name}
        rows={1}
        placeholder={still ? REST : placeholder}
        aria-label={label}
        spellCheck={false}
        data-typing={still ? "false" : "true"}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        onInput={(event) => {
          setTyped(event.currentTarget.value.length > 0);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          /*
           * A composing keystroke is not a send. An input method editor uses
           * Enter to accept a candidate, so submitting here would swallow the
           * first word of every question typed in Japanese, Korean or Chinese.
           */
          if (event.nativeEvent.isComposing) return;

          const form = field.current?.form;
          if (form === null || form === undefined) return;

          event.preventDefault();
          // `requestSubmit`, not `submit`: the plain one skips validation and
          // never fires the submit event, so the framework sees no navigation.
          form.requestSubmit();
        }}
      />
    </>
  );
}
