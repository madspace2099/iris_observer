"use client";

import { useState } from "react";
import type { MeetingReplay, ReplayStep } from "@observer/readmodels";
import { Coverage, Gaps, SourceChips } from "./parts";

/**
 * Meeting Replay.
 *
 * One showroom meeting told as a story rather than dumped as an event table.
 * The spine is chronological; sections are the beats and everything else hangs
 * off the section it happened inside.
 *
 * Any step can be opened to see its evidence. A step whose time is unknown says
 * so in place of a timestamp — the sequence is real even when the pacing is
 * not, and pretending otherwise would be the exact fiction the audit found in
 * the legacy dashboard.
 */

const MARKS: Record<ReplayStep["kind"], string> = {
  section: "▸",
  unit: "□",
  favourite: "★",
  pdf: "▤",
  balcony: "◲",
  floor_cut: "◫",
  screenshot: "◉",
  compare: "⇄",
  share: "↗",
  environment: "☼",
  filter: "≡",
  outcome: "●",
};

export function Replay({ replay }: { replay: MeetingReplay }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="iris-two">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">
          {replay.startedDisplay} · {replay.agentName}
        </p>
        <h1 className="iris-section">{replay.headline}</h1>

        {!replay.timingAvailable ? (
          <p className="iris-finding-caveat">
            This session came from the legacy analytics. The order below is exactly what was
            recorded; the times were never captured, so none are shown.
          </p>
        ) : null}

        <div className="iris-replay" style={{ marginTop: ".75rem" }}>
          {replay.steps.map((step) => (
            <div key={`${step.ordinal}-${step.kind}-${step.label}`}>
              <button
                type="button"
                className="iris-replay-step"
                data-kind={step.kind}
                aria-expanded={open === step.ordinal}
                onClick={() => setOpen(open === step.ordinal ? null : step.ordinal)}
              >
                <span className="iris-replay-mark" aria-hidden="true">
                  {MARKS[step.kind]}
                </span>
                <span className="iris-replay-label">
                  {step.label}
                  {step.isReturn ? <em> · returned</em> : null}
                  {step.detail === null ? null : <em> · {step.detail}</em>}
                </span>
                {/*
                  * Unavailability is stated once, in the gaps block, not beside
                  * every affected row. Eleven repetitions of "time not recorded"
                  * is noise that trains the reader to stop reading it.
                  */}
                <span className="iris-replay-time" data-unknown={step.atDisplay === null ? "true" : undefined}>
                  {step.atDisplay === null
                    ? (step.dwellDisplay ?? "")
                    : `${step.atDisplay}${step.dwellDisplay === null ? "" : ` · ${step.dwellDisplay}`}`}
                </span>
              </button>

              {open === step.ordinal ? (
                <div className="iris-replay-detail">
                  <SourceChips sources={step.sources} />
                  {step.unitCode === null ? null : <span>Unit {step.unitCode}</span>}
                  {step.sectionId === null ? null : <span>Section {step.sectionId}</span>}
                  {step.atDisplay === null ? (
                    <span>
                      This source records that the step happened and where it sat in the order, but
                      not when. Per-step timing needs the UE5 v2 event.
                    </span>
                  ) : null}
                  {step.evidence === null ? (
                    <span className="iris-code">no separate evidence record</span>
                  ) : (
                    <a className="iris-evidence" href={step.evidence.href}>
                      <i />
                      {step.evidence.observationCount} records ·{" "}
                      {step.evidence.tier.replace(/_/g, " ")}
                    </a>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <aside className="iris-plane iris-plane--raised iris-stack">
        <div>
          <p className="iris-kicker">Outcome</p>
          <p className="iris-section" style={{ margin: ".25rem 0 .5rem" }}>
            {replay.outcomeLabel}
          </p>
          <SourceChips sources={["CRM_OUTCOME_CONTEXT"]} />
          <p className="iris-meta" style={{ marginTop: ".5rem" }}>
            Recorded by the agent at the end of the meeting. It labels this presentation for
            comparison; it is not what Observer reports on.
          </p>
        </div>

        <hr className="iris-rule" />
        <Coverage coverage={replay.coverage} singleMeeting />
        <hr className="iris-rule" />

        <dl className="iris-detail">
          <div>
            <dt>agent</dt>
            <dd>{replay.agentName}</dd>
          </div>
          <div>
            <dt>started</dt>
            <dd>{replay.startedDisplay}</dd>
          </div>
          <div>
            <dt>duration</dt>
            <dd>{replay.durationDisplay}</dd>
          </div>
          <div>
            {/*
              * "Sections" and "recorded events" are different counts and were
              * both labelled "steps", so the panel contradicted the headline.
              */}
            <dt>sections</dt>
            <dd>{replay.steps.filter((s) => s.kind === "section").length}</dd>
          </div>
          <div>
            <dt>recorded events</dt>
            <dd>{replay.steps.length}</dd>
          </div>
        </dl>

        <Gaps gaps={replay.gaps} />
      </aside>
    </div>
  );
}
