"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A CHANGE OF STATE IS SPOKEN (P2-ZARAS, 2026-10-03).
 *
 * A period, a filter, a view or a sort changes the URL and not the title, so
 * the App Router's own announcer, which reads the title, says nothing, and no
 * screen had a live region of its own: a reader who picked "Last 28 days"
 * heard nothing at all. This is one polite status region for the whole
 * project shell. After a change it says what the page now shows, in the
 * page's own words and no others: the heading, the kicker (project and
 * period), the selected tab or chip, and anything a page marks
 * `data-announce`, such as a register's "12 of 48 units".
 *
 * It waits for the page to settle, so a streamed screen is described once it
 * has arrived rather than mid-way. A plain first landing is left to the screen
 * reader, which reads the page itself; a first load that carries a state in
 * its address (a submitted filter) is described. The report is left out: its
 * words are trilingual product language, and this sentence would be new text
 * on it.
 */
export function StateAnnouncer() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [message, setMessage] = useState("");
  const landed = useRef(false);
  const report = /\/report$/.test(pathname);

  useEffect(() => {
    const first = !landed.current;
    landed.current = true;
    if (report || (first && search === "")) return;

    let last = "";
    let steady = 0;
    const timer = window.setInterval(() => {
      const busy =
        document.querySelector('main [aria-busy="true"]') !== null ||
        document.querySelector(".iris-load-band") !== null;
      const text = describe();
      if (busy || text === "" || text !== last) {
        last = text;
        steady = 0;
        return;
      }
      steady += 1;
      if (steady < 3) return;
      window.clearInterval(timer);
      /* Emptied first, so the same words after a second change are spoken again. */
      setMessage("");
      window.requestAnimationFrame(() => setMessage(text));
    }, 100);
    const stop = window.setTimeout(() => window.clearInterval(timer), 5000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [pathname, search, report]);

  if (report) return null;
  return (
    <p className="obs-sr" role="status" aria-live="polite" aria-atomic="true" data-announcer="">
      {message}
    </p>
  );
}

/** What the page now shows, in its own words. */
function describe(): string {
  const main = document.querySelector("main");
  if (main === null) return "";
  const parts: string[] = [];
  const add = (text: string | null | undefined) => {
    const words = (text ?? "").replace(/\s+/g, " ").trim();
    if (words.length > 0 && !parts.includes(words)) parts.push(words);
  };
  add(main.querySelector("h1")?.textContent);
  add(main.querySelector(".ox-kicker")?.textContent);
  for (const el of main.querySelectorAll(
    '[role="tab"][aria-selected="true"], [aria-current="true"], [data-announce]',
  )) {
    add(el.textContent);
  }
  return parts.join(". ");
}
