"use client";

import { useEffect, useRef, useState } from "react";

import { ObserverOrb } from "../orb/ObserverOrb";
import { ObserverAnswerPanel } from "./Answer";
import { suggestionsFor } from "./suggestions";
import { useObserver } from "./useObserver";
import { useSharedVoice } from "./ObserverVoiceProvider";
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
 * While voice is connected the orb follows the *conversation* — listening,
 * thinking, speaking — because that is what is actually true at that moment.
 */
export function ObserverConsole({
  context,
  greeting,
  briefing,
  hasObservation,
  models,
  activeModel,
}: {
  context: ObserverContext;
  greeting: string;
  /** One sentence, written by the read models. Observer states it as its own. */
  briefing: string;
  /** Whether the briefing is a finding or simply a description of the period. */
  hasObservation: boolean;
  /**
   * The models this ACCOUNT may use, resolved on the server.
   *
   * The rail carries the same control; the briefing needs its own because the
   * rail is deliberately hidden here — this page has the console instead, and
   * the model a question will use has to be visible wherever a question is
   * asked.
   */
  models: readonly { id: string; label: string }[];
  activeModel: { id: string; label: string } | null;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [deep, setDeep] = useState(false);

  /*
   * The model for the next question, when the reader picks one.
   *
   * Null means "whatever this account's settings say" — which is what the
   * server would decide anyway, so the default costs no round trip and the
   * control starts on the truth rather than on a guess.
   */
  const [chosen, setChosen] = useState<string | null>(null);
  const observer = useObserver(context);
  // Held by the shell, so the conversation outlives this page.
  const voice = useSharedVoice();
  const suggestions = suggestionsFor(context);

  const voiceLive =
    voice.phase === "listening" || voice.phase === "speaking" || voice.phase === "thinking";

  /*
   * The resting state says whether there is anything to look at.
   *
   * `attention` when the period turned something up, `idle` when it did not.
   * An orb that always looks like it has news is an orb nobody believes.
   */
  const resting = hasObservation ? "attention" : "idle";
  const state = voiceLive
    ? voice.orbState
    : observer.outcome === null && !observer.busy
      ? resting
      : observer.state;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (
        (event.key === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !typing)
      ) {
        event.preventDefault();
        field.current?.focus();
      }
      // Escape stops a request in flight. A reader who has changed their mind
      // should not have to find a button to say so.
      if (event.key === "Escape" && observer.busy) observer.cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [observer]);

  const send = (question: string) => {
    setValue(question);
    void observer.ask(question, deep ? "deep" : "standard", chosen);
  };

  return (
    <section className="obs-console" aria-label="Observer">
      <div className="obs-console-orb">
        <ObserverOrb
          state={state}
          intensity={observer.busy || voiceLive ? 0.7 : 0.15}
          frequencies={voice.frequencies}
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
            void observer.ask(value, deep ? "deep" : "standard", chosen);
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
            aria-describedby="observer-prompt-help"
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
                void observer.ask(value, deep ? "deep" : "standard", chosen);
              }
            }}
          />

          {voice.phase === "unavailable" ? null : (
            <button
              className="obs-mic"
              type="button"
              onClick={() => (voiceLive ? voice.disconnect() : void voice.connect())}
              aria-pressed={voiceLive}
              /* The microphone is requested here and nowhere else — on a click. */
              aria-label={voiceLive ? "Stop talking to Observer" : "Talk to Observer"}
              data-live={voiceLive ? "true" : undefined}
            >
              <span aria-hidden="true">●</span>
            </button>
          )}

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

        <p id="observer-prompt-help" className="obs-prompt-help">
          <label className="obs-deep">
            <input
              type="checkbox"
              checked={deep}
              onChange={(e) => setDeep(e.target.checked)}
              disabled={observer.busy}
            />
            Deep report — slower, higher reasoning effort
          </label>

          {/*
            WHICH MODEL IS ABOUT TO ANSWER.
            
            Beside the depth switch, because they are the same kind of decision:
            how hard Observer thinks, and what it thinks with. A reader who
            cannot tell which model wrote a sentence cannot judge it.
          */}
          {activeModel !== null && (
            <span className="obs-model">
              <label className="iris-sr" htmlFor="observer-console-model">
                Model for this question
              </label>
              {models.length > 1 ? (
                <select
                  id="observer-console-model"
                  className="obs-model-select"
                  value={chosen ?? activeModel.id}
                  onChange={(e) => setChosen(e.target.value)}
                  disabled={observer.busy}
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="obs-model-static">{activeModel.label}</span>
              )}
            </span>
          )}

          <span className="obs-demo-note">Demonstration data</span>
        </p>

        {/*
         * One live region for the whole exchange.
         *
         * Progress, the analyses that ran, and the settled answer all announce
         * from here. Several competing polite regions on one screen is how a
         * screen-reader user ends up hearing three things at once and none of
         * them fully.
         */}
        <div className="obs-progress-region" role="status" aria-live="polite">
          {observer.progress === null ? null : (
            <span className="obs-progress">{observer.progress}…</span>
          )}
          {observer.tools.length === 0 ? null : (
            <span className="obs-tools iris-code">{observer.tools.join(" · ")}</span>
          )}
          {voice.phase === "requesting_microphone" ? (
            <span className="obs-progress">Waiting for microphone permission…</span>
          ) : null}
        </div>

        {voice.blocker === null ? null : (
          <p className="obs-voice-blocker" role="note">
            {voice.blocker.reader}
          </p>
        )}

        {voice.transcript.length === 0 ? null : (
          <dl className="obs-voice-transcript">
            {voice.transcript.slice(-4).map((line, i) => (
              <div key={`${line.who}-${i}`}>
                <dt>{line.who === "you" ? "You" : "Observer"}</dt>
                <dd>{line.text}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="obs-suggestions">
          {suggestions.map((s) => (
            <button key={s} type="button" className="obs-chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>

        {observer.outcome !== null ? (
          <>
            <ObserverAnswerPanel
              outcome={observer.outcome}
              draft={observer.draft}
              followUps={suggestions}
              onFollowUp={send}
              onRetry={() => void observer.retry()}
            />
            <button className="obs-dismiss" type="button" onClick={observer.dismiss}>
              Clear
            </button>
          </>
        ) : observer.draft === null ? null : (
          /*
           * The first answer, still arriving.
           *
           * There is no settled outcome to sit it inside yet, so it gets its
           * own plane — and it is labelled unchecked, because it has not been
           * through the schema, the causal guard or the evidence test. It is
           * replaced wholesale the moment the validated answer lands.
           */
          <div className="obs-answer obs-answer-draft" aria-busy="true">
            <p className="obs-answer-role">Composing · not yet checked</p>
            <p className="obs-answer-said">
              {observer.draft.answer || observer.draft.interpretation}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
