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

describe("the trend line's x labels", () => {
  it("ends the last label at its point and centres the others", () => {
    const html = renderToStaticMarkup(
      createElement(TrendLine, { points, valueLabel: "Meetings per week" }),
    );
    const anchors = [...html.matchAll(/text-anchor="(\w+)"[^>]*>([^<]*\d+ \w{3})</g)].map(
      (m) => `${m[2] ?? ""}:${m[1] ?? ""}`,
    );
    expect(anchors.at(-1)).toBe("17 Aug:end");
    expect(anchors.slice(0, -1).every((a) => a.endsWith(":middle"))).toBe(true);
  });
});
