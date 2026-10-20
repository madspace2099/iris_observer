"use client";

import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { dynamicRoute } from "@/lib/href";

/**
 * THE INSTRUMENT POWERING UP — FOUR AND A HALF SECONDS, THEN ASK IRIS.
 *
 * Everything that moves is CSS and SVG (`ask-iris.css`, section 12): the rings
 * draw themselves, one turns against the other, the wordmark resolves, and the
 * status lines type in a monospace column, each ticked when it is done. This
 * component does three things only: it times the hand-over, it hands over on
 * Enter or Escape, and it gives every line its own start and length so the
 * typing follows the words rather than a fixed beat.
 *
 * Every line is a sentence the server composed from the repository
 * (`lib/welcome.ts`); nothing here invents a figure. Under reduced motion the
 * lines stand complete from the first frame, long enough to be read, and fade
 * out before the hand-over: a 400ms frame was a full-screen flash, not a
 * welcome. The Skip link is a real link to the same destination, so it works
 * before this script has even loaded.
 *
 * `hold` keeps the reader here: no timer and no Enter or Escape, because a
 * dialog over the sequence (the company key, ADR-0043) owns those keys, and
 * Enter in its field would otherwise hand over with the key unsaved.
 */

/** When the hand-over happens, after the rings have begun to contract. */
const HAND_OVER_MS = 4200;
/** The finished frame, held; `ask-iris.css` fades it out over its last 300ms. */
const HAND_OVER_REDUCED_MS = 1500;

/** The typing schedule: lines start half a second apart from 0.8s. */
const FIRST_LINE_S = 0.8;
const LINE_GAP_S = 0.5;
const SECONDS_PER_CHARACTER = 0.014;

const RING = 2 * Math.PI;

export function WelcomeSequence({
  to,
  lines,
  heading,
  hold = false,
}: {
  /** Already validated on the server: an internal path this reader may open. */
  readonly to: string;
  readonly lines: readonly string[];
  readonly heading: string;
  /** Stay on the finished frame: no hand-over timer, no Enter or Escape. */
  readonly hold?: boolean;
}) {
  const router = useRouter();
  const gone = useRef(false);

  const handOver = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    router.replace(dynamicRoute(to));
  }, [router, to]);

  useEffect(() => {
    router.prefetch(dynamicRoute(to));
    if (hold) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(handOver, reduced ? HAND_OVER_REDUCED_MS : HAND_OVER_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      handOver();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [handOver, hold, router, to]);

  return (
    <main className="welcome" id="main" tabIndex={-1} data-hold={hold ? "true" : undefined}>
      <h1 className="ask-sr">{heading}</h1>

      <div className="welcome-stage">
        <div className="welcome-instrument" aria-hidden="true">
          <svg className="welcome-rings" viewBox="-260 -260 520 520">
            <g className="welcome-grid">
              {Array.from({ length: 24 }, (_, i) => {
                const a = (i / 24) * RING;
                return (
                  <line
                    key={i}
                    x1={Math.cos(a) * 70}
                    y1={Math.sin(a) * 70}
                    x2={Math.cos(a) * 252}
                    y2={Math.sin(a) * 252}
                  />
                );
              })}
              <circle r="118" />
              <circle r="196" />
            </g>

            <circle className="welcome-ring" data-ring="outer" r="248" pathLength={1} />
            <g className="welcome-turn" data-turn="slow">
              <circle className="welcome-ticks" r="226" pathLength={360} />
              <circle className="welcome-ticks" data-major="" r="226" pathLength={360} />
            </g>
            <g className="welcome-turn" data-turn="counter">
              <circle className="welcome-arc" r="178" pathLength={360} />
            </g>
            <circle className="welcome-ring" data-ring="inner" r="140" pathLength={1} />
            <g className="welcome-cardinals">
              {[0, 90, 180, 270].map((deg) => (
                <line key={deg} x1="0" y1="-104" x2="0" y2="-94" transform={`rotate(${deg})`} />
              ))}
            </g>
          </svg>

          {/* The shell's own wordmark, the one asset every other screen wears. */}
          <img className="welcome-mark" src="/brand/iris-wordmark.svg" alt="" />
        </div>

        <ol className="welcome-lines" aria-label="Starting Ask IRIS">
          {lines.map((line, index) => {
            const start = FIRST_LINE_S + index * LINE_GAP_S;
            const length = Math.min(0.55, Math.max(0.22, line.length * SECONDS_PER_CHARACTER));
            const style = {
              "--chars": line.length,
              "--start": `${start}s`,
              "--length": `${length}s`,
              "--done": `${start + length + 0.06}s`,
            } as CSSProperties;
            return (
              <li key={line} className="welcome-line" style={style}>
                <span className="welcome-check" aria-hidden="true">
                  <svg viewBox="0 0 12 12" width="12" height="12">
                    <path d="M2.5 6.4 5 8.8 9.6 3.6" />
                  </svg>
                </span>
                <span className="welcome-text">{line}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <Link className="welcome-skip" href={dynamicRoute(to)} replace>
        Skip <kbd>Esc</kbd>
      </Link>
    </main>
  );
}
