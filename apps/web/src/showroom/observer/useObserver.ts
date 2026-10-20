"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { OrbState } from "../orb/profile";
import type { AskOutcome, ObserverContext } from "./types";

/**
 * One Observer exchange, streamed, and the state the orb shows while it runs.
 *
 * The orb state is derived here rather than set by whoever renders it, so the
 * presence on screen cannot drift out of step with what the application is
 * doing. `thinking` means a request is genuinely in flight. `insight`,
 * `contradictory_evidence` and `waiting_for_human` come from the *answer* —
 * the server decides which of those is true, because it is the side that saw
 * the evidence. `error` means the interpretation layer could not be reached and
 * says so instead of inventing prose.
 *
 * ## On the streamed text
 *
 * `draft` is what the model is producing right now. It is shown, and it is
 * **not** the answer: when the stream finishes the server sends a validated
 * `ObserverAnswer`, and the draft is replaced by it or discarded. A reader
 * never keeps a sentence that failed validation, and the component makes that
 * visible by rendering the draft in a distinct, explicitly provisional state.
 */

export interface ObserverSession {
  readonly state: OrbState;
  readonly busy: boolean;
  readonly outcome: AskOutcome | null;
  /** What the tool layer is doing, in words, while it does it. Real stages. */
  readonly progress: string | null;
  /**
   * Every stage the server named and every analysis that ran this turn, in the
   * one order they arrived: the last is the one in progress while the turn
   * runs. Two lists joined afterwards put the composing stage before the
   * analyses it follows.
   */
  readonly steps: readonly { readonly kind: "stage" | "tool"; readonly name: string }[];
  /** Analyses that have actually run this turn. */
  readonly tools: readonly string[];
  /** Provisional streamed prose. Replaced by the validated answer. */
  readonly draft: { readonly answer: string; readonly interpretation: string } | null;
  /** The last question asked, so Retry does not need it typed again. */
  readonly lastQuestion: string | null;
  /**
   * Asks one question.
   *
   * `model` overrides the account's standing choice for this question only,
   * and is a request rather than a permission: the server checks it against the
   * catalogue and against what the account holds before anything is spent.
   */
  ask: (question: string, depth?: "standard" | "deep", model?: string | null) => Promise<void>;
  retry: () => Promise<void>;
  cancel: () => void;
  dismiss: () => void;
}

const EMPTY_DRAFT = { answer: "", interpretation: "" };

/** The orb state an answer implies, with the client's own states kept out. */
function stateFor(outcome: AskOutcome): OrbState {
  if (outcome.answer === null) return "error";
  switch (outcome.answer.orbState) {
    case "insight":
      return "insight";
    case "contradictory_evidence":
      return "contradictory_evidence";
    case "waiting_for_human":
      return "waiting_for_human";
    case "error":
      return "error";
  }
}

function failure(question: string, refusal: string): AskOutcome {
  return {
    question,
    answer: null,
    refusal,
    toolsUsed: [],
    sources: [],
    demoData: true,
    status: { provider: "unknown", model: "unknown", live: false, reason: null },
  };
}

export function useObserver(context: ObserverContext, onInsight?: () => void): ObserverSession {
  const [state, setState] = useState<OrbState>("idle");
  const [outcome, setOutcome] = useState<AskOutcome | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [steps, setSteps] = useState<ObserverSession["steps"]>([]);
  const [tools, setTools] = useState<readonly string[]>([]);
  const [draft, setDraft] = useState<{ answer: string; interpretation: string } | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [lastDepth, setLastDepth] = useState<"standard" | "deep">("standard");
  const abort = useRef<AbortController | null>(null);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * A reader who leaves mid-answer takes the request with them.
   *
   * The abort waits a tick: React's development double-mount unmounts and
   * remounts at once, and a caller that asks on mount (`AskLiveAnswer`) sends
   * exactly one request across it. The remount cancels the pending abort; a
   * real unmount lets it run.
   */
  useEffect(() => {
    if (leaving.current !== null) clearTimeout(leaving.current);
    leaving.current = null;
    return () => {
      leaving.current = setTimeout(() => abort.current?.abort(), 0);
    };
  }, []);

  const cancel = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setProgress(null);
    setDraft(null);
    setState(outcome === null ? "idle" : stateFor(outcome));
  }, [outcome]);

  const dismiss = useCallback(() => {
    setOutcome(null);
    setDraft(null);
    setTools([]);
    setSteps([]);
    setState("idle");
  }, []);

  const ask = useCallback(
    async (
      question: string,
      depth: "standard" | "deep" = "standard",
      model: string | null = null,
    ) => {
      if (question.trim().length === 0 || abort.current !== null) return;

      const controller = new AbortController();
      abort.current = controller;
      setState("thinking");
      setProgress("Choosing the analysis");
      setSteps([]);
      setTools([]);
      setDraft(null);
      setLastQuestion(question);
      setLastDepth(depth);

      try {
        const response = await fetch("/api/ask/stream", {
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
            depth,
            /*
             * The model for THIS question, when the reader picked one.
             *
             * A request, not a permission: the server validates it against the
             * catalogue and then against what this account actually holds, so
             * naming a model here cannot reach a provider the account has not
             * connected.
             */
            model,
          }),
        });

        /*
         * A failure has to say which failure it was.
         *
         * "Could not reach its analysis layer" was once shown for every
         * non-200, including an expired session — which sent the reader looking
         * for an outage when the answer was to sign in again.
         */
        if (response.status === 401) {
          setOutcome(
            failure(question, "Your session has expired. Sign in again and ask once more."),
          );
          setState("error");
          return;
        }
        /*
         * Every other refusal carries the gate's own sentence — a ceiling, a
         * duplicate, a server that cannot take questions — and that sentence is
         * the one the reader can act on. Only a body with none falls through to
         * the generic failure below.
         */
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          if (typeof body?.error === "string") {
            setOutcome(failure(question, body.error));
            setState("error");
            return;
          }
        }
        if (!response.ok || response.body === null) throw new Error(String(response.status));

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let settled = false;
        const building = { ...EMPTY_DRAFT };

        /*
         * A minimal SSE parser rather than `EventSource`.
         *
         * `EventSource` cannot issue a POST and cannot carry a JSON body, and
         * this request needs both. The framing is simple enough that parsing it
         * is smaller than the workaround would be.
         */
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let split = buffer.indexOf("\n\n");
          while (split !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            split = buffer.indexOf("\n\n");

            const nameLine = /^event: (.+)$/m.exec(frame);
            const dataLine = /^data: (.+)$/m.exec(frame);
            if (nameLine?.[1] === undefined || dataLine?.[1] === undefined) continue;

            let payload: unknown;
            try {
              payload = JSON.parse(dataLine[1]);
            } catch {
              continue;
            }

            switch (nameLine[1]) {
              case "stage":
                {
                  const label = (payload as { label: string }).label;
                  setProgress(label);
                  setSteps((current) =>
                    current.some((s) => s.kind === "stage" && s.name === label)
                      ? current
                      : [...current, { kind: "stage", name: label }],
                  );
                }
                break;
              case "tool": {
                const name = (payload as { name: string }).name;
                setTools((current) => (current.includes(name) ? current : [...current, name]));
                setSteps((current) =>
                  current.some((s) => s.kind === "tool" && s.name === name)
                    ? current
                    : [...current, { kind: "tool", name }],
                );
                break;
              }
              case "delta": {
                const { field, delta } = payload as { field: string; delta: string };
                if (field === "answer") building.answer += delta;
                if (field === "interpretation") building.interpretation += delta;
                setState("speaking");
                setDraft({ ...building });
                break;
              }
              case "final": {
                const next = payload as AskOutcome;
                settled = true;
                setOutcome(next);
                setDraft(null);
                setState(stateFor(next));
                if (next.answer !== null) onInsight?.();
                break;
              }
              case "failure":
                settled = true;
                setOutcome(
                  failure(
                    question,
                    (payload as { error?: string }).error ??
                      "Observer could not complete this answer.",
                  ),
                );
                setDraft(null);
                setState("error");
                break;
            }
          }
        }

        /*
         * A stream that ended without a final event is a failure, not an answer.
         *
         * Left unhandled this is the worst state in the whole feature: prose on
         * screen that never passed validation, with an orb that looks settled.
         */
        if (!settled) {
          setOutcome(
            failure(
              question,
              "Observer's answer ended before it was complete, so it has been discarded rather than shown. The measured evidence on this page is unaffected.",
            ),
          );
          setDraft(null);
          setState("error");
        }
      } catch (error) {
        // An aborted request is the reader's decision, not a failure.
        if (error instanceof DOMException && error.name === "AbortError") return;
        setOutcome(
          failure(
            question,
            "Observer could not reach its interpretation layer. Nothing has been answered from memory — every figure it reports comes from the same read models the screens draw from. The measured evidence is still on the page.",
          ),
        );
        setDraft(null);
        setState("error");
      } finally {
        abort.current = null;
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
    ],
  );

  const retry = useCallback(async () => {
    if (lastQuestion === null) return;
    await ask(lastQuestion, lastDepth);
  }, [ask, lastDepth, lastQuestion]);

  return {
    state,
    busy: state === "thinking" || state === "speaking",
    outcome,
    progress,
    steps,
    tools,
    draft,
    lastQuestion,
    ask,
    retry,
    cancel,
    dismiss,
  };
}
