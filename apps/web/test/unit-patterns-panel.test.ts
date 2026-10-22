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
    /* What the sales lines cannot say stands in print beside them, not behind an `i`. */
    const salesNote = view.salesNote ?? "";
    expect(salesNote).toMatch(/demonstration CRM/);
    expect(html.indexOf(salesNote)).toBeGreaterThan(html.indexOf(sale));
    /* A text section on an ox- page: the page's own section head, and no chart card. */
    expect(html).toContain('<h2 class="ox-section-title">What the most-opened flats share</h2>');
    expect(html).not.toContain("d-card");
    for (const flat of view.top) {
      expect(html).toContain(`href="${flat.href}?period=last_28_days"`);
    }
  });
});
