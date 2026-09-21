"use client";

/**
 * THE BROWSER'S OWN PRINT DIALOG, AND NOTHING THAT PRETENDS TO BE MORE.
 *
 * The roadmap's M4 asks for a real vector PDF; the generator that would write
 * one is not built, and `ReportGeneration.state` says so wherever the report
 * is offered. What exists today is this page, and every browser can print a
 * page to a PDF. This button opens that dialog. It does not claim to have
 * generated a document, it does not name a file, and when there is no window
 * to print from it renders nothing rather than a control that does nothing.
 */
export function PrintPage() {
  return (
    <button
      type="button"
      className="ox-btn"
      data-weight="quiet"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
    >
      Print or save as PDF
    </button>
  );
}
