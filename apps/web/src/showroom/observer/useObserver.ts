"use client";

import { useCallback, useRef, useState } from "react";
import type { OrbState } from "../orb/profile";
import type { AskOutcome, ObserverContext } from "./types";

/**
 * One Observer exchange, and the state the orb shows while it happens.
 *
 * The orb state is derived here rather than set by whoever renders it, so the
 * presence on screen cannot drift out of step with what the application is
 * doing. `thinking` means a request is genuinely in flight; `insight` means an
 * answer with evidence came back; `unavailable` means the interpretation layer
 * could not be reached and says so instead of inventing prose.
 */

export interface ObserverSession {
  readonly state: OrbState;
  readonly busy: boolean;
  readonly outcome: AskOutcome | null;
  /** What the tool layer is doing, in words, while it does it. */
  readonly progress: string | null;
  ask: (question: string) => Promise<void>;
  cancel: () => void;
  dismiss: () => void;
}

/*
 * Said while the request is in flight.
 *
 * These describe the work the controlled tool loop actually performs — reading
 * the session slice, comparing lanes, resolving evidence — rather than counting
 * to three. They advance on a timer because the route answers in one response;
 * if it is ever streamed, the same slot carries the real stage names.
 */
const STAGES = [
  "Reading the measured sessions",
  "Comparing what the tools returned",
  "Checking the evidence behind it",
] as const;

export function useObserver(context: ObserverContext, onInsight?: () => void): ObserverSession {
  const [state, setState] = useState<OrbState>("idle");
  const [outcome, setOutcome] = useState<AskOutcome | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTicker = useCallback(() => {
    if (ticker.current !== null) {
      clearInterval(ticker.current);
      ticker.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    stopTicker();
    setProgress(null);
    setState(outcome === null ? "idle" : "insight");
  }, [outcome, stopTicker]);

  const dismiss = useCallback(() => {
    setOutcome(null);
    setState("idle");
  }, []);

  const ask = useCallback(
    async (question: string) => {
      if (question.trim().length === 0 || abort.current !== null) return;

      const controller = new AbortController();
      abort.current = controller;
      setState("thinking");
      setProgress(STAGES[0] as string);

      let stage = 0;
      ticker.current = setInterval(() => {
        stage = Math.min(STAGES.length - 1, stage + 1);
        setProgress(STAGES[stage] as string);
      }, 900);

      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            question,
            tenantSlug: context.tenantSlug,
            projectSlug: context.projectSlug,
            period: context.period,
            unitCode: context.unitCode,
            meetingId: context.meetingId,
          }),
        });

        /*
         * A failure has to say which failure it was.
         *
         * "Could not reach its analysis layer" was shown for every non-200,
         * including an expired session — which sent the reader looking for an
         * outage when the answer was to sign in again.
         */
        if (response.status === 401) {
          setOutcome({
            question,
            answer: null,
            refusal: "Your session has expired. Sign in again and ask once more.",
            toolsUsed: [],
            status: { provider: "unknown", model: "unknown", live: false, reason: "not signed in" },
          });
          setState("unavailable");
          return;
        }
        if (!response.ok) throw new Error(String(response.status));

        const next = (await response.json()) as AskOutcome;
        setOutcome(next);
        setState(next.answer === null ? "unavailable" : "insight");
        if (next.answer !== null) onInsight?.();
      } catch (error) {
        // An aborted request is the reader's decision, not a failure.
        if (error instanceof DOMException && error.name === "AbortError") return;
        setOutcome({
          question,
          answer: null,
          refusal:
            "Observer could not reach its interpretation layer. Nothing has been answered from memory — every figure it reports comes from the same read models the screens draw from. The measured evidence is still on the page.",
          toolsUsed: [],
          status: { provider: "unknown", model: "unknown", live: false, reason: null },
        });
        setState("unavailable");
      } finally {
        abort.current = null;
        stopTicker();
        setProgress(null);
      }
    },
    [
      context.meetingId,
      context.period,
      context.projectSlug,
      context.tenantSlug,
      context.unitCode,
      onInsight,
      stopTicker,
    ],
  );

  return {
    state,
    busy: state === "thinking",
    outcome,
    progress,
    ask,
    cancel,
    dismiss,
  };
}
