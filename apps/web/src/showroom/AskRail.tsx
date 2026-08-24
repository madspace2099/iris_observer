"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { INSIGHT_SOURCE_LABELS, type InsightSource } from "@observer/contracts";

/**
 * Ask Observer.
 *
 * Chrome, not a page. It sits on every surface, carries the current context as
 * visible chips, and opens its answer on the evidence field rather than in a
 * modal over the content.
 *
 * The five parts of an answer are laid out separately and always in the same
 * order — observed facts, interpretation, recommendation, limitations,
 * confidence and evidence — because the whole point of the architecture is that
 * the reader can see which part a model wrote and which part it did not.
 */

interface ToolFact {
  readonly label: string;
  readonly value: string;
  readonly note: string | null;
}

interface EvidenceRef {
  readonly evidenceId: string;
  readonly tier: string;
  readonly href: string;
  readonly observationCount: number;
}

interface AskAnswer {
  readonly observed: readonly ToolFact[];
  readonly interpretation: string;
  readonly recommendation: string | null;
  readonly limitations: readonly string[];
  readonly confidence: "high" | "moderate" | "low";
  readonly dataCompleteness: string;
  readonly evidence: readonly EvidenceRef[];
  readonly sources: readonly InsightSource[];
  readonly action: { readonly label: string; readonly href: string } | null;
}

interface AskOutcome {
  readonly question: string;
  readonly answer: AskAnswer | null;
  readonly refusal: string | null;
  readonly toolsUsed: readonly string[];
  readonly status: { readonly provider: string; readonly model: string; readonly live: boolean; readonly reason: string | null };
}

const SUGGESTIONS = [
  "Compare Monika and Akhilesh's presentation flows.",
  "What do the more successful showroom meetings have in common?",
  "Which IRIS sections are being skipped most frequently?",
  "How are weather and time-of-day presets used during presentations?",
  "Summarize the most important showroom behavior changes this month.",
];

function Spark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8" />
    </svg>
  );
}

export function AskRail({ projectLabel, root }: { projectLabel: string; root: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<AskOutcome | null>(null);

  const period = params.get("period") ?? "quarter_to_date";
  const unitCode = params.get("unit");
  const meetingId = /\/meetings\/([^/?]+)/.exec(pathname)?.[1] ?? null;
  const [, tenantSlug = "", projectSlug = ""] = root.split("/");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        input.current?.focus();
      }
      if (event.key === "Escape") setOutcome(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = useCallback(
    async (question: string) => {
      if (question.trim().length === 0 || busy) return;
      setBusy(true);
      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, tenantSlug, projectSlug, period, unitCode, meetingId }),
        });
        if (!response.ok) throw new Error(String(response.status));
        setOutcome((await response.json()) as AskOutcome);
      } catch {
        setOutcome({
          question,
          answer: null,
          refusal: "Observer could not reach its analysis layer. Nothing was answered from memory.",
          toolsUsed: [],
          status: { provider: "unknown", model: "unknown", live: false, reason: null },
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, meetingId, period, projectSlug, tenantSlug, unitCode],
  );

  return (
    <>
      <div className="iris-rail" data-busy={busy ? "true" : undefined}>
        <span className="iris-rail-context">
          <span className="iris-code">{projectLabel}</span>
          <span className="iris-code">·</span>
          <span className="iris-code">{period.replace(/_/g, " ")}</span>
          {unitCode === null ? null : (
            <>
              <span className="iris-code">·</span>
              <span className="iris-code" style={{ color: "var(--accent)" }}>
                {unitCode}
              </span>
            </>
          )}
          {meetingId === null ? null : (
            <>
              <span className="iris-code">·</span>
              <span className="iris-code" style={{ color: "var(--accent)" }}>
                {meetingId}
              </span>
            </>
          )}
        </span>
        <span className="iris-rail-divider" />
        <label className="iris-ask">
          <Spark />
          <span className="iris-sr">Ask Observer</span>
          <input
            ref={input}
            value={value}
            placeholder={busy ? "Working…" : "Ask Observer…"}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit(value);
            }}
          />
          <kbd>⌘K</kbd>
        </label>
        <button
          className="iris-action"
          type="button"
          onClick={() => {
            const next = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)] as string;
            setValue(next);
            void submit(next);
          }}
        >
          Suggest
        </button>
      </div>

      {outcome === null ? null : (
        <aside className="iris-sheet" role="dialog" aria-label="Ask Observer">
          <div className="iris-sheet-head">
            <p className="iris-kicker">Ask Observer</p>
            <button className="iris-sheet-close" type="button" onClick={() => setOutcome(null)} aria-label="Close">
              ×
            </button>
          </div>

          <p className="iris-meta">{outcome.question}</p>

          {outcome.refusal !== null ? (
            <p className="iris-body" style={{ marginTop: "1rem" }}>
              {outcome.refusal}
            </p>
          ) : outcome.answer === null ? null : (
            <div className="iris-stack" style={{ marginTop: "1rem" }}>
              {/* 1. Observed facts. Computed by a tool, never by the model. */}
              <section>
                <p className="iris-kicker">Observed</p>
                <dl className="iris-detail">
                  {outcome.answer.observed.map((fact, i) => (
                    <div key={`${fact.label}-${i}`}>
                      <dt>{fact.label}</dt>
                      <dd>
                        {fact.value}
                        {fact.note === null ? null : <span className="iris-code"> · {fact.note}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              {/* 2. Interpretation. The only part a model may have written. */}
              <section>
                <p className="iris-kicker">Interpretation</p>
                <p className="iris-body">{outcome.answer.interpretation}</p>
              </section>

              {/* 3. Recommended action. */}
              {outcome.answer.action === null ? null : (
                <a className="iris-action" data-emphasis="primary" href={outcome.answer.action.href}>
                  {outcome.answer.action.label}
                </a>
              )}

              {/* 4. Limitations. Never folded into the prose. */}
              {outcome.answer.limitations.length === 0 ? null : (
                <div className="iris-gap">
                  <b>Limitations</b>
                  <ul>
                    {outcome.answer.limitations.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 5. Confidence, completeness, provenance and evidence. */}
              <section>
                <p className="iris-kicker">Confidence and evidence</p>
                <p className="iris-meta">
                  {outcome.answer.confidence} confidence · {outcome.answer.dataCompleteness}
                </p>
                <span className="iris-srcs" style={{ marginTop: ".5rem" }}>
                  {outcome.answer.sources.map((s) => (
                    <span className="iris-src" key={s} data-src={s}>
                      {INSIGHT_SOURCE_LABELS[s]}
                    </span>
                  ))}
                </span>
                <div style={{ display: "grid", gap: ".375rem", marginTop: ".625rem" }}>
                  {outcome.answer.evidence.map((e) => (
                    <a className="iris-evidence" key={e.evidenceId} href={e.href}>
                      <i />
                      {e.observationCount} records · {e.tier.replace(/_/g, " ")}
                    </a>
                  ))}
                </div>
                <p className="iris-code" style={{ marginTop: ".75rem", color: "var(--ink-3)" }}>
                  {outcome.toolsUsed.join(", ") || "no tool"} ·{" "}
                  {outcome.status.live
                    ? `${outcome.status.provider} · ${outcome.status.model}`
                    : `deterministic · ${outcome.status.reason ?? "no model configured"}`}
                </p>
              </section>
            </div>
          )}

          <div className="iris-stack" style={{ marginTop: "1.5rem" }}>
            <p className="iris-kicker">Try next</p>
            {SUGGESTIONS.filter((s) => s !== outcome.question).slice(0, 4).map((s) => (
              <button
                key={s}
                type="button"
                className="iris-followup"
                onClick={() => {
                  setValue(s);
                  void submit(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </aside>
      )}
    </>
  );
}
