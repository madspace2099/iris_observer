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
 * `auto` is the export dialog's "PDF document" (ADR-0045): the dialog opens
 * the report it composed in a new tab with `?print=1`, and the page asks for
 * the print dialog once, after the document and its fonts have loaded, so the
 * PDF is not taken from a half-drawn page in a fallback face. Without that
 * parameter nothing prints by itself.
 */
export function PrintPage({
  label = "Print or save as PDF",
  auto = false,
}: {
  /** The words on the button: the report passes its own language's. */
  readonly label?: string;
  /** Open the print dialog once the page is ready: the address asked for `print=1`. */
  readonly auto?: boolean;
} = {}) {
  useEffect(() => {
    if (!auto) return;
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
        if (!cancelled) window.print();
      });
    /* A remount (Strict Mode, a fast refresh) must not print twice. */
    return () => {
      cancelled = true;
    };
  }, [auto]);

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
