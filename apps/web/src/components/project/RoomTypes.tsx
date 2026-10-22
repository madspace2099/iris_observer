"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { RoomType, RoomTypeTrend, RoomTypesView } from "@observer/readmodels";
import { InfoTip } from "@/components/iris/InfoTip";
import "./rooms.css";

/**
 * FLAT TYPES: STOCK, SALES AND INTEREST (ADR-0056).
 *
 * The owner's first block, in his order: how many flats of each room count,
 * how many of them sold, then how much interest each draws — all the types
 * in one chart, over a week, a month, a quarter, a half-year, a year or all
 * time. The read model computes every window at once, so the switch is a
 * state change in the browser: no request, no reload, and the figures change
 * in place. A live region says what the block now shows.
 *
 * Each type keeps one hue on its row and its line. The hues are the kit's
 * agent set from its second: the first is the kit's green, which on this
 * card means sold.
 */

const HUES = [2, 3, 4, 5, 6, 1] as const;

export function hueOf(index: number): string {
  return `var(--d-series-${HUES[index % HUES.length] ?? 2})`;
}

/** One flat per block while the blocks stay readable; one span per status past that. */
const BLOCKS_UP_TO = 80;

function Flats({ type, max }: { readonly type: RoomType; readonly max: number }) {
  const sold = type.sold ?? 0;
  const reserved = type.reserved ?? 0;
  const parts: readonly (readonly [string, number])[] =
    type.sold === null
      ? [["unknown", type.flats]]
      : [
          ["sold", sold],
          ["reserved", reserved],
          ["open", Math.max(0, type.flats - sold - reserved)],
        ];
  const blocks = max <= BLOCKS_UP_TO;
  return (
    <span
      className="pr-flats"
      data-blocks={blocks ? "true" : undefined}
      style={{ "--n": max } as CSSProperties}
      aria-hidden="true"
    >
      {blocks
        ? parts.flatMap(([kind, k]) =>
            Array.from({ length: k }, (_, i) => <i key={`${kind}-${String(i)}`} data-s={kind} />),
          )
        : parts.map(([kind, k]) =>
            k === 0 ? null : (
              <i key={kind} data-s={kind} style={{ gridColumn: `span ${String(k)}` }} />
            ),
          )}
    </span>
  );
}

export function RoomTypes({
  view,
  children,
}: {
  readonly view: RoomTypesView;
  /** The source line, at the card's foot. */
  readonly children?: ReactNode;
}) {
  const [windowId, setWindowId] = useState(view.defaultWindow);
  const [focus, setFocus] = useState<string | null>(null);
  const current = view.windows.find((w) => w.id === windowId) ?? view.windows[0];
  if (current === undefined) return null;
  const max = Math.max(1, ...view.types.map((t) => t.flats));

  return (
    <div className="d-card pr-rooms" data-focus={focus ?? undefined}>
      <header className="iris-titled">
        <h2 className="iris-kicker iris-kicker-measured">Flat types: stock, sales and interest</h2>
        <InfoTip id="room-types" label="flat types: stock, sales and interest">
          {view.definition}
        </InfoTip>
      </header>

      <div className="pr-windows" role="group" aria-label="Interest over">
        {view.windows.map((w) => (
          <button
            key={w.id}
            type="button"
            className="iris-chip"
            aria-pressed={w.id === current.id}
            onClick={() => setWindowId(w.id)}
          >
            {w.name}
          </button>
        ))}
      </div>

      <div className="pr-rooms-said" aria-live="polite">
        <p className="pr-rooms-set">{current.meetingsDisplay}</p>
        <p className="pr-rooms-reading">{current.reading}</p>
      </div>

      <div className="pr-rooms-body">
        <div className="pr-rows-field">
          <div className="pr-rows-head" aria-hidden="true">
            <span />
            <span>Flats · sold · reserved</span>
            <span>Meetings that opened one</span>
            <span>Change</span>
          </div>
          <ul className="pr-rows">
            {view.types.map((t, i) => {
              const s = current.shares.find((x) => x.id === t.id);
              return (
                <li
                  key={t.id}
                  data-type={t.id}
                  data-on={focus === t.id ? "true" : undefined}
                  style={{ "--pr-hue": hueOf(i) } as CSSProperties}
                  onPointerEnter={() => setFocus(t.id)}
                  onPointerLeave={() => setFocus(null)}
                >
                  {/* The counts the owner asked for first at the body size; their shares smaller. */}
                  <span className="pr-type">
                    <b>{t.label}</b>
                    <span className="pr-count">
                      {t.flatsDisplay}
                      <small> · {t.stockShareDisplay} of the stock</small>
                    </span>
                  </span>
                  <span className="pr-stock">
                    <Flats type={t} max={max} />
                    {t.soldDisplay === null ? (
                      <small>sold not known</small>
                    ) : (
                      <span className="pr-count">
                        {t.soldDisplay}
                        <small>
                          {` · ${t.soldShareDisplay ?? ""}`}
                          {t.reservedDisplay === null ? "" : ` · ${t.reservedDisplay}`}
                        </small>
                      </span>
                    )}
                  </span>
                  <span className="pr-interest">
                    <b>{s?.shareDisplay ?? "—"}</b>
                    <span className="pr-narrow"> of the meetings opened one</span>
                    <span className="pr-bar" aria-hidden="true">
                      <i style={{ width: `${String((s?.share ?? 0) * 100)}%` }} />
                    </span>
                  </span>
                  <span className="pr-change" data-direction={s?.change?.direction}>
                    {s?.change == null ? (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="iris-sr">no change shown</span>
                      </>
                    ) : (
                      s.change.display
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="pr-note">{current.changeAgainst}</p>
          {view.soldUnavailable === null ? null : <p className="pr-note">{view.soldUnavailable}</p>}
        </div>

        <div className="pr-lines-field">
          <p className="pr-lines-title">How interest moved</p>
          {current.trend.empty === null ? (
            <Lines trend={current.trend} types={view.types} focus={focus} label={current.label} />
          ) : (
            <p className="pr-lines-empty">{current.trend.empty}</p>
          )}
          <p className="pr-note">{current.trend.caption}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/* --- the line: every type over the window's stretches --------------------------- */

const HEIGHT = 196;
const PAD = { top: 12, right: 12, bottom: 26, left: 40 } as const;
/** A tick label's width in the drawing's units, 12px Manrope at about 7 a character. */
const TICK_CHAR = 7;

function Lines({
  trend,
  types,
  focus,
  label,
}: {
  readonly trend: RoomTypeTrend;
  readonly types: readonly RoomType[];
  readonly focus: string | null;
  readonly label: string;
}) {
  /*
   * Drawn at the width it is shown, so its 12px labels stay 12px at 1440 and
   * at 360 alike. The server renders a phone's width; the browser measures.
   */
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    const measure = () => setWidth(Math.max(240, Math.round(el.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const parts = trend.parts.length;
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + ((i + 0.5) / parts) * innerW;
  const y = (v: number) => PAD.top + (1 - v) * innerH;

  /*
   * Every label that fits, thinned from the latest stretch backwards, each
   * centred under its point unless that would run it past the frame.
   */
  const ticks: (readonly [number, number])[] = [];
  let edge = Infinity;
  for (let i = parts - 1; i >= 0; i--) {
    const w = (trend.parts[i]?.label.length ?? 0) * TICK_CHAR;
    const at = Math.min(Math.max(x(i), PAD.left + w / 2), width - w / 2 - 2);
    if (at + w / 2 + 8 > edge) continue;
    ticks.unshift([i, at]);
    edge = at - w / 2;
  }

  const name = (id: string) => types.find((t) => t.id === id)?.label ?? id;
  const summary = trend.series
    .map(
      (s) =>
        `${name(s.id)}: ${s.points.map((p, i) => `${trend.parts[i]?.label ?? ""} ${p ?? "not drawn"}`).join(", ")}`,
    )
    .join("; ");

  return (
    <div className="pr-lines" ref={box}>
      <svg
        viewBox={`0 0 ${String(width)} ${String(HEIGHT)}`}
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Share of meetings that opened each flat type, ${label.toLowerCase()}. ${summary}.`}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="pr-grid-line"
            />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="pr-tick">
              {`${String(t * 100)}%`}
            </text>
          </g>
        ))}
        {trend.series.map((s, k) => {
          /* A run of drawn stretches is a line; a stretch on its own is a point. */
          const runs: (readonly [number, number])[][] = [];
          s.values.forEach((v, i) => {
            if (v === null) return;
            const last = runs[runs.length - 1];
            const prev = last?.[last.length - 1];
            if (last !== undefined && prev !== undefined && prev[0] === i - 1) last.push([i, v]);
            else runs.push([[i, v]]);
          });
          const index = types.findIndex((t) => t.id === s.id);
          return (
            <g
              key={s.id}
              className="pr-line"
              data-on={focus === s.id ? "true" : undefined}
              style={{ "--pr-hue": hueOf(index < 0 ? k : index) } as CSSProperties}
            >
              {runs.map((run) =>
                run.length < 2 ? null : (
                  <polyline
                    key={run[0]?.[0]}
                    points={run.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
                  />
                ),
              )}
              {runs.flat().map(([i, v]) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={3}>
                  <title>{`${name(s.id)} · ${trend.parts[i]?.label ?? ""}: ${s.points[i] ?? ""}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {ticks.map(([i, at]) => (
          <text key={i} x={at} y={HEIGHT - 6} textAnchor="middle" className="pr-tick">
            {trend.parts[i]?.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
