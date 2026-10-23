"use client";

import Link from "next/link";
import { useState, type CSSProperties, type PointerEvent } from "react";
import type { PresenterEnd, PresenterRow } from "@observer/readmodels";

import { AgentPortrait } from "@/components/agents/Portrait";
import { dynamicRoute } from "@/lib/href";

import { DrawIn } from "./DrawIn";

/**
 * HOW DO THE AGENTS DIFFER: ONE CHART, AND A KEY THAT WORKS (ADR-0057).
 *
 * The owner, 2026-10-22, on the radar and the parallel plot beside three lists
 * of sentences: a mess, no focus, he could not tell what the panel wanted to
 * show. One chart now: a row per part of the showroom, a dot per agent at the
 * share of their own meetings that used it, the rows from the widest gap to
 * the narrowest. The three widest name who sits at each end, face and figure,
 * under the row they belong to. Every figure arrives from the read model
 * (`PresenterComparison`); nothing here counts.
 *
 * The key is the interaction. Pressing a name (a tap, a click, Space or
 * Enter) lifts that agent: their dots on top with their figure over each, the
 * others faded, until it is pressed again (`aria-pressed`). A mouse pointing at
 * a name lifts it for as long as it rests there. The arrow beside the name
 * opens their page. A tap is never taken for pointing: a phone lifts on the
 * press alone, so a tap never lifts and drops in one move (review round).
 * Marks too close to share a line sit in lanes the read model gives them.
 */

export interface CoachingPerson {
  readonly id: string;
  readonly name: string;
  /** "39 meetings": the count the key carries, in words. */
  readonly meetings: string;
  readonly tone: string;
  readonly href: string;
  /** From `portraitSources`; null draws the initials. */
  readonly portrait: string | null;
}

/** A tone faded back, for every agent but the one being pointed at. */
function dimmed(tone: string): string {
  return `color-mix(in oklab, ${tone} 22%, transparent)`;
}

/** Every agent drawn, the lifted one last so it lies on top, the rest faded. */
export function shownPeople<P extends { readonly id: string; readonly tone: string }>(
  people: readonly P[],
  lift: string | null,
): readonly P[] {
  return [...people]
    .sort((a, b) => Number(a.id === lift) - Number(b.id === lift))
    .map((p) => ({ ...p, tone: lift === null || lift === p.id ? p.tone : dimmed(p.tone) }));
}

/** One end of a row: the faces, the names, the figure and what it is of. */
function End({
  end,
  people,
}: {
  readonly end: PresenterEnd;
  readonly people: ReadonlyMap<string, CoachingPerson>;
}) {
  return (
    <span className="ag-coach-end">
      {end.agentIds.map((id) => {
        const person = people.get(id);
        return person === undefined ? null : (
          <AgentPortrait
            key={id}
            name={person.name}
            src={person.portrait}
            tone={person.tone}
            size="row"
            alt=""
          />
        );
      })}
      <span>
        <b>{end.names}</b> {end.share} <em>{end.of}</em>
      </span>
    </span>
  );
}

export function CoachingChart({
  people,
  rows,
}: {
  /** Every drawn agent, in seat order. */
  readonly people: readonly CoachingPerson[];
  readonly rows: readonly PresenterRow[];
}) {
  const [pressed, setPressed] = useState<string | null>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  const lift = pointed ?? pressed;
  const shown = shownPeople(people, lift);
  const byId = new Map(people.map((p) => [p.id, p]));
  /* A mouse only: a touch fires the same events on its way to the press. */
  const point = (id: string | null) => (e: PointerEvent) => {
    if (e.pointerType === "mouse") setPointed(id);
  };

  return (
    <div className="ag-coach-chart">
      <ul className="ag-coach-key" aria-label="Agents in the chart">
        {people.map((p) => (
          <li
            key={p.id}
            data-lifted={lift === p.id ? "true" : undefined}
            onPointerEnter={point(p.id)}
            onPointerLeave={point(null)}
          >
            <button
              type="button"
              aria-pressed={pressed === p.id}
              onClick={() => setPressed((was) => (was === p.id ? null : p.id))}
            >
              <AgentPortrait name={p.name} src={p.portrait} tone={p.tone} size="row" alt="" />
              <span>
                <b>{p.name}</b>
                <em>{p.meetings}</em>
              </span>
            </button>
            {/* No viewport prefetch: a click still goes straight there (ADR-0061). */}
            <Link prefetch={false} href={dynamicRoute(p.href)} title="Agent page">
              <span aria-hidden="true">→</span>
              <span className="ox-sr">Agent page for {p.name}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="ag-coach-plot">
        {/* The base of every dot, said once over the rows; the screen reader's summary says it too. */}
        <div className="ag-coach-scale" aria-hidden="true">
          <span className="ag-coach-base">Share of each agent&rsquo;s own meetings</span>
          <span className="ag-coach-ticks">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </span>
        </div>
        {/* The rows sweep in from 0% when their screen arrives, once (ADR-0061). */}
        <DrawIn kind="sweep">
          <ol className="ag-coach-rows">
            {rows.map((row) => (
              <li
                key={row.id}
                data-named={row.ends === null ? undefined : "true"}
                style={{ "--lanes": row.lanes } as CSSProperties}
              >
                <span className="ag-coach-label">{row.label}</span>
                {/* Pointer detail: the screen reader's summary beside the chart carries every figure. */}
                <span className="ag-coach-track" aria-hidden="true">
                  {shown.map((p) => {
                    const mark = row.marks.find((m) => m.agentId === p.id);
                    return mark === undefined ? null : (
                      <i
                        key={p.id}
                        data-lifted={p.id === lift ? "true" : undefined}
                        title={`${p.name}: ${mark.display}`}
                        style={
                          {
                            "--at": mark.share,
                            "--lane": mark.lane,
                            "--tone": p.tone,
                          } as CSSProperties
                        }
                      >
                        {p.id === lift ? <b>{mark.display}</b> : null}
                      </i>
                    );
                  })}
                </span>
                {row.ends === null ? null : (
                  <p className="ag-coach-ends">
                    <End end={row.ends.high} people={byId} />
                    <End end={row.ends.low} people={byId} />
                  </p>
                )}
              </li>
            ))}
          </ol>
        </DrawIn>
      </div>
    </div>
  );
}
