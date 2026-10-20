"use client";

import Link from "next/link";
import { useState } from "react";

import { dynamicRoute } from "@/lib/href";
import { Radar } from "./charts2";
import { Parallel, Sized, type ParallelData } from "./forms";

/**
 * EVERY AGENT IN ONE CHART, AND A KEY THAT WORKS (the owner, 2026-10-20).
 *
 * Coaching drew one small radar per person, and the reader compared shapes
 * across a row of cards. Here every agent at or above the floor is drawn in
 * one large chart, in the seat colour the read model gives them, through one
 * of two lenses the page chooses: how they present (the radar) or which parts
 * of the showroom they use (the parallel plot).
 *
 * The key is the interaction. Pointing at a name, or moving the keyboard onto
 * it, lifts that agent's shape or line and dims the others; pressing the name
 * draws or hides them (`aria-pressed`); the link beside it opens their page.
 * Nothing here counts: every figure arrives drawn-ready from the read model,
 * and what changes is only which marks are shown and how brightly.
 */

export interface CoachingPerson {
  readonly id: string;
  readonly name: string;
  /** "39 meetings": the count the key carries, in words. */
  readonly meetings: string;
  readonly tone: string;
  readonly href: string;
  /** The radar's values, 0 to 1 against the strongest presenter on each spoke. */
  readonly shape: readonly number[];
  /** The parallel plot's values, a share per axis, null where the build cannot answer. */
  readonly parts: readonly (number | null)[];
}

/** A tone faded back, for every agent but the one being pointed at. */
function dimmed(tone: string): string {
  return `color-mix(in oklab, ${tone} 22%, transparent)`;
}

/**
 * The agents drawn, the lifted one last so it lies on top, the rest faded.
 * A hidden agent cannot be lifted: pointing at their entry, or the press that
 * just hid them, would otherwise fade every shape and lift none.
 */
export function shownPeople(
  people: readonly CoachingPerson[],
  hidden: ReadonlySet<string>,
  lifted: string | null,
): { readonly lift: string | null; readonly shown: readonly CoachingPerson[] } {
  const lift = lifted !== null && !hidden.has(lifted) ? lifted : null;
  const shown = people
    .filter((p) => !hidden.has(p.id))
    .sort((a, b) => Number(a.id === lift) - Number(b.id === lift))
    .map((p) => ({ ...p, tone: lift === null || lift === p.id ? p.tone : dimmed(p.tone) }));
  return { lift, shown };
}

export function CoachingChart({
  lens,
  radarAxes,
  parallelAxes,
  people,
}: {
  readonly lens: "radar" | "parallel";
  readonly radarAxes: readonly string[];
  readonly parallelAxes: ParallelData["axes"];
  /** Every drawn agent, in seat order. */
  readonly people: readonly CoachingPerson[];
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

  const radar = (size: number) => (
    <Radar
      axes={radarAxes}
      series={shown.map((p) => ({ id: p.id, label: p.name, values: p.shape, tone: p.tone }))}
      size={size}
    />
  );
  const parallel = (size: "xl" | "m" | "l") => (
    <Parallel
      data={{
        axes: parallelAxes,
        lines: shown.map((p) => ({ id: p.id, label: p.name, values: p.parts, tone: p.tone })),
      }}
      size={size}
    />
  );

  return (
    <div className="iris-coach-chart" data-lens={lens}>
      <ul className="iris-coach-key" aria-label="Agents in the chart">
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
              {/* Hollow while hidden: the ring keeps the colour, so the reader still knows whose it is. */}
              <i
                style={{ borderColor: p.tone, background: hidden.has(p.id) ? "none" : p.tone }}
                aria-hidden="true"
              />
              <span>{p.name}</span>
              <em>{p.meetings}</em>
            </button>
            <Link href={dynamicRoute(p.href)}>
              Agent page<span className="ox-sr"> for {p.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="iris-coach-hint">
        Point at a name to lift that agent; press it to hide or draw them.
      </p>

      <div className="iris-coach-plot">
        {shown.length === 0 ? (
          <p className="iris-meta">Every agent is hidden. Press a name above to draw them again.</p>
        ) : lens === "radar" ? (
          <Sized xl={radar(600)} m={radar(448)} l={radar(190)} />
        ) : (
          <Sized xl={parallel("xl")} m={parallel("m")} l={parallel("l")} />
        )}
      </div>
    </div>
  );
}
