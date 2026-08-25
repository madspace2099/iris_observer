"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ParticleOrb } from "../orb/ParticleOrb";
import { ObserverAnswerPanel } from "./Answer";
import { suggestionsFor } from "./suggestions";
import { useObserver } from "./useObserver";
import { useSharedVoice } from "./ObserverVoiceProvider";
import type { ObserverContext } from "./types";

/**
 * Observer, collapsed, on every surface that is not the briefing.
 *
 * The same entity as the console — same states, same evidence, same context —
 * folded down to a presence and a prompt. It reads the analytical context off
 * the URL, so selecting an agent or a unit changes what it offers to answer
 * without the reader typing the name of the thing they are already looking at.
 */
export function ObserverRail({
  projectLabel,
  root,
  role,
}: {
  projectLabel: string;
  root: string;
  role: ObserverContext["role"];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  const [, tenantSlug = "", projectSlug = ""] = root.split("/");
  const context: ObserverContext = {
    tenantSlug,
    projectSlug,
    projectLabel,
    role,
    period: params.get("period") ?? "quarter_to_date",
    unitCode: params.get("unit"),
    meetingId: /\/meetings\/([^/?]+)/.exec(pathname)?.[1] ?? null,
    agentId: params.get("agent"),
    // The rail knows the identifier, not the person. The console is given the
    // name by the server, which is the only place identity is resolved.
    agentName: null,
    segment: params.get("segment"),
  };

  const observer = useObserver(context);
  const voice = useSharedVoice();
  const suggestions = suggestionsFor(context);

  /*
   * One Observer per screen.
   *
   * The briefing renders the console — the same entity, at full size, with the
   * same prompt. A collapsed copy of it floating over the bottom of that page
   * is not a second way in, it is the same way in drawn twice.
   */
  const onBriefing = pathname.endsWith("/showroom");

  /*
   * Any settled outcome opens the sheet, not only a successful one.
   *
   * The sheet used to open from an `onInsight` callback that fires only when an
   * answer validates. A refusal — an expired session, a rate limit, an
   * unreachable model — left the reader looking at a rail that had visibly
   * accepted their question and then did nothing at all.
   */
  useEffect(() => {
    if (observer.outcome !== null) setOpen(true);
  }, [observer.outcome]);

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
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = (question: string) => {
    setValue(question);
    void observer.ask(question);
  };

  /*
   * A live conversation outranks a settled answer.
   *
   * While voice is connected the presence follows the conversation — listening,
   * thinking, speaking — because that is what is actually true at that moment,
   * and it is the same rule the console applies. An orb still showing the last
   * answer while somebody is talking to it is the one reading that is wrong.
   */
  const voiceLive =
    voice.phase === "listening" || voice.phase === "speaking" || voice.phase === "thinking";
  const state = voiceLive
    ? voice.orbState
    : observer.outcome === null && !observer.busy
      ? "idle"
      : observer.state;

  if (onBriefing) return null;

  return (
    <>
      <div
        className="obs-rail"
        data-busy={observer.busy ? "true" : undefined}
        data-shifted={open ? "true" : undefined}
      >
        <ParticleOrb
          state={state}
          intensity={observer.busy || voiceLive ? 0.7 : 0.1}
          frequencies={voice.frequencies}
          size={60}
          compact
          onActivate={() => field.current?.focus()}
          activateLabel="Focus the Observer prompt"
        />

        <span className="obs-rail-context">
          <span className="iris-code">{projectLabel}</span>
          {context.unitCode === null ? null : (
            <span className="iris-code obs-rail-pin">{context.unitCode}</span>
          )}
          {context.agentId === null ? null : (
            <span className="iris-code obs-rail-pin">{context.agentId.replace("agt_", "")}</span>
          )}
          {context.meetingId === null ? null : (
            <span className="iris-code obs-rail-pin">{context.meetingId}</span>
          )}
        </span>

        <form
          className="obs-rail-form"
          onSubmit={(e) => {
            e.preventDefault();
            void observer.ask(value);
          }}
        >
          <label className="iris-sr" htmlFor="observer-rail-prompt">
            Ask Observer
          </label>
          <input
            id="observer-rail-prompt"
            ref={field}
            value={value}
            placeholder={observer.progress === null ? "Ask Observer…" : `${observer.progress}…`}
            onChange={(e) => setValue(e.target.value)}
          />
          <kbd>⌘K</kbd>
        </form>

        {/*
         * Talking has to be startable from here too.
         *
         * The session now outlives navigation, but the only control that opened
         * one lived on the briefing — so anywhere else the presence could show a
         * conversation it gave the reader no way to begin. Same control, same
         * class, same rule: the microphone is requested on a click and nowhere
         * else.
         */}
        {voice.phase === "unavailable" ? null : (
          <button
            className="obs-mic"
            type="button"
            onClick={() => (voiceLive ? voice.disconnect() : void voice.connect())}
            aria-pressed={voiceLive}
            aria-label={voiceLive ? "Stop talking to Observer" : "Talk to Observer"}
            data-live={voiceLive ? "true" : undefined}
          >
            <span aria-hidden="true">●</span>
          </button>
        )}

        {observer.busy ? (
          <button className="iris-action" type="button" onClick={observer.cancel}>
            Stop
          </button>
        ) : (
          <button
            className="iris-action"
            type="button"
            onClick={() => send(suggestions[0] as string)}
          >
            {suggestions[0]}
          </button>
        )}
      </div>

      {!open || observer.outcome === null ? null : (
        <aside className="iris-sheet" role="dialog" aria-label="Observer">
          <div className="iris-sheet-head">
            <p className="iris-kicker">Observer</p>
            <button
              className="iris-sheet-close"
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <ObserverAnswerPanel
            outcome={observer.outcome}
            draft={observer.draft}
            followUps={suggestions}
            onFollowUp={send}
            onRetry={() => void observer.retry()}
          />
        </aside>
      )}
    </>
  );
}
