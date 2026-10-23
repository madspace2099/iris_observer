import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";

import { UnitPatterns } from "@/components/units/UnitPatterns";

/**
 * THE UNITS PAGE'S PANEL PRINTS THE READ MODEL'S SENTENCES (ADR-0051): the
 * patterns before the sales, the flats as links that keep the reader's period.
 */
describe("What the most-opened flats share, on Units", () => {
  it("prints the patterns, then the sales, then the flats, each a link in the period", async () => {
    const view = await new SyntheticObserverRepository().getUnitAttentionPatterns({
      viewer: VIEWERS.developerShark,
      tenantSlug: "shark",
      projectSlug: "shark-residence",
      period: "last_28_days",
      language: DEFAULT_LANGUAGE,
    });
    const html = renderToStaticMarkup(
      createElement(UnitPatterns, { view, period: "last_28_days" }),
    );

    const first = view.patterns[0]?.statement ?? "";
    const sale = view.conversion[0] ?? "";
    expect(first).not.toBe("");
    expect(html.indexOf(first)).toBeGreaterThan(-1);
    expect(html.indexOf(sale)).toBeGreaterThan(html.indexOf(first));
    /*
     * What the lines cannot say — the method, the demonstration CRM — stands
     * behind the title's `i` (Máté's video review, 2026-10-23), and never in
     * place of a line: the lines stay in view.
     */
    const salesNote = view.salesNote ?? "";
    expect(salesNote).toMatch(/demonstration CRM/);
    const from = html.indexOf('id="info-most-opened"');
    expect(from).toBeGreaterThan(-1);
    /* The panel holds paragraphs only, so its first closing div is its own. */
    const panel = html.slice(from, html.indexOf("</div>", from));
    expect(panel.indexOf(salesNote)).toBeGreaterThan(-1);
    expect(panel.indexOf(view.caveats[0] ?? "?")).toBeGreaterThan(-1);
    expect(panel).not.toContain(first);
    expect(panel).not.toContain(sale);
    /* A text section on an ox- page: the page's own section head, and no chart card. */
    expect(html).toContain('<h2 class="ox-section-title">What the most-opened flats share</h2>');
    expect(html).not.toContain("d-card");
    for (const flat of view.top) {
      expect(html).toContain(`href="${flat.href}?period=last_28_days"`);
    }
  });
});
