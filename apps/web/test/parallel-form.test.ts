import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Parallel, type ParallelData } from "@/showroom/forms";

/**
 * THE PARALLEL PLOT DRAWS NO VALUE WHERE NONE WAS MEASURED.
 *
 * An axis the build cannot answer stands dashed and no line crosses it: a line
 * through it would claim a share nobody recorded. Each line wears the colour
 * the read model gave its agent, and the kit's pink haze is not drawn (a
 * blurred colour blob; ADR-0041's amendment of 2026-10-20).
 */

const AXES: ParallelData["axes"] = [
  ...["locating", "comparing", "shortlisting", "capturing", "slicing", "reading", "sharing"].map(
    (id) => ({ id, label: id, missing: null }),
  ),
  ...["exploring", "filtering", "walking"].map((id) => ({
    id,
    label: id,
    missing: "Not measured yet.",
  })),
];
const values = [0.9, 0.2, 1, 0.6, 0.6, 0.8, 0.3, null, null, null];
const DATA: ParallelData = {
  axes: AXES,
  lines: [
    { id: "a", label: "Lena", values, tone: "var(--d-series-1)" },
    {
      id: "b",
      label: "Marek",
      values: values.map((v) => (v === null ? null : 1 - v)),
      tone: "var(--d-series-2)",
    },
  ],
};
const html = renderToStaticMarkup(createElement(Parallel, { data: DATA, size: "xl" }));

/* The xl geometry: 720 wide, 40 to the left of the first axis, ten axes. */
const pitch = (720 - 40) / 10;
const xOf = (i: number) => (40 + pitch * (i + 0.5)).toFixed(2);

describe("Parallel", () => {
  it("draws ten axes, three of them dashed as not measured", () => {
    expect(html.match(/class="dld-parallel-axis"/g)).toHaveLength(10);
    expect(html.match(/<line[^>]*data-missing="true"/g)).toHaveLength(3);
  });

  it("puts no line's point on an axis that is not measured", () => {
    const points = [...html.matchAll(/points="([^"]+)"/g)].flatMap((m) =>
      (m[1] ?? "").split(" ").map((p) => p.split(",")[0]),
    );
    expect(points.length).toBeGreaterThan(0);
    for (const missing of [7, 8, 9]) expect(points).not.toContain(xOf(missing));
  });

  it("colours each line with its agent's own tone", () => {
    expect(html).toContain("--d-tone:var(--d-series-1)");
    expect(html).toContain("--d-tone:var(--d-series-2)");
  });

  it("draws no haze", () => {
    expect(html).not.toContain("dld-haze");
    expect(html).not.toContain("<ellipse");
  });
});
