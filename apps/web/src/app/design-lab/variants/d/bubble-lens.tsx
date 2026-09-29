"use client";

import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import type { DBubbleLens, DLensMeeting } from "../../lab-data";
import { D_TINT_RADIUS } from "./defs";

/**
 * THE BUBBLE LENS: SIX MONTHS AT SHOWROOM PACE, SEVEN DAYS AT A TIME.
 *
 * Three to five meetings a day for every agent is a few thousand bubbles in six
 * months, and no canvas holds that many at a size that can still be told apart.
 * So the six months are a strip — a column per day, as tall as its bubbles —
 * and above it a lens shows seven days, or at a wide window a month, with one
 * bubble per meeting at a size that reads. The strip moves the lens: drag it,
 * click it, or use the arrow keys on it. The keys above the lens hide what the
 * reader does not want to see, and a pointer resting on a bubble reads it.
 *
 * ## One canvas, a colour per agent, a size per outcome
 *
 * Every agent's meetings of a day rest together in one pile, each bubble in its
 * agent's colour and at its outcome's size, the largest at the foot. A pointer
 * resting on an agent's key lifts that agent's bubbles out of the rest, so
 * whose the largest are reads at a glance.
 *
 * ## The size is set once
 *
 * A bubble's size is the rule's (100, 70, 50, 25 across at full scale) times
 * one scale, fixed for the six months at each span: the largest the lens's
 * columns allow, brought down only as far as the fullest day in the six months
 * needs to fit. So a bubble means the same in every week, the lens does not
 * change height as it moves, and hiding a key never makes the rest grow.
 *
 * Nothing here computes a figure the card states; it lays out what `lab-data`
 * composed and counts what is on screen.
 */

type Span = "week" | "month";
type Geometry = "xl" | "l";

interface Frame {
  readonly width: number;
  /** The canvas at its tallest; a span whose fullest pile is shorter draws it shorter. */
  readonly canvas: number;
  /** Room kept above the fullest pile. */
  readonly pad: number;
  /** The day labels under the lens. */
  readonly axis: number;
  readonly strip: number;
  /** The month labels under the strip. */
  readonly stripAxis: number;
}

const FRAMES: Readonly<Record<Geometry, Frame>> = {
  xl: { width: 1240, canvas: 440, pad: 10, axis: 40, strip: 64, stripAxis: 22 },
  l: { width: 327, canvas: 300, pad: 6, axis: 34, strip: 44, stripAxis: 20 },
};

/** The floor a pile rests on, above the canvas's lower edge. */
const FLOOR = 6;
const WEEK = 7;

interface Fit {
  readonly scale: number;
  readonly tallest: number;
}

interface Rest {
  readonly m: number;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * Lays each bubble, in the order given, at the lowest place it can rest inside
 * its column — on the floor or on bubbles already laid — and, of places equally
 * low, the one nearest the column's middle. `y` is the centre's height above
 * the floor.
 */
function pile(items: readonly { readonly m: number; readonly r: number }[], half: number): Rest[] {
  const rests: Rest[] = [];
  for (const { m, r } of items) {
    const gap = Math.max(1, r * 0.08);
    const limit = Math.max(0, half - r);
    const xs = [0, limit, -limit, limit / 2, -limit / 2];
    for (const p of rests) {
      const d = p.r + r + gap;
      xs.push(p.x + d, p.x - d, p.x + d / 2, p.x - d / 2);
    }
    let bestX = 0;
    let bestY = Number.POSITIVE_INFINITY;
    for (const raw of xs) {
      const x = Math.max(-limit, Math.min(limit, raw));
      let y = r;
      for (const p of rests) {
        const d = p.r + r + gap;
        const dx = x - p.x;
        if (dx * dx < d * d) y = Math.max(y, p.y + Math.sqrt(d * d - dx * dx));
      }
      if (y < bestY - 0.01 || (y <= bestY + 0.01 && Math.abs(x) < Math.abs(bestX))) {
        bestX = x;
        bestY = y;
      }
    }
    rests.push({ m, x: bestX, y: bestY, r });
  }
  return rests;
}

function heightOf(rests: readonly Rest[]): number {
  return rests.reduce((h, p) => Math.max(h, p.y + p.r), 0);
}

function radius(data: DBubbleLens, m: number, scale: number): number {
  return ((data.outcomes[data.meetings[m]?.o ?? 0]?.diameter ?? 0) * scale) / 2;
}

/**
 * The one scale for a geometry and a span: the largest the columns allow,
 * brought down only as far as the fullest pile in the six months needs — and
 * how tall that pile then stands, which is how tall the canvas is.
 */
function scaleFor(
  piles: ReadonlyMap<number, readonly number[]>,
  data: DBubbleLens,
  geometry: Geometry,
  columns: number,
): Fit {
  const frame = FRAMES[geometry];
  const column = frame.width / columns;
  const room = frame.canvas - FLOOR - frame.pad;
  const most = Math.min(1, (column - 4) / (data.outcomes[0]?.diameter ?? 100));
  const tallest = (scale: number) => {
    let h = 0;
    for (const day of piles.values()) {
      h = Math.max(
        h,
        heightOf(
          pile(
            day.map((m) => ({ m, r: radius(data, m, scale) })),
            column / 2,
          ),
        ),
      );
    }
    return h;
  };
  const atMost = tallest(most);
  if (atMost <= room) return { scale: most, tallest: atMost };
  let lo = 0.02;
  let hi = most;
  for (let k = 0; k < 10; k += 1) {
    const mid = (lo + hi) / 2;
    if (tallest(mid) <= room) lo = mid;
    else hi = mid;
  }
  return { scale: lo, tallest: tallest(lo) };
}

function f(v: number): string {
  return v.toFixed(1);
}

/** An agent's colour: the gallery's series, the same on every card. */
function tone(a: number): string {
  return `var(--d-series-${(a % 6) + 1})`;
}

/** An agent's sphere, at a radius. */
function AgentSphere({ a, r }: { readonly a: number; readonly r: number }) {
  return (
    <use
      href={`#dld-sphere-agent-${(a % 6) + 1}`}
      transform={`scale(${(r / D_TINT_RADIUS).toFixed(4)})`}
    />
  );
}

export function BubbleLens({ data }: { readonly data: DBubbleLens }) {
  const last = data.days.length - 1;
  const lastMonth = data.months.length - 1;
  const [span, setSpan] = useState<Span>("week");
  const [weekStart, setWeekStart] = useState(Math.max(0, data.days.length - WEEK));
  const [monthIndex, setMonthIndex] = useState(lastMonth);
  const [hiddenOutcomes, setHiddenOutcomes] = useState<ReadonlySet<number>>(new Set());
  const [hiddenAgents, setHiddenAgents] = useState<ReadonlySet<number>>(new Set());
  const [lifted, setLifted] = useState<number | null>(null);
  const [tip, setTip] = useState<{
    readonly m: number;
    readonly x: number;
    readonly y: number;
    readonly held: boolean;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);

  /* Each day's pile, in the order it is laid: the largest first, then agent by agent, then by the clock. */
  const piles = useMemo(() => {
    const out = new Map<number, number[]>();
    data.meetings.forEach((m, i) => {
      const day = out.get(m.d);
      if (day === undefined) out.set(m.d, [i]);
      else day.push(i);
    });
    const order = (a: DLensMeeting, b: DLensMeeting) =>
      a.o - b.o || a.a - b.a || a.t.localeCompare(b.t);
    for (const day of out.values()) {
      day.sort((i, j) => {
        const a = data.meetings[i];
        const b = data.meetings[j];
        return a === undefined || b === undefined ? 0 : order(a, b);
      });
    }
    return out;
  }, [data]);

  const monthSpanWidest = Math.max(...data.months.map((m) => m.length));
  const wantsMonth = span === "month";
  const xlWeek = useMemo(() => scaleFor(piles, data, "xl", WEEK), [piles, data]);
  const lWeek = useMemo(() => scaleFor(piles, data, "l", WEEK), [piles, data]);
  const xlMonth = useMemo(
    () => (wantsMonth ? scaleFor(piles, data, "xl", monthSpanWidest) : null),
    [piles, data, wantsMonth, monthSpanWidest],
  );

  const shows = (m: DLensMeeting) => !hiddenOutcomes.has(m.o) && !hiddenAgents.has(m.a);

  /* --- the window ---------------------------------------------------------------- */

  const month = data.months[monthIndex] ?? data.months[lastMonth];
  const windowOf = (geometry: Geometry) =>
    span === "month" && geometry === "xl" && month !== undefined
      ? { first: month.first, columns: month.length, held: month.held }
      : { first: weekStart, columns: WEEK, held: WEEK };
  const xlWindow = windowOf("xl");
  const dayLabel = (d: number) => data.days[d]?.label ?? "";
  const windowWords =
    span === "month" && month !== undefined
      ? month.long
      : `${dayLabel(weekStart)} – ${dayLabel(Math.min(last, weekStart + WEEK - 1))}`;
  const monthOfDay = (d: number) => {
    const i = data.months.findIndex((m) => d >= m.first && d < m.first + m.held);
    return i < 0 ? lastMonth : i;
  };
  const clampWeek = (start: number) => Math.max(0, Math.min(last - WEEK + 1, start));

  const chooseSpan = (next: Span) => {
    if (next === span) return;
    if (next === "month") setMonthIndex(monthOfDay(Math.min(last, weekStart + WEEK - 1)));
    else if (month !== undefined) setWeekStart(clampWeek(month.first + month.held - WEEK));
    setSpan(next);
    setTip(null);
  };
  const step = (by: number) => {
    setTip(null);
    if (span === "month") setMonthIndex((i) => Math.max(0, Math.min(lastMonth, i + by)));
    else setWeekStart((s) => clampWeek(s + by * WEEK));
  };
  const atStart = span === "month" ? monthIndex === 0 : weekStart === 0;
  const atEnd = span === "month" ? monthIndex === lastMonth : weekStart >= last - WEEK + 1;

  /* --- what is in view, for the keys ---------------------------------------------- */

  const inView = data.meetings.filter(
    (m) => m.d >= xlWindow.first && m.d < xlWindow.first + xlWindow.held,
  );
  const outcomeCount = (o: number) =>
    inView.filter((m) => m.o === o && !hiddenAgents.has(m.a)).length;
  const agentCount = (a: number) =>
    inView.filter((m) => m.a === a && !hiddenOutcomes.has(m.o)).length;
  const shown = inView.filter(shows).length;

  const toggle = (set: ReadonlySet<number>, i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  };

  /* --- the tip -------------------------------------------------------------------- */

  const place = (target: Element, m: number, held: boolean) => {
    const box = target.getBoundingClientRect();
    const frame = root.current?.getBoundingClientRect();
    if (frame === undefined) return;
    const x = Math.max(128, Math.min(frame.width - 128, box.left + box.width / 2 - frame.left));
    setTip({ m, x, y: box.top - frame.top, held });
  };
  const onOver = (e: PointerEvent<SVGSVGElement>) => {
    if (tip?.held === true) return;
    const target = (e.target as Element).closest("[data-m]");
    if (target === null) {
      setTip(null);
      return;
    }
    place(target, Number(target.getAttribute("data-m")), false);
  };
  const onLeave = () => {
    if (tip?.held !== true) setTip(null);
  };
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const target = (e.target as Element).closest("[data-m]");
    if (target === null) {
      setTip(null);
      return;
    }
    const m = Number(target.getAttribute("data-m"));
    if (tip?.held === true && tip.m === m) setTip(null);
    else place(target, m, true);
  };

  /* --- the lens ------------------------------------------------------------------- */

  const lens = (geometry: Geometry) => {
    const frame = FRAMES[geometry];
    const win = windowOf(geometry);
    const fit = geometry === "l" ? lWeek : span === "month" ? (xlMonth ?? xlWeek) : xlWeek;
    /* The canvas as tall as the fullest pile of the six months at this scale, and no taller. */
    const body = Math.ceil(fit.tallest) + FLOOR + frame.pad;
    const floor = body - FLOOR;
    const column = frame.width / win.columns;
    const height = body + frame.axis;

    const placed: Rest[] = [];
    for (let c = 0; c < win.held; c += 1) {
      const day = piles.get(win.first + c) ?? [];
      const drawn = day.filter((m) => {
        const meeting = data.meetings[m];
        return meeting !== undefined && shows(meeting);
      });
      const cx = (c + 0.5) * column;
      for (const p of pile(
        drawn.map((m) => ({ m, r: radius(data, m, fit.scale) })),
        column / 2,
      )) {
        placed.push({ m: p.m, x: cx + p.x, y: floor - p.y, r: p.r });
      }
    }

    const tall = geometry === "xl" && win.columns <= WEEK;
    const future = win.columns - win.held;
    const described = `${windowWords}: ${placed.length} bubbles. ${data.outcomes
      .map((o, i) => `${o.label} ${placed.filter((p) => data.meetings[p.m]?.o === i).length}`)
      .join(", ")}.`;

    return (
      <svg
        className="dld-lens-canvas"
        viewBox={`0 0 ${frame.width} ${height}`}
        width={frame.width}
        height={height}
        role="img"
        aria-label={described}
        onPointerOver={onOver}
        onPointerLeave={onLeave}
        onClick={onClick}
      >
        {Array.from({ length: win.columns }, (_, c) => {
          const x = c * column;
          const day = c < win.held ? data.days[win.first + c] : undefined;
          return (
            <g key={`c${c}`}>
              {c === 0 ? null : (
                <line className="dld-lens-column" x1={f(x)} x2={f(x)} y1={0} y2={body} />
              )}
              {day === undefined ? null : (
                <text className="dld-lens-day" x={f(x + column / 2)} y={body + 16}>
                  <tspan x={f(x + column / 2)}>
                    {tall ? day.weekday : day.weekday.slice(0, geometry === "l" ? 2 : 1)}
                  </tspan>
                  <tspan x={f(x + column / 2)} dy={14}>
                    {tall ? day.label : String(day.date)}
                  </tspan>
                </text>
              )}
            </g>
          );
        })}
        {future === 0 ? null : (
          <g className="dld-lens-future">
            <rect x={f(win.held * column)} y={0} width={f(future * column)} height={body} />
            <text x={f((win.held + future / 2) * column)} y={body / 2}>
              to come
            </text>
          </g>
        )}
        <line className="dld-lens-floor" x1={0} x2={frame.width} y1={floor} y2={floor} />
        {placed.map((p) => {
          const meeting = data.meetings[p.m];
          if (meeting === undefined) return null;
          const dim = lifted !== null && meeting.a !== lifted;
          return (
            <g
              key={p.m}
              className="dld-lens-bubble"
              data-m={p.m}
              data-held={tip?.held === true && tip.m === p.m ? "true" : undefined}
              style={{ transform: `translate(${f(p.x)}px, ${f(p.y)}px)`, opacity: dim ? 0.14 : 1 }}
            >
              <AgentSphere a={meeting.a} r={p.r} />
              <circle className="dld-lens-ring" r={f(p.r + 3)} />
            </g>
          );
        })}
      </svg>
    );
  };

  /* --- the strip: the six months, and the lens on them ----------------------------- */

  /* How tall the fullest day stands, from every bubble: hiding a key shortens columns, never rescales them. */
  const fullest = useMemo(() => {
    const perDay = new Array<number>(data.days.length).fill(0);
    for (const m of data.meetings) perDay[m.d] = (perDay[m.d] ?? 0) + 1;
    return Math.max(1, ...perDay);
  }, [data]);
  /* Each day's column, agent by agent, of what the keys leave shown. */
  const columns = useMemo(() => {
    const out = Array.from({ length: data.days.length }, () =>
      new Array<number>(data.agents.length).fill(0),
    );
    for (const m of data.meetings) {
      const day = out[m.d];
      if (day !== undefined && !hiddenOutcomes.has(m.o) && !hiddenAgents.has(m.a)) {
        day[m.a] = (day[m.a] ?? 0) + 1;
      }
    }
    return out;
  }, [data, hiddenOutcomes, hiddenAgents]);

  const strip = (geometry: Geometry) => {
    const frame = FRAMES[geometry];
    const dayW = frame.width / data.days.length;
    const unit = frame.strip / fullest;
    const barW = Math.max(1, dayW - (dayW > 4 ? 1.4 : 0));
    const paths = data.agents.map(() => "");
    columns.forEach((day, d) => {
      let y = frame.strip;
      day.forEach((count, a) => {
        if (count === 0) return;
        const h = count * unit;
        y -= h;
        paths[a] += `M${f(d * dayW)} ${f(y)}h${f(barW)}v${f(h)}h${f(-barW)}z`;
      });
    });
    const win = windowOf(geometry);
    const x0 = win.first * dayW;
    const x1 = (win.first + win.held) * dayW;
    const moving = span === "month" && geometry === "xl";
    const dayAt = (e: PointerEvent<SVGSVGElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      return Math.max(
        0,
        Math.min(last, Math.floor(((e.clientX - box.left) / box.width) * data.days.length)),
      );
    };
    const moveTo = (d: number, offset: number) => {
      setTip(null);
      if (moving) setMonthIndex(monthOfDay(d));
      else setWeekStart(clampWeek(d - offset));
    };
    const onDown = (e: PointerEvent<SVGSVGElement>) => {
      const d = dayAt(e);
      const offset = moving ? 0 : d >= weekStart && d < weekStart + WEEK ? d - weekStart : 3;
      drag.current = offset;
      root.current?.setAttribute("data-scrub", "true");
      moveTo(d, offset);
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent<SVGSVGElement>) => {
      if (drag.current !== null) moveTo(dayAt(e), drag.current);
    };
    const onUp = () => {
      drag.current = null;
      root.current?.removeAttribute("data-scrub");
    };
    const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
      const by: Record<string, number> = moving
        ? { ArrowLeft: -1, ArrowRight: 1, PageUp: -1, PageDown: 1 }
        : { ArrowLeft: -1, ArrowRight: 1, PageUp: -WEEK, PageDown: WEEK };
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        setTip(null);
        if (moving) setMonthIndex(e.key === "Home" ? 0 : lastMonth);
        else setWeekStart(e.key === "Home" ? 0 : clampWeek(last));
        return;
      }
      const delta = by[e.key];
      if (delta === undefined) return;
      e.preventDefault();
      setTip(null);
      if (moving) setMonthIndex((i) => Math.max(0, Math.min(lastMonth, i + delta)));
      else setWeekStart((s) => clampWeek(s + delta));
    };
    const height = frame.strip + frame.stripAxis;
    return (
      <svg
        className="dld-lens-strip"
        viewBox={`0 0 ${frame.width} ${height}`}
        width={frame.width}
        height={height}
        role="slider"
        tabIndex={0}
        aria-label="The six months, a column per day: move the lens"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={moving ? lastMonth : last - WEEK + 1}
        aria-valuenow={moving ? monthIndex : weekStart}
        aria-valuetext={windowWords}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        {paths.map((d, a) => (d === "" ? null : <path key={a} d={d} style={{ fill: tone(a) }} />))}
        <rect className="dld-lens-shade" x={0} y={0} width={f(x0)} height={frame.strip} />
        <rect
          className="dld-lens-shade"
          x={f(x1)}
          y={0}
          width={f(Math.max(0, frame.width - x1))}
          height={frame.strip}
        />
        <rect
          className="dld-lens-window"
          x={f(x0 + 0.5)}
          y={0.5}
          width={f(Math.max(1, x1 - x0 - 1))}
          height={frame.strip - 1}
          rx={3}
        />
        {data.months.map((m) => (
          <g key={m.label} className="dld-lens-month">
            <line
              x1={f(m.first * dayW)}
              x2={f(m.first * dayW)}
              y1={frame.strip}
              y2={frame.strip + 6}
            />
            <text x={f(m.first * dayW + 4)} y={frame.strip + 17}>
              {m.label}
            </text>
          </g>
        ))}
      </svg>
    );
  };

  /* --- the keys ------------------------------------------------------------------- */

  const swatch = (content: ReactNode, side: number) => (
    <svg
      className="dld-lens-swatch"
      viewBox={`${-side / 2} ${-side / 2} ${side} ${side}`}
      width={side}
      height={side}
      aria-hidden="true"
      focusable="false"
    >
      {content}
    </svg>
  );
  const agentKeys = data.agents.map((agent, a) => {
    const hidden = hiddenAgents.has(a);
    return (
      <li key={agent.id}>
        <button
          type="button"
          className="dld-lens-key"
          aria-pressed={!hidden}
          onClick={() => {
            setTip(null);
            setHiddenAgents((s) => toggle(s, a));
            /* Hidden, an agent has nothing to lift; shown again under the pointer, they lift. */
            setLifted(hidden ? a : null);
          }}
          onPointerEnter={() => setLifted(hidden ? null : a)}
          onPointerLeave={() => setLifted(null)}
          onFocus={() => setLifted(hidden ? null : a)}
          onBlur={() => setLifted(null)}
        >
          {swatch(<AgentSphere a={a} r={7} />, 14)}
          <span>{agent.label}</span>
          <b>{agentCount(a)}</b>
        </button>
      </li>
    );
  });
  /* The sizes are no agent's, so their key is the same sphere in grey. */
  const outcomeKeys = data.outcomes.map((o, i) => {
    const side = Math.max(10, Math.round(o.diameter * 0.24));
    const hidden = hiddenOutcomes.has(i);
    return (
      <li key={o.id}>
        <button
          type="button"
          className="dld-lens-key"
          aria-pressed={!hidden}
          onClick={() => {
            setTip(null);
            setHiddenOutcomes((s) => toggle(s, i));
          }}
        >
          {swatch(
            <use
              href="#dld-sphere-neutral"
              transform={`scale(${(side / 2 / D_TINT_RADIUS).toFixed(4)})`}
            />,
            side,
          )}
          <span>{o.label}</span>
          <b>{outcomeCount(i)}</b>
        </button>
      </li>
    );
  });

  /* --- the tip's words -------------------------------------------------------------- */

  const tipMeeting = tip === null ? undefined : data.meetings[tip.m];
  const tipWords =
    tipMeeting === undefined
      ? null
      : {
          outcome: data.outcomes[tipMeeting.o]?.label ?? "",
          when: `${data.days[tipMeeting.d]?.weekday ?? ""} ${data.days[tipMeeting.d]?.label ?? ""} · ${tipMeeting.t}`,
          agent: data.agents[tipMeeting.a]?.label ?? "",
          units:
            tipMeeting.u.length === 0
              ? "Nothing shortlisted"
              : `Shortlisted ${tipMeeting.u.join(", ")}`,
        };

  return (
    <div
      className="dld-lens"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") setTip(null);
      }}
    >
      <div className="dld-lens-rail">
        <div className="dld-lens-step">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={atStart}
            aria-label={span === "month" ? "The month before" : "Seven days earlier"}
          >
            ‹
          </button>
          <p className="dld-lens-when">{windowWords}</p>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={atEnd}
            aria-label={span === "month" ? "The month after" : "Seven days later"}
          >
            ›
          </button>
        </div>
        <div className="dld-lens-span" role="group" aria-label="How much the lens shows">
          <button type="button" aria-pressed={span === "week"} onClick={() => chooseSpan("week")}>
            7 days
          </button>
          <button
            type="button"
            data-span="month"
            aria-pressed={span === "month"}
            onClick={() => chooseSpan("month")}
          >
            Month
          </button>
        </div>
        <p className="dld-lens-count">
          <b>{shown}</b> of {inView.length} in view
        </p>
      </div>

      <div className="dld-lens-keys">
        <ul aria-label="Agents: show or hide">{agentKeys}</ul>
        <ul aria-label="Outcomes: show or hide">{outcomeKeys}</ul>
      </div>

      <div className="dld-size" data-size="xl">
        {lens("xl")}
        {strip("xl")}
      </div>
      <div className="dld-size" data-size="l">
        {lens("l")}
        {strip("l")}
      </div>

      {tip === null || tipMeeting === undefined || tipWords === null ? null : (
        <div
          className="dld-lens-tip"
          data-held={tip.held ? "true" : undefined}
          style={{ left: `${tip.x}px`, top: `${tip.y}px` }}
          role="status"
        >
          <p className="dld-lens-tip-head">
            <i style={{ background: tone(tipMeeting.a) }} />
            {tipWords.outcome}
          </p>
          <p>{tipWords.when}</p>
          <p>{tipWords.agent}</p>
          <p>{tipWords.units}</p>
        </div>
      )}
    </div>
  );
}
