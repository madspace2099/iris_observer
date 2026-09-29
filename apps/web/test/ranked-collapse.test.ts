import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RankedBars } from "@/showroom/charts2";

/**
 * A long list's first five rows, and the rest behind "Show all" (R05 item 8),
 * approved by Máté on 2026-09-24 under `docs/observer-visual-baseline.md:280`.
 *
 * Collapsing is a change of place, never of content:
 * - a hidden row keeps its place number, so the second list does not start
 *   again at one;
 * - it keeps the scale the whole list shares, so its bar does not grow against
 *   a smaller maximum.
 * And the default is untouched: a list that does not opt in renders exactly
 * one `<ol>`, as it did, which is what keeps Sales Agents' list and the
 * Features lists as they were.
 */

const ROWS = [100, 90, 80, 70, 60, 50, 40, 30].map((value, i) => ({
  id: `r${i + 1}`,
  label: `Row ${String.fromCharCode(65 + i)}`,
  sub: null,
  value,
  display: `${value}s`,
}));

const render = (collapseAfter?: number, rows = ROWS) =>
  renderToStaticMarkup(
    createElement(RankedBars, { rows, period: "quarter_to_date", collapseAfter }),
  );

const places = (html: string) =>
  [...html.matchAll(/<span class="iris-ranked-place">(\d+)<\/span>/g)].map((m) => Number(m[1]));
const widths = (html: string) =>
  [...html.matchAll(/<i style="width:([\d.]+)%"><\/i>/g)].map((m) => Number(m[1]));

describe("a ranked list, five rows and Show all", () => {
  it("draws the first five, and the rest inside Show all", () => {
    const html = render(5);
    const [before, after] = html.split("<details");
    expect(places(before ?? "")).toEqual([1, 2, 3, 4, 5]);
    expect(places(after ?? "")).toEqual([6, 7, 8]);
    expect(after).toContain('<summary class="iris-action">Show all</summary>');
  });

  it("keeps every row's place and every bar's scale", () => {
    expect(places(render(5))).toEqual(places(render()));
    expect(widths(render(5))).toEqual(widths(render()));
  });

  it("changes nothing for a list that does not opt in, or is short enough", () => {
    expect(render()).not.toContain("<details");
    expect(render(8)).toBe(render());
    expect(render(5, ROWS.slice(0, 5))).toBe(render(undefined, ROWS.slice(0, 5)));
  });
});
