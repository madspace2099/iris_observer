"use client";

import { useEffect } from "react";

/**
 * THE BROWSER'S OWN PRINT DIALOG, AND NOTHING THAT PRETENDS TO BE MORE.
 *
 * Every browser prints a page to a PDF, and the report is a page. This button
 * opens that dialog. It does not claim to have generated a document and it
 * does not name a file: the browser's dialog offers "Save as PDF", and the
 * print stylesheet puts the page on paper (ADR-0042).
 *
 * The export dialog's "PDF document" (ADR-0045) opens the report it composed
 * in a new tab with `?print=1`, and the page asks for the print dialog once,
 * after the document and its fonts have loaded, so the PDF is not taken from
 * a half-drawn page in a fallback face. It then takes the parameter off the
 * address so a reload does not ask again.
 *
 * The request is read from the address the browser holds when this mounts,
 * not from a prop the server rendered: the router keeps a page's rendered
 * tree for back and forward, so a server-side "print" would come back with
 * the page after the reader had left it and print a second time, while the
 * address it returns to no longer carries the parameter.
 */
export function PrintPage({
  label = "Print or save as PDF",
}: {
  /** The words on the button: the report passes its own language's. */
  readonly label?: string;
} = {}) {
  useEffect(() => {
    if (new URL(window.location.href).searchParams.get("print") !== "1") return;
    let cancelled = false;
    const loaded =
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            window.addEventListener("load", () => resolve(), { once: true });
          });
    void loaded
      .then(() => document.fonts.ready)
      .then(() => {
        if (cancelled) return;
        /* Asked once: a reload, a period change or a return to this page must not print again. */
        const url = new URL(window.location.href);
        url.searchParams.delete("print");
        window.history.replaceState(window.history.state, "", url.toString());
        window.print();
      });
    /* A remount (Strict Mode, a fast refresh) must not print twice. */
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <button
      type="button"
      className="ox-btn"
      data-weight="quiet"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
    >
      {label}
    </button>
  );
}
