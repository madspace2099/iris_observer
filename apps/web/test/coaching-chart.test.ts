import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CoachingChart, type CoachingPerson } from "@/showroom/CoachingChart";

/**
 * COACHING'S ONE CHART: EVERY DRAWN AGENT IN IT, AND A KEY THAT WORKS.
 *
 * The owner (2026-10-20) asked for one large chart with every agent inside it.
 * The key is its control: one entry per agent, a button that hides or draws
 * them (`aria-pressed`) and a link to their page. Rendered on the server, as a
 * reader first receives it: every agent drawn, none lifted.
 */

const person = (id: string, tone: string): CoachingPerson => ({
  id,
  name: `Agent ${id}`,
  meetings: "25 meetings",
  tone,
  href: `/shark/shark-residence/agents/${id}`,
  shape: [1, 0.5, 0.5, 0.5, 0.5, 1],
  parts: [0.9, 0.2, 1, 0.6, 0.6, 0.8, 0.3, null, null, null],
});
const PEOPLE = [person("a", "var(--d-series-1)"), person("b", "var(--d-series-2)")];
const AXES = ["Coverage", "Depth", "Units", "Compare", "Returns", "Places"];
const PARTS = [
  ...["l", "c", "s", "p", "f", "r", "h"].map((id) => ({ id, label: id, missing: null })),
  ...["e", "i", "w"].map((id) => ({ id, label: id, missing: "Not measured yet." })),
];
const html = (lens: "radar" | "parallel") =>
  renderToStaticMarkup(
    createElement(CoachingChart, { lens, radarAxes: AXES, parallelAxes: PARTS, people: PEOPLE }),
  );

describe("CoachingChart", () => {
  it("keys every agent once, each drawn and pressable", () => {
    expect(html("radar").match(/aria-pressed="true"/g)).toHaveLength(2);
  });

  it("links each key entry to the agent's own page", () => {
    for (const p of PEOPLE) expect(html("radar")).toContain(`href="${p.href}"`);
  });

  it("overlays every agent in one radar, at each of its three geometries", () => {
    /* Two shapes in each of the xl, m and l drawings: one chart, not a card per agent. */
    expect(html("radar").match(/class="iris-radar-shape"/g)).toHaveLength(6);
  });

  it("draws the other lens as one line per agent, and no radar", () => {
    const parallel = html("parallel");
    expect(parallel).not.toContain("iris-radar-shape");
    expect(parallel.match(/class="dld-parallel-line"/g)).toHaveLength(6);
  });

  it("wears each agent's own colour on their mark", () => {
    expect(html("radar")).toContain("--tone:var(--d-series-2)");
  });
});
