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
import { D_SPHERE_FLAT, D_SPHERE_RADIUS, D_TINT_RADIUS } from "./defs";

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
 * ## Two versions, one machine
 *
 *   outcomes   a row per agent, the kit's sphere for each outcome: colour and
 *              size both say how the meeting ended
 *   agents     one canvas, a colour per agent, a size per outcome: every
 *              agent's meetings of a day rest together in one pile
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

type Version = "outcomes" | "agents";
type Span = "week" | "month";
type Geometry = "xl" | "l";

interface Frame {
  readonly width: number;
  /** The agents' names, left of the rows, in the outcome version. */
  readonly label: number;
  /** One agent's row, in the outcome version. */
  readonly row: number;
  /** The one canvas, in the agent version. */
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
  xl: {
    width: 1240,
    label: 150,
    row: 150,
    canvas: 440,
    pad: 10,
    axis: 40,
    strip: 64,
    stripAxis: 22,
  },
  l: { width: 327, label: 64, row: 92, canvas: 300, pad: 6, axis: 34, strip: 44, stripAxis: 20 },
};

/** The floor a pile rests on, above the row's or the canvas's lower edge. */
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
 * how tall that pile then stands, which is how tall the row or the canvas is.
 */
function scaleFor(
  cells: ReadonlyMap<number, readonly number[]>,
  data: DBubbleLens,
  rowPerAgent: boolean,
  geometry: Geometry,
  columns: number,
): Fit {
  const frame = FRAMES[geometry];
  const column = (frame.width - (rowPerAgent ? frame.label : 0)) / columns;
  const room = (rowPerAgent ? frame.row : frame.canvas) - FLOOR - frame.pad;
  const most = Math.min(1, (column - 4) / (data.outcomes[0]?.diameter ?? 100));
  const tallest = (scale: number) => {
    let h = 0;
    for (const cell of cells.values()) {
      h = Math.max(
        h,
        heightOf(
          pile(
            cell.map((m) => ({ m, r: radius(data, m, scale) })),
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

export function BubbleLens({
  data,
  version,
}: {
  readonly data: DBubbleLens;
  readonly version: Version;
}) {
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

  const rowPerAgent = version === "outcomes";

  /*
   * Which pile each meeting rests in, in the order it is laid: the largest
   * first, then (on the shared canvas) agent by agent, then by the clock.
   */
  const cells = useMemo(() => {
    const out = new Map<number, number[]>();
    data.meetings.forEach((m, i) => {
      const key = rowPerAgent ? m.a * data.days.length + m.d : m.d;
      const cell = out.get(key);
      if (cell === undefined) out.set(key, [i]);
      else cell.push(i);
    });
    const order = (a: DLensMeeting, b: DLensMeeting) =>
      a.o - b.o || (rowPerAgent ? 0 : a.a - b.a) || a.t.localeCompare(b.t);
    for (const cell of out.values()) {
      cell.sort((i, j) => {
        const a = data.meetings[i];
        const b = data.meetings[j];
        return a === undefined || b === undefined ? 0 : order(a, b);
      });
    }
    return out;
  }, [data, rowPerAgent]);

  const monthSpanWidest = Math.max(...data.months.map((m) => m.length));
  const wantsMonth = span === "month";
  const xlWeek = useMemo(
    () => scaleFor(cells, data, rowPerAgent, "xl", WEEK),
    [cells, data, rowPerAgent],
  );
  const lWeek = useMemo(
    () => scaleFor(cells, data, rowPerAgent, "l", WEEK),
    [cells, data, rowPerAgent],
  );
  const xlMonth = useMemo(
    () => (wantsMonth ? scaleFor(cells, data, rowPerAgent, "xl", monthSpanWidest) : null),
    [cells, data, rowPerAgent, wantsMonth, monthSpanWidest],
  );
  const radiusOf = (m: number, scale: number) => radius(data, m, scale);

  const shows = (m: DLensMeeting) =>
    !hiddenOutcomes.has(m.o) && !(rowPerAgent === false && hiddenAgents.has(m.a));

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
    inView.filter((m) => m.o === o && !(rowPerAgent === false && hiddenAgents.has(m.a))).length;
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

  const sphereOf = (m: DLensMeeting, r: number): ReactNode => {
    if (rowPerAgent) {
      const id = data.outcomes[m.o]?.id ?? "";
      return (
        <use
          href={`#dld-sphere-${id}`}
          transform={`scale(${(r / (D_SPHERE_RADIUS[id] ?? r)).toFixed(4)})`}
        />
      );
    }
    return (
      <use
        href={`#dld-sphere-agent-${(m.a % 6) + 1}`}
        transform={`scale(${(r / D_TINT_RADIUS).toFixed(4)})`}
      />
    );
  };

  const lens = (geometry: Geometry) => {
    const frame = FRAMES[geometry];
    const win = windowOf(geometry);
    const fit = geometry === "l" ? lWeek : span === "month" ? (xlMonth ?? xlWeek) : xlWeek;
    const scale = fit.scale;
    /* A row, or the canvas, as tall as the fullest pile of the six months at this scale, and no taller. */
    const band = Math.ceil(fit.tallest) + FLOOR + frame.pad;
    const left = rowPerAgent ? frame.label : 0;
    const column = (frame.width - left) / win.columns;
    const body = rowPerAgent ? data.agents.length * band : band;
    const height = body + frame.axis;
    const floorOf = (a: number) => (rowPerAgent ? (a + 1) * band : band) - FLOOR;

    const placed: { m: number; x: number; y: number; r: number; a: number }[] = [];
    for (let c = 0; c < win.held; c += 1) {
      const d = win.first + c;
      const cx = left + (c + 0.5) * column;
      const rows = rowPerAgent ? data.agents.map((_, a) => a) : [0];
      for (const a of rows) {
        const cell = cells.get(rowPerAgent ? a * data.days.length + d : d) ?? [];
        const drawn = cell.filter((m) => {
          const meeting = data.meetings[m];
          return meeting !== undefined && shows(meeting);
        });
        for (const p of pile(
          drawn.map((m) => ({ m, r: radiusOf(m, scale) })),
          column / 2,
        )) {
          placed.push({
            m: p.m,
            x: cx + p.x,
            y: floorOf(a) - p.y,
            r: p.r,
            a: data.meetings[p.m]?.a ?? 0,
          });
        }
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
          const d = win.first + c;
          const x = left + c * column;
          const day = c < win.held ? data.days[d] : undefined;
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
            <rect x={f(left + win.held * column)} y={0} width={f(future * column)} height={body} />
            <text x={f(left + (win.held + future / 2) * column)} y={body / 2}>
              to come
            </text>
          </g>
        )}
        {rowPerAgent ? (
          data.agents.map((agent, a) => (
            <g key={agent.id}>
              <line
                className="dld-lens-floor"
                x1={left}
                x2={frame.width}
                y1={floorOf(a)}
                y2={floorOf(a)}
              />
              <text className="dld-lens-row" x={left - 12} y={floorOf(a) - 6}>
                {geometry === "l" ? agent.short : agent.label}
              </text>
            </g>
          ))
        ) : (
          <line
            className="dld-lens-floor"
            x1={0}
            x2={frame.width}
            y1={floorOf(0)}
            y2={floorOf(0)}
          />
        )}
        {placed.map((p) => {
          const meeting = data.meetings[p.m];
          if (meeting === undefined) return null;
          const dim = lifted !== null && p.a !== lifted;
          return (
            <g
              key={p.m}
              className="dld-lens-bubble"
              data-m={p.m}
              data-held={tip?.held === true && tip.m === p.m ? "true" : undefined}
              style={{ transform: `translate(${f(p.x)}px, ${f(p.y)}px)`, opacity: dim ? 0.14 : 1 }}
            >
              {sphereOf(meeting, p.r)}
              <circle className="dld-lens-ring" r={f(p.r + 3)} />
            </g>
          );
        })}
      </svg>
    );
  };

  /* --- the strip: the six months, and the lens on them ----------------------------- */

  const groups = rowPerAgent ? data.outcomes.length : data.agents.length;
  const toneOf = (g: number) =>
    rowPerAgent
      ? (D_SPHERE_FLAT[data.outcomes[g]?.id ?? ""] ?? "currentColor")
      : `var(--d-series-${(g % 6) + 1})`;
  const perDay = useMemo(() => {
    const out = Array.from({ length: data.days.length }, () => new Array<number>(groups).fill(0));
    for (const m of data.meetings) {
      const row = out[m.d];
      if (row !== undefined) row[rowPerAgent ? m.o : m.a] = (row[rowPerAgent ? m.o : m.a] ?? 0) + 1;
    }
    return out;
  }, [data, rowPerAgent, groups]);
  const fullest = Math.max(1, ...perDay.map((row) => row.reduce((a, b) => a + b, 0)));

  const strip = (geometry: Geometry) => {
    const frame = FRAMES[geometry];
    const dayW = frame.width / data.days.length;
    const unit = frame.strip / fullest;
    const barW = Math.max(1, dayW - (dayW > 4 ? 1.4 : 0));
    const paths = Array.from({ length: groups }, () => "");
    perDay.forEach((row, d) => {
      let y = frame.strip;
      for (let g = 0; g < groups; g += 1) {
        const hidden = rowPerAgent ? hiddenOutcomes.has(g) : hiddenAgents.has(g);
        const count = hidden ? 0 : (row[g] ?? 0);
        if (count === 0) continue;
        const h = count * unit;
        y -= h;
        paths[g] += `M${f(d * dayW)} ${f(y)}h${f(barW)}v${f(h)}h${f(-barW)}z`;
      }
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
        {paths.map((d, g) =>
          d === "" ? null : <path key={g} d={d} style={{ fill: toneOf(g) }} />,
        )}
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
  const outcomeKeys = data.outcomes.map((o, i) => {
    const side = Math.max(10, Math.round(o.diameter * (rowPerAgent ? 0.3 : 0.24)));
    const r = side / 2;
    const sphere = rowPerAgent ? (
      <use
        href={`#dld-sphere-${o.id}`}
        transform={`scale(${(r / (D_SPHERE_RADIUS[o.id] ?? r)).toFixed(4)})`}
      />
    ) : (
      <use href="#dld-sphere-neutral" transform={`scale(${(r / D_TINT_RADIUS).toFixed(4)})`} />
    );
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
          {swatch(sphere, side)}
          <span>{o.label}</span>
          <b>{outcomeCount(i)}</b>
        </button>
      </li>
    );
  });
  const agentKeys = rowPerAgent
    ? null
    : data.agents.map((agent, a) => {
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
              {swatch(
                <use
                  href={`#dld-sphere-agent-${(a % 6) + 1}`}
                  transform={`scale(${(7 / D_TINT_RADIUS).toFixed(4)})`}
                />,
                14,
              )}
              <span>{agent.label}</span>
              <b>{agentCount(a)}</b>
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
          tone: rowPerAgent
            ? (D_SPHERE_FLAT[data.outcomes[tipMeeting.o]?.id ?? ""] ?? "currentColor")
            : `var(--d-series-${(tipMeeting.a % 6) + 1})`,
        };

  return (
    <div
      className="dld-lens"
      data-version={version}
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
        {agentKeys === null ? null : <ul aria-label="Agents: show or hide">{agentKeys}</ul>}
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

      {tip === null || tipWords === null ? null : (
        <div
          className="dld-lens-tip"
          data-held={tip.held ? "true" : undefined}
          style={{ left: `${tip.x}px`, top: `${tip.y}px` }}
          role="status"
        >
          <p className="dld-lens-tip-head">
            <i style={{ background: tipWords.tone }} />
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
