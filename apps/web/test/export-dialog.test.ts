import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";

/* The portal mounts only in a browser; here the panel renders in place, open or not. */
vi.mock("../src/components/product/Dialog", () => ({
  Dialog: ({ children }: { children: unknown }) => children,
}));

const { ExportReport, exportAddresses } = await import("../src/components/report/ExportReport");

/**
 * THE EXPORT DIALOG GENERATES DOCUMENTS (ADR-0045).
 *
 * The owner, 2026-10-20: "the Generate document button is locked". It was an
 * `aria-disabled` button with no handler. Every format is now an address —
 * the page, the page asking to be printed, the CSV route — composed from the
 * scope and period the caller passed and the language and sections chosen in
 * the dialog. Every expected address is written out here.
 */

describe("the dialog's buttons take the address it composed", () => {
  const PAGE = "/alpha/ister-tower/report?agent=agt_luciahorvath";

  it("composes the page, the print request and the CSV route from one address", () => {
    expect(exportAddresses(PAGE, "hu", ["agent-units"])).toEqual({
      page: "/alpha/ister-tower/report?agent=agt_luciahorvath&lang=hu&omit=agent-units",
      pdf: "/alpha/ister-tower/report?agent=agt_luciahorvath&lang=hu&omit=agent-units&print=1",
      csv: "/alpha/ister-tower/report/csv?agent=agt_luciahorvath&lang=hu&omit=agent-units",
    });
    expect(exportAddresses("/alpha/northgate/report?period=year_to_date", "en", [])).toEqual({
      page: "/alpha/northgate/report?period=year_to_date",
      pdf: "/alpha/northgate/report?period=year_to_date&print=1",
      csv: "/alpha/northgate/report/csv?period=year_to_date",
    });
  });

  it("opens on the PDF, and its Generate document is a live link, not a locked button", async () => {
    const report = await new SyntheticObserverRepository().getReportScope({
      viewer: VIEWERS.developer as Viewer,
      tenantSlug: "alpha",
      projectSlug: "northgate",
      period: "quarter_to_date",
      language: "en",
    });
    const html = renderToStaticMarkup(
      createElement(ExportReport, { report, pageHref: "/alpha/northgate/report", language: "en" }),
    );
    expect(html).toMatch(
      /<a [^>]*href="\/alpha\/northgate\/report\?print=1"[^>]*target="_blank"[^>]*>Generate document<\/a>/,
    );
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain("Preview-ready");
    expect(html).not.toContain("scheduled for M4");
    expect(html).toContain("Available now");
    expect(html).toContain("Save as PDF");
    /* The footer says what the button does; the milestone plan is the ADR's, not the screen's. */
    expect(html).not.toContain(report.generation.milestone);
    expect(html).not.toContain("docs/roadmap.md");
    expect(html).not.toContain("leaves the room");
  });
});
