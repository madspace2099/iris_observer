import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrendLine } from "@/showroom/charts2";

/**
 * THE LAST WEEK'S LABEL STAYS INSIDE THE FRAME.
 *
 * The x labels were centred on their points, and the last point sits 16 units
 * from the right edge of a 720-unit frame, so its label ran past it and was
 * cut: "17 Au" under Sales Flow's weekly line, at every width.
 */
const points = ["6 Jul", "13 Jul", "20 Jul", "27 Jul", "3 Aug", "10 Aug", "17 Aug"].map(
  (label, i) => ({ label, value: 9 + (i % 2) }),
);

/* Each drawing's x labels as "label:anchor", in the order drawn: the XL, the middle, the phone's. */
function xLabels(html: string): string[][] {
  return html
    .split("<svg")
    .slice(1)
    .map((svg) =>
      [...svg.matchAll(/text-anchor="(\w+)"[^>]*>([^<]*\d+ \w{3})</g)].map(
        (m) => `${m[2] ?? ""}:${m[1] ?? ""}`,
      ),
    );
}

describe("the trend line's x labels", () => {
  it("ends the last label at its point and centres the others, in every drawing", () => {
    const html = renderToStaticMarkup(
      createElement(TrendLine, { points, valueLabel: "Meetings per week" }),
    );
    const drawings = xLabels(html);
    expect(drawings.length, "the XL, the middle and the phone's drawing").toBe(3);
    for (const anchors of drawings) {
      expect(anchors.at(-1)).toBe("17 Aug:end");
      expect(anchors.slice(0, -1).every((a) => a.endsWith(":middle"))).toBe(true);
    }
  });

  /*
   * The phone's drawing labelled every other week, and the last one ends at
   * its point: "3 Aug" and "17 Aug", two weeks apart, printed touching at 390
   * ("3 Aug17 Aug"). The week before the last labelled one gives way.
   */
  it("never sets two labels against each other on the phone's drawing", () => {
    const html = renderToStaticMarkup(
      createElement(TrendLine, { points, valueLabel: "Meetings per week" }),
    );
    const [xl, middle, phone] = xLabels(html);
    expect(xl, "the XL has room for every week").toHaveLength(7);
    expect(middle).toEqual(["6 Jul:middle", "20 Jul:middle", "3 Aug:middle", "17 Aug:end"]);
    expect(phone).toEqual(["6 Jul:middle", "20 Jul:middle", "17 Aug:end"]);
  });

  /*
   * One 720-unit drawing on a 252px phone card printed its 12px ticks at four.
   * The phone's drawing is 240 units and labels at most four weeks, which fit.
   */
  it("labels at most four weeks on the phone's drawing, and sets its note under it with the week it marks", () => {
    const html = renderToStaticMarkup(
      createElement(TrendLine, {
        points,
        valueLabel: "Meetings per week",
        annotation: { index: 3, text: "+7 against the week before" },
      }),
    );
    const phone = html.slice(html.indexOf('data-size="l"'));
    expect(phone).toContain('viewBox="0 0 240 150"');
    expect(xLabels(phone)[0]?.length).toBeLessThanOrEqual(4);
    expect(phone).not.toContain('class="iris-trend-note"');
    expect(phone).toContain(
      '<p class="iris-trend-caption">27 Jul · +7 against the week before</p>',
    );
  });
});

/*
 * A level series is a path with a box of no height, and the D sheet's gradient
 * stroke is sized to that box: it painted nothing, so the line vanished. The
 * path says it is level, and the sheet strokes it in one colour.
 */
describe("a level line", () => {
  const level = (html: string) =>
    [...html.matchAll(/class="iris-trend-line"[^>]*/g)].map((m) => m[0]);

  it("is marked when every point has one value", () => {
    const flat = points.map((p) => ({ ...p, value: 4 }));
    const html = renderToStaticMarkup(
      createElement(TrendLine, { points: flat, valueLabel: "Meetings per week" }),
    );
    expect(level(html).length).toBeGreaterThan(0);
    expect(level(html).every((tag) => tag.includes('data-level="true"'))).toBe(true);
  });

  it("is not marked when the series moves", () => {
    const html = renderToStaticMarkup(
      createElement(TrendLine, { points, valueLabel: "Meetings per week" }),
    );
    expect(level(html).some((tag) => tag.includes("data-level"))).toBe(false);
  });
});
