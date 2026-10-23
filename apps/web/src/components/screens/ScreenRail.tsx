"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";

import "./screens.css";

export interface Screen {
  readonly id: string;
  readonly label: string;
}

/**
 * WHERE YOU ARE ON A PAGE READ ONE SCREEN AT A TIME (the owner, 2026-10-22
 * and 2026-10-23; ADR-0059 for Sales Flow, ADR-0061 for the Sales Agents pages).
 *
 * The page is a sequence of screens moved through by scrolling. This is the
 * quiet way to know which one you are on and to go to another: a column of
 * dots, one per screen, each a link to it, the current one marked. The dots
 * are links rather than buttons because each goes to a place on the page.
 *
 * The current screen is the one under the middle of the viewport: an observer
 * whose root is shrunk to that one line, so a screen taller than the viewport
 * stays current for as long as it is the one being read. With no script the
 * dots still go where they say, and the first stays marked.
 *
 * A page that re-keys its screens on a choice (a period, a window) re-keys the
 * rail on the same choice: an observer left watching the replaced elements
 * marked one screen for every other (ADR-0059, review round 1).
 *
 * Its look and its place beside the screens are `screens.css`'s.
 */

/**
 * Where one turn of the wheel takes the reader: the index of the screen to
 * move to, or null to let the page scroll by itself. `tops` and `heights` are
 * each screen's place on the page in scroll coordinates (its top already less
 * the sticky chrome), `y` the scroll position, `view` the height under the
 * chrome. A screen taller than the view is read through first; before the
 * first screen and past the last the page scrolls as it always does.
 */
export function wheelTarget(
  y: number,
  view: number,
  tops: readonly number[],
  heights: readonly number[],
  direction: 1 | -1,
): number | null {
  let at = -1;
  for (let i = 0; i < tops.length; i += 1) if ((tops[i] ?? Infinity) <= y + 2) at = i;
  if (at === -1) return direction === 1 && tops.length > 0 ? 0 : null;
  const top = tops[at] ?? 0;
  const bottom = top + (heights[at] ?? 0);
  if (direction === 1 && y + view < bottom - 2) return null;
  if (direction === -1 && y > top + 2) return null;
  const next = at + direction;
  return next >= 0 && next < tops.length ? next : null;
}

/**
 * Where one press of Page Down, Page Up, Space or an arrow takes the reader:
 * the scroll position to go to, or null to leave the key to the browser. A
 * screen that fits goes to the next or the previous; a screen taller than the
 * view is read a view at a time and never past its own edge, either way: going
 * up, it is entered at its last view, not its top (review round 9).
 */
export function pageTarget(
  y: number,
  view: number,
  tops: readonly number[],
  heights: readonly number[],
  direction: 1 | -1,
): number | null {
  const next = wheelTarget(y, view, tops, heights, direction);
  if (next !== null) {
    const top = tops[next] ?? 0;
    return direction === -1 ? Math.max(top, top + (heights[next] ?? 0) - view) : top;
  }
  let at = -1;
  for (let i = 0; i < tops.length; i += 1) if ((tops[i] ?? Infinity) <= y + 2) at = i;
  if (at === -1) return null;
  const top = tops[at] ?? 0;
  const bottom = top + (heights[at] ?? 0);
  if (direction === 1 && y + view < bottom - 2) return Math.min(y + view, bottom - view);
  if (direction === -1 && y > top + 2) return Math.max(y - view, top);
  return null;
}

/** The keys that move a page, and which way. */
const PAGE_KEYS: Readonly<Record<string, 1 | -1>> = {
  PageDown: 1,
  PageUp: -1,
  ArrowDown: 1,
  ArrowUp: -1,
  " ": 1,
};

/** Can this element, or one it sits in, still scroll the way the wheel turns? */
function scrollsItself(start: EventTarget | null, direction: 1 | -1): boolean {
  for (
    let el = start instanceof Element ? start : null;
    el !== null && el !== document.body;
    el = el.parentElement
  ) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow !== "auto" && overflow !== "scroll") || el.scrollHeight <= el.clientHeight + 1)
      continue;
    if (direction === 1 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0)
      return true;
  }
  return false;
}

export function ScreenRail({
  screens,
  label,
}: {
  readonly screens: readonly Screen[];
  /** The rail's accessible name: "<page> screens". */
  readonly label: string;
}) {
  const [current, setCurrent] = useState(screens[0]?.id);
  const ids = screens.map((screen) => screen.id).join(" ");

  /*
   * ONE TURN OF THE WHEEL, ONE SCREEN (the owner, 2026-10-22: "switch between
   * the charts by scrolling"). CSS snapping could not do it: mandatory held the
   * page at its first screen and proximity pulled a short turn back to where it
   * started (measured on the demo build, 2026-10-23). Where the screens fit —
   * a desktop window — a turn goes to the next or the previous screen; the
   * rest of that gesture, a touchpad's momentum included, is swallowed until it
   * pauses. Everywhere else the page scrolls as it always does.
   *
   * Page Down, Page Up, Space and the arrows step the same way. Under reduced
   * motion the page does not snap (`screens.css`) and each key landed
   * mid-screen; with motion the snap pulled an arrow's 40px back to where it
   * started, so the arrows did not move the page at all (review round 8,
   * measured). Under reduced motion every step is instant.
   */
  useEffect(() => {
    const fits = matchMedia("(width >= 64rem) and (height >= 40rem)");
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let travel = 0;
    let quietAt = 0;
    let lastAt = 0;
    /* Each screen's place, in the scroll coordinates `wheelTarget` reads. */
    const measure = () => {
      const elements = ids
        .split(" ")
        .map((id) => document.getElementById(id))
        .filter((element): element is HTMLElement => element !== null);
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const y = window.scrollY;
      return {
        y,
        view: window.innerHeight - pad,
        tops: elements.map((element) => element.getBoundingClientRect().top + y - pad),
        heights: elements.map((element) => element.offsetHeight),
      };
    };
    const go = (top: number) =>
      window.scrollTo({ top, behavior: still.matches ? "instant" : "smooth" });
    const onKey = (event: KeyboardEvent) => {
      const direction = PAGE_KEYS[event.key];
      if (
        direction === undefined ||
        !fits.matches ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.body.style.overflow === "hidden"
      )
        return;
      /*
       * Only where the key would have scrolled the page: the page, a link, a
       * screen the rail focused, and for every key but Space (which presses
       * it) a button or a summary (review round 9). A field, an open menu, a
       * popover or a scrolling box keeps its own keys.
       */
      const target = event.target;
      const step = event.key === " " && event.shiftKey ? -1 : direction;
      const from =
        event.key === " "
          ? "a[href], [tabindex='-1']"
          : "a[href], button, summary, [tabindex='-1']";
      if (
        target instanceof Element &&
        target !== document.body &&
        target !== document.documentElement &&
        (!target.matches(from) ||
          target.closest(
            "[popover], [role='dialog'], dialog, .ox-menu[open], .irs-mobile-menu[open]",
          ) !== null ||
          scrollsItself(target, step))
      )
        return;
      const { y, view, tops, heights } = measure();
      const top = pageTarget(y, view, tops, heights, step);
      if (top === null) return;
      event.preventDefault();
      go(top);
    };
    const onWheel = (event: WheelEvent) => {
      if (!fits.matches || event.ctrlKey || event.deltaY === 0) return;
      /*
       * An open modal holds the page (`Dialog` takes the body's overflow, which
       * stops the wheel but not a script's scroll), and a popover or a dialog
       * under the pointer is not the page: the page behind stays where it is
       * (ADR-0061, review round).
       */
      if (
        document.body.style.overflow === "hidden" ||
        (event.target instanceof Element &&
          event.target.closest("[popover], [role='dialog'], dialog") !== null)
      )
        return;
      const direction = event.deltaY > 0 ? 1 : -1;
      if (scrollsItself(event.target, direction)) return;
      const { y, view, tops, heights } = measure();
      const target = wheelTarget(y, view, tops, heights, direction);
      if (target === null) return;
      event.preventDefault();
      const now = performance.now();
      if (now < quietAt) {
        quietAt = Math.max(quietAt, now + 220);
        return;
      }
      /* A turn begins after a pause: what an earlier turn left short does not carry over. */
      if (now - lastAt > 300) travel = 0;
      lastAt = now;
      const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      travel += Math.abs(event.deltaY) * lines;
      if (travel < 40) return;
      travel = 0;
      quietAt = now + 700;
      go(pageTarget(y, view, tops, heights, direction) ?? y);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [ids]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id);
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const id of ids.split(" ")) {
      const element = document.getElementById(id);
      if (element !== null) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ids]);

  /*
   * What a fragment link does, without the history entry it pushes: the App
   * Router ignores a popped entry it did not write, so Back after a dot and a
   * window pick left the 7-day figures under the default window's address. The
   * screen comes into view, the keyboard's starting point moves into it, and
   * the address is replaced with the router's own state carried over.
   */
  const go = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (target === null || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    target.scrollIntoView();
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    history.replaceState(history.state, "", `#${id}`);
  };

  return (
    <nav
      className="screen-rail"
      aria-label={label}
      style={{ "--screen-dots": screens.length } as CSSProperties}
    >
      <ol>
        {screens.map((screen) => (
          <li key={screen.id}>
            <a
              href={`#${screen.id}`}
              aria-label={screen.label}
              data-label={screen.label}
              aria-current={screen.id === current ? "location" : undefined}
              onClick={(event) => go(event, screen.id)}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}
