"use client";

import { useEffect, useRef, type ReactNode } from "react";
import "./draw-in.css";

/**
 * THE DATA DRAWS IN, ONCE.
 *
 * A drawing waits in its first frame until it is on screen, then plays its
 * entry once and never again. Above the fold that is on load; below it, when
 * the reader scrolls to it, which is what `IntersectionObserver` is for. There
 * is no second play: the observer disconnects after the first intersection, and
 * the attribute it writes is never written back.
 *
 * ## Why the attribute is written on the element rather than held in state
 *
 * Nothing re-renders. The component keeps no state, so React never reconciles
 * `data-draw` after hydration, and the one write below is the only one there is.
 * A state update in an effect would have rendered the tree a second time to
 * change a single attribute.
 *
 * ## Who never waits
 *
 * A reader who asked for reduced motion gets the final frame at once — here,
 * and again in the stylesheet, which does not hide anything under that
 * preference in the first place. A browser without script never hides anything
 * either: the waiting frame is declared under `@media (scripting: enabled)`, so
 * without this component running there is no frame to wait in.
 *
 * ## At rest, nothing of the entry stays
 *
 * Once the longest entry has had time to play, the attribute becomes `done`
 * and every rule the entry needed lets go. That matters for the turn: its conic
 * mask clips to the drawing's box, and left in place at rest it cut the ring's
 * glow off in a square.
 *
 * ## Two more kinds (ADR-0062)
 *
 * `fill` grows the marks inside a block from their start while its words and
 * figures stand from the first frame; `floors` raises a stacking plan from the
 * ground floor up. Their frames are in `draw-in.css`, beside this file; the
 * mechanism above is unchanged.
 */
export type DrawKind = "sweep" | "turn" | "bloom" | "rise" | "grow" | "fill" | "floors";

/** The longest entry, the turn's 1200ms, with room to finish; the heat cells end by 1000ms. */
const PLAY_MS = 1500;

/** The thresholds a drawing is looked at on its way in: enough steps to catch a tall one. */
const STEPS = [0, 0.05, 0.1, 0.2];

/**
 * Whether a drawing has arrived: a fifth of it is in view, as it always was —
 * or, added for the tall ones (ADR-0062), a fifth of the view is it. A drawing
 * taller than five views never showed a fifth of itself and would never have
 * played, and one two views tall waited, marks hidden, with nearly half the
 * view of it already on screen (IRIS-led's timeline on a phone). The ratio is
 * read with a hair of tolerance: the entry at the 0.2 step can report 0.1999.
 */
export function arrived(
  entry: Pick<
    IntersectionObserverEntry,
    "isIntersecting" | "intersectionRatio" | "intersectionRect" | "rootBounds"
  >,
  viewHeight: number,
): boolean {
  if (!entry.isIntersecting) return false;
  const view = entry.rootBounds?.height ?? viewHeight;
  return entry.intersectionRatio >= 0.199 || entry.intersectionRect.height >= 0.2 * view;
}

export function DrawIn({
  kind,
  children,
}: {
  readonly kind: DrawKind;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.dataset.draw = "done";
      return;
    }
    let rest: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => arrived(entry, window.innerHeight))) return;
        element.dataset.draw = "run";
        observer.disconnect();
        rest = window.setTimeout(() => {
          element.dataset.draw = "done";
        }, PLAY_MS);
      },
      { threshold: STEPS },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(rest);
    };
  }, []);

  /*
   * Two elements, because the observed one must never be the clipped one: the
   * sweep's waiting frame is a `clip-path` of no width, and Chrome counts a
   * target's own clip when it decides whether the target intersects — so a
   * sweep observing itself never saw itself arrive, and never played.
   */
  return (
    <div ref={ref} className="dld-draw" data-draw="wait" data-kind={kind}>
      <div className="dld-draw-body">{children}</div>
    </div>
  );
}
