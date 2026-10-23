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
 * figures stand from the first frame, each mark as it arrives (below);
 * `floors` raises a stacking plan from the ground floor up. Their frames are in
 * `draw-in.css`, beside this file; the mechanism above is unchanged for every
 * other kind.
 */
export type DrawKind = "sweep" | "turn" | "bloom" | "rise" | "grow" | "fill" | "floors";

/**
 * The marks `fill` grows, by the component that draws them: the plan's stock
 * bar and window (SalesPlan), a flat type's blocks, interest bar and lines
 * (RoomTypes), a reading's meters (RoomReadings), a comparison cell's bar
 * (RoomCompare), a ladder's and a funnel's fills, a table cell's bar and the
 * outcome mix's parts (ReportCharts), and a sale's track (IrisLedTimeline).
 * An SVG mark is its shapes, never the whole drawing, so an axis label or a
 * printed count stands while the shapes grow. `draw-in.css` names the same
 * list; a test holds the two together.
 */
export const FILL_MARKS = [
  ".iris-plan-stock",
  ".iris-plan-track > i",
  ".pr-flats",
  ".pr-bar > i",
  ".pr-lines .pr-line",
  ".pr-meter-track > i",
  '.pr-grid [role="cell"] > i',
  ".ox-stage-fill",
  ".ox-cell-bar",
  ".ox-mix .ox-mix-part",
  ".ir-led-track",
].join(", ");

/** The longest a mark that arrived with others waits for the ones above it. */
const CASCADE_MS = 560;

/**
 * Marks that arrive together start top to bottom, a millisecond a pixel below
 * the highest of them, none later than `CASCADE_MS`: rows 70px apart start
 * 70ms apart, a row's marks together, and a mark that arrives alone at once.
 */
export function cascade(tops: readonly number[]): number[] {
  const first = Math.min(...tops);
  return tops.map((top) => Math.min(CASCADE_MS, Math.round(top - first)));
}

/**
 * `fill`, mark by mark (ADR-0062, review round 1). A block whose marks all
 * started when the block arrived played most of a tall one below the fold:
 * IRIS-led's timeline is two views on a desktop and nearly three on a phone.
 * So each mark is flagged `wait` and observed itself: a fill mark waits
 * transparent rather than clipped, which an observer still sees (the sweep's
 * clip hid it from its own) and which keeps every link in it in the reading
 * order. Observing a mark's row instead started a sale's track while it was
 * still 70px below the fold on a phone, its row's head above it in view. The
 * block's own frame lets go at once (`run`), so a mark drawn after this ran
 * (another window's line) is never left waiting; each flagged mark plays once
 * and keeps nothing of its entry at rest (`draw-in.css`).
 */
function fillEach(block: HTMLElement): () => void {
  const marks = block.querySelectorAll<HTMLElement | SVGElement>(FILL_MARKS);
  for (const mark of marks) mark.dataset.fill = "wait";
  block.dataset.draw = "run";
  const observer = new IntersectionObserver(
    (entries) => {
      const come = entries.filter((entry) => arrived(entry, window.innerHeight));
      const delays = cascade(come.map((entry) => entry.boundingClientRect.top));
      come.forEach((entry, i) => {
        observer.unobserve(entry.target);
        const mark = entry.target as HTMLElement | SVGElement;
        mark.style.animationDelay = `${String(delays[i] ?? 0)}ms`;
        mark.dataset.fill = "run";
      });
    },
    { threshold: STEPS },
  );
  for (const mark of marks) observer.observe(mark);
  return () => observer.disconnect();
}

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
    if (kind === "fill") return fillEach(element);
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
  }, [kind]);

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
