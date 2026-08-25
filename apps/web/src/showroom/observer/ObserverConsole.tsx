"use client";

import { useEffect, useRef, useState } from "react";
import { ObserverOrb } from "../orb/ObserverOrb";
import { ObserverAnswer } from "./Answer";
import { suggestionsFor } from "./suggestions";
import { useObserver } from "./useObserver";
import type { ObserverContext } from "./types";

/**
 * Observer's own composition, at the top of the briefing.
 *
 * The presence, the greeting, what it has found, and the way in — all above the
 * fold and all at the same weight as the figures beneath them. A prompt sitting
 * in a footer teaches the reader that asking is a secondary activity, and the
 * whole argument of this product is that it is the primary one.
 *
 * The orb is a control, not decoration: it focuses the prompt, it shows what is
 * happening during a request, and it goes quiet when there is nothing to say.
 */
export function ObserverConsole({
  context,
  greeting,
  briefing,
  hasObservation,
}: {
  context: ObserverContext;
  greeting: string;
  /** One sentence, written by the read models. Observer states it as its own. */
  briefing: string;
  /** Whether the briefing is a finding or simply a description of the period. */
  hasObservation: boolean;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const observer = useObserver(context);
  const suggestions = suggestionsFor(context);

  /*
   * The resting state says whether there is anything to look at.
   *
   * `attention` when the period turned something up, `idle` when it did not.
   * An orb that always looks like it has news is an orb nobody believes.
   */
  const resting = hasObservation ? "attention" : "idle";
  const state = observer.outcome === null && !observer.busy ? resting : observer.state;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        field.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = (question: string) => {
    setValue(question);
    void observer.ask(question);
  };

  return (
    <section className="obs-console" aria-label="Observer">
      <div className="obs-console-orb">
        <ObserverOrb
          state={state}
          intensity={observer.busy ? 0.7 : 0.15}
          size={330}
          onActivate={() => field.current?.focus()}
        />
      </div>

      <div className="obs-console-body">
        <p className="obs-greeting">{greeting}</p>
        <p className="obs-lede">{briefing}</p>

        <form
          className="obs-prompt"
          onSubmit={(e) => {
            e.preventDefault();
            void observer.ask(value);
          }}
        >
          <label className="iris-sr" htmlFor="observer-prompt">
            Ask Observer about this project
          </label>
          <textarea
            id="observer-prompt"
            ref={field}
            rows={1}
            value={value}
            /*
              * Short enough not to wrap on a phone.
              *
              * The project name made the placeholder three lines tall at 390px,
              * which turned the primary control into a paragraph. The name is
              * already in the header on every screen.
              */
            placeholder="Ask Observer about this project…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void observer.ask(value);
              }
            }}
          />
          {observer.busy ? (
            <button className="obs-send" type="button" onClick={observer.cancel}>
              Stop
            </button>
          ) : (
            <button className="obs-send" type="submit" data-emphasis="primary">
              Ask
            </button>
          )}
        </form>

        {observer.progress === null ? null : (
          <p className="obs-progress" role="status">
            {observer.progress}…
          </p>
        )}

        <div className="obs-suggestions">
          {suggestions.map((s) => (
            <button key={s} type="button" className="obs-chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>

        {observer.outcome === null ? null : (
          <>
            <ObserverAnswer
              outcome={observer.outcome}
              followUps={suggestions}
              onFollowUp={send}
            />
            <button className="obs-dismiss" type="button" onClick={observer.dismiss}>
              Clear
            </button>
          </>
        )}
      </div>
    </section>
  );
}
