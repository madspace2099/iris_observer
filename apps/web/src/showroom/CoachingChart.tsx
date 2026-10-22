"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { PresenterEnd, PresenterRow } from "@observer/readmodels";

import { AgentPortrait } from "@/components/agents/Portrait";
import { dynamicRoute } from "@/lib/href";

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
 * The key is the interaction. Pointing at a name, or moving the keyboard onto
 * it, lifts that agent's dots, prints their figures on them and dims the
 * others; pressing the name draws or hides them (`aria-pressed`); the link
 * beside it opens their page.
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

/**
 * The agents drawn, the lifted one last so it lies on top, the rest faded.
 * A hidden agent cannot be lifted: pointing at their entry, or the press that
 * just hid them, would otherwise fade every dot and lift none.
 */
export function shownPeople<P extends { readonly id: string; readonly tone: string }>(
  people: readonly P[],
  hidden: ReadonlySet<string>,
  lifted: string | null,
): { readonly lift: string | null; readonly shown: readonly P[] } {
  const lift = lifted !== null && !hidden.has(lifted) ? lifted : null;
  const shown = people
    .filter((p) => !hidden.has(p.id))
    .sort((a, b) => Number(a.id === lift) - Number(b.id === lift))
    .map((p) => ({ ...p, tone: lift === null || lift === p.id ? p.tone : dimmed(p.tone) }));
  return { lift, shown };
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
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [lifted, setLifted] = useState<string | null>(null);

  const toggle = (id: string) =>
    setHidden((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { lift, shown } = shownPeople(people, hidden, lifted);
  const byId = new Map(people.map((p) => [p.id, p]));

  return (
    <div className="ag-coach-chart">
      <ul className="ag-coach-key" aria-label="Agents in the chart">
        {people.map((p) => (
          <li
            key={p.id}
            data-hidden={hidden.has(p.id) ? "true" : undefined}
            data-lifted={lift === p.id ? "true" : undefined}
            onMouseEnter={() => setLifted(p.id)}
            onMouseLeave={() => setLifted(null)}
            onFocus={() => setLifted(p.id)}
            onBlur={() => setLifted(null)}
          >
            <button
              type="button"
              aria-pressed={!hidden.has(p.id)}
              title={hidden.has(p.id) ? `Draw ${p.name}` : `Hide ${p.name}`}
              onClick={() => toggle(p.id)}
            >
              <AgentPortrait name={p.name} src={p.portrait} tone={p.tone} size="row" alt="" />
              <span>
                <b>{p.name}</b>
                <em>{p.meetings}</em>
              </span>
            </button>
            <Link href={dynamicRoute(p.href)}>
              Agent page<span className="ox-sr"> for {p.name}</span>
            </Link>
          </li>
        ))}
      </ul>

      {shown.length === 0 ? (
        <p className="iris-meta">Every agent is hidden. Press a name above to draw them again.</p>
      ) : (
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
          <ol className="ag-coach-rows">
            {rows.map((row) => (
              <li key={row.id} data-named={row.ends === null ? undefined : "true"}>
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
                        style={{ "--at": mark.share, "--tone": p.tone } as CSSProperties}
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
        </div>
      )}
    </div>
  );
}
