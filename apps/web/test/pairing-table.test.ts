import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FeaturePairing } from "@observer/readmodels";
import { Pairings } from "@/components/features";

/**
 * THE PAIRING TABLE, RENDERED (NIGHT2, docs/23 R10, P2-11).
 *
 * "Pairing is not order and not effect; minimum sample and denominator." The
 * finding behind it is tested (`packages/synthetic/test/pairing-floor.test.ts`);
 * the table the reader sees was not. Below the floor it states no association
 * and draws no table; above it, every pair is counted out of the period's
 * presentations, and the note under it says the figure carries no order and
 * no effect.
 */

const render = (props: {
  ranked: boolean;
  meetingsTotal: number;
  pairings: readonly FeaturePairing[];
}) =>
  renderToStaticMarkup(
    createElement(Pairings, {
      ...props,
      period: "quarter_to_date",
      periodLabel: "this quarter",
      minimumSample: 20,
      language: "en",
      meetingsHref: "/alpha/northgate/meetings",
    }),
  );

describe("the pairing table", () => {
  it("states no association below the floor, and draws no table", () => {
    const html = render({ ranked: false, meetingsTotal: 12, pairings: [] });
    expect(html).toContain("Co-occurrence between features is not reported at this sample");
    expect(html).toContain("12 presentations is short of the 20");
    expect(html).not.toContain("<table");
  });

  it("counts every pair out of the period's presentations, and claims no order or effect", () => {
    const html = render({
      ranked: true,
      meetingsTotal: 40,
      pairings: [{ a: "compare", b: "shortlist", together: 12, lift: 1.85 }],
    });
    expect(html).toContain("<table");
    expect(html).toMatch(/12[\s\S]{0,80}40/);
    expect(html).toContain("1.85×");
    expect(html).toContain("it carries no order between the two");
    expect(html).toContain("no claim about what either one did to the buyer");
  });
});
