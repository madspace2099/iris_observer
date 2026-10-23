import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InfoTip, InfoTipLanguage } from "@/components/iris/InfoTip";

/**
 * SALES FLOW'S EXPLANATIONS STAND BEHIND AN `i` (the owner, 2026-10-20).
 *
 * The explanation must still be in the page a server sends, so a reader with no
 * script can open it: the native popover does that, and only if the button
 * names the panel the markup actually carries.
 */
const html = renderToStaticMarkup(
  createElement(InfoTip, {
    id: "deal-ladder",
    label: "the deal ladder",
    children: "A rung counts the deals at that stage or further along.",
  }),
);

describe("InfoTip", () => {
  it("names its button after what it explains", () => {
    expect(html).toMatch(/<button[^>]*aria-label="About the deal ladder"/);
    expect(html).toMatch(/<button[^>]*type="button"/);
  });

  it("opens, without script, the one panel it names", () => {
    // React writes `popoverTarget`; an HTML attribute's name is read without case.
    expect(html).toMatch(/<button[^>]*popovertarget="info-deal-ladder"/i);
    expect(html).toMatch(/<div[^>]*id="info-deal-ladder"[^>]*popover="auto"/);
    expect(html.match(/id="info-deal-ladder"/g)).toHaveLength(1);
  });

  it("wears Measure's mark, so a card that carries both shows one `i`", () => {
    expect(html).toMatch(
      /<button[^>]*><span class="iris-measure-dot" aria-hidden="true">i<\/span>/,
    );
  });

  it("carries the whole explanation in the server's HTML", () => {
    expect(html).toContain("A rung counts the deals at that stage or further along.");
  });

  it("hangs the panel from its own button", () => {
    expect(html).toMatch(/<button[^>]*style="anchor-name:--info-deal-ladder"/);
    expect(html).toMatch(/<div[^>]*style="position-anchor:--info-deal-ladder"/);
  });

  /* Review round 8: a Slovak report's buttons were "About Interná správa o predaji". */
  it("names its button in the page's language, as the shell gives it", () => {
    const named = (language: "sk" | "hu") =>
      renderToStaticMarkup(
        createElement(
          InfoTipLanguage,
          { value: language },
          createElement(InfoTip, { id: "s", label: "Zhrnutie obdobia: Zdroj", children: "…" }),
        ),
      );
    expect(named("sk")).toContain('aria-label="Vysvetlenie: Zhrnutie obdobia: Zdroj"');
    expect(named("hu")).toContain('aria-label="Magyarázat: Zhrnutie obdobia: Zdroj"');
    expect(named("sk")).not.toContain("About");
  });
});
