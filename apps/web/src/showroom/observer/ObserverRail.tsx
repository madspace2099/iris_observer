"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ObserverOrb } from "../orb/ObserverOrb";
import { ObserverAnswer } from "./Answer";
import { suggestionsFor } from "./suggestions";
import { useObserver } from "./useObserver";
import type { ObserverContext } from "./types";

/**
 * Observer, collapsed, on every surface that is not the briefing.
 *
 * The same entity as the console — same states, same evidence, same context —
 * folded down to a presence and a prompt. It reads the analytical context off
 * the URL, so selecting an agent or a unit changes what it offers to answer
 * without the reader typing the name of the thing they are already looking at.
 */
export function ObserverRail({ projectLabel, root }: { projectLabel: string; root: string }) {
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
    period: params.get("period") ?? "quarter_to_date",
    unitCode: params.get("unit"),
    meetingId: /\/meetings\/([^/?]+)/.exec(pathname)?.[1] ?? null,
    agentId: params.get("agent"),
    // The rail knows the identifier, not the person. The console is given the
    // name by the server, which is the only place identity is resolved.
    agentName: null,
    segment: params.get("segment"),
  };

  const observer = useObserver(context, () => setOpen(true));
  const suggestions = suggestionsFor(context);

  /*
   * One Observer per screen.
   *
   * The briefing renders the console — the same entity, at full size, with the
   * same prompt. A collapsed copy of it floating over the bottom of that page
   * is not a second way in, it is the same way in drawn twice.
   */
  const onBriefing = pathname.endsWith("/showroom");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
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

  const state = observer.outcome === null && !observer.busy ? "idle" : observer.state;

  if (onBriefing) return null;

  return (
    <>
      <div className="obs-rail" data-busy={observer.busy ? "true" : undefined} data-shifted={open ? "true" : undefined}>
        <ObserverOrb
          state={state}
          intensity={observer.busy ? 0.7 : 0.1}
          size={38}
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

        {observer.busy ? (
          <button className="iris-action" type="button" onClick={observer.cancel}>
            Stop
          </button>
        ) : (
          <button className="iris-action" type="button" onClick={() => send(suggestions[0] as string)}>
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
          <ObserverAnswer outcome={observer.outcome} followUps={suggestions} onFollowUp={send} />
        </aside>
      )}
    </>
  );
}
