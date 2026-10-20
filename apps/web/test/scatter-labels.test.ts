import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VIEWERS, syntheticRepository } from "@observer/synthetic";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { Scatter, pointLabels } from "@/showroom/forms";

/**
 * A POINT'S NUMBER NEVER SITS ON ANOTHER POINT OR ANOTHER NUMBER.
 *
 * Every number sat 10 units right of its point. On Ister Tower two segments
 * stand 2 units apart across and 6 down, and their 12px numbers overprinted;
 * on Shark's phone drawing one number landed on its neighbour's dot, white on
 * green. The key is matched to the plot by these numbers.
 */
const FRAME = { width: 720, height: 308 };

describe("pointLabels", () => {
  it("puts a lone point's number to its right", () => {
    expect(pointLabels([{ x: 100, y: 100 }], 6, FRAME)).toEqual([
      { x: 110, y: 100, anchor: "start" },
    ]);
  });

  it("moves a number off a neighbour's dot", () => {
    const [, second] = pointLabels(
      [
        { x: 124.3, y: 102.4 },
        { x: 112.8, y: 99.3 },
      ],
      5,
      FRAME,
    );
    expect(second?.anchor).not.toBe("start");
  });

  it("keeps two close points' numbers apart", () => {
    const labels = pointLabels(
      [
        { x: 400, y: 156.7 },
        { x: 398, y: 163 },
      ],
      6,
      FRAME,
    );
    expect(labels.map((l) => l.anchor)).toEqual(["start", "end"]);
  });

  it("keeps a number inside the frame", () => {
    expect(pointLabels([{ x: 715, y: 100 }], 6, FRAME)[0]?.anchor).toBe("end");
  });
});

/* Each drawing's points and numbers, read back off the markup. */
function drawings(html: string) {
  return html
    .split("<svg")
    .slice(1)
    .map((svg) => ({
      dots: [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="(\d+)"/g)].map((m) => ({
        x: Number(m[1]),
        y: Number(m[2]),
        r: Number(m[3]),
      })),
      numbers: [
        ...svg.matchAll(
          /<text x="([\d.]+)" y="([\d.]+)" text-anchor="(\w+)"[^>]*class="dld-point-label">(\d+)</g,
        ),
      ].map((m) => {
        const w = (m[4] ?? "").length * 8;
        const x = Number(m[1]);
        const l = m[3] === "start" ? x : m[3] === "end" ? x - w : x - w / 2;
        return { l, r: l + w, t: Number(m[2]) - 6.5, b: Number(m[2]) + 6.5 };
      }),
    }));
}

const PROJECTS = [
  { viewer: VIEWERS.developer, tenantSlug: "alpha", projectSlug: "ister-tower" },
  { viewer: VIEWERS.developer, tenantSlug: "alpha", projectSlug: "northgate" },
  { viewer: VIEWERS.developerShark, tenantSlug: "shark", projectSlug: "shark-residence" },
];

describe("the scatter on the fixtures", () => {
  it.each(PROJECTS)("$projectSlug: no number on another dot or number", async (project) => {
    const view = await syntheticRepository.getProjectView(
      { ...project, period: "quarter_to_date", language: DEFAULT_LANGUAGE },
      null,
    );
    expect(view.scatter.points.length, "nothing to place").toBeGreaterThan(1);
    for (const size of ["xl", "m", "l"] as const) {
      const [drawn] = drawings(
        renderToStaticMarkup(createElement(Scatter, { data: view.scatter, size })),
      );
      expect(drawn?.numbers.length, size).toBe(view.scatter.points.length);
      const problems: string[] = [];
      drawn?.numbers.forEach((n, i) => {
        drawn.dots.forEach((d, j) => {
          const dx = Math.max(n.l - d.x, 0, d.x - n.r);
          const dy = Math.max(n.t - d.y, 0, d.y - n.b);
          if (j !== i && dx * dx + dy * dy < d.r * d.r) problems.push(`${i + 1} on dot ${j + 1}`);
        });
        drawn.numbers.slice(0, i).forEach((o, j) => {
          if (n.l < o.r && o.l < n.r && n.t < o.b && o.t < n.b) {
            problems.push(`${i + 1} on number ${j + 1}`);
          }
        });
      });
      expect(problems, `${project.projectSlug} at ${size}`).toEqual([]);
    }
  });
});
