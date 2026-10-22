import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PresenterRow } from "@observer/readmodels";
import { CoachingChart, shownPeople, type CoachingPerson } from "@/showroom/CoachingChart";

/**
 * COACHING'S ONE CHART: A ROW PER PART, A DOT PER AGENT, AND A KEY THAT WORKS.
 *
 * The owner (2026-10-22, ADR-0057) could not tell what the two Coaching
 * panels wanted to show. One chart now: a row per part of the showroom, a dot
 * per drawn agent at the share of their own meetings, and under the widest
 * rows who sits at each end. The key is its control: one entry per agent, a
 * button that hides or draws them (`aria-pressed`) and a link to their page.
 * Rendered on the server, as a reader first receives it: every agent drawn,
 * none lifted.
 */

const person = (id: string, tone: string): CoachingPerson => ({
  id,
  name: `Agent ${id}`,
  meetings: "25 meetings",
  tone,
  href: `/shark/shark-residence/agents/${id}`,
  portrait: null,
});
const PEOPLE = [person("a", "var(--d-series-1)"), person("b", "var(--d-series-2)")];
const mark = (agentId: string, share: number) => ({
  agentId,
  share,
  display: `${Math.round(share * 100)}%`,
});
const ROWS: readonly PresenterRow[] = [
  {
    id: "comparing",
    label: "Compare two apartments side by side",
    marks: [mark("a", 0.76), mark("b", 0.19)],
    ends: {
      high: { agentIds: ["a"], names: "Agent a", share: "76%", of: "of 33 meetings" },
      low: { agentIds: ["b"], names: "Agent b", share: "19%", of: "of 26 meetings" },
    },
  },
  {
    id: "sharing",
    label: "Share an apartment",
    marks: [mark("a", 0.1), mark("b", 0.1)],
    ends: null,
  },
];
const html = renderToStaticMarkup(createElement(CoachingChart, { people: PEOPLE, rows: ROWS }));

describe("CoachingChart", () => {
  it("keys every agent once, each drawn and pressable, face beside the name", () => {
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(html.match(/class="ag-portrait ag-portrait-initials"/g)?.length).toBeGreaterThan(2);
  });

  it("links each key entry to the agent's own page", () => {
    for (const p of PEOPLE) expect(html).toContain(`href="${p.href}"`);
  });

  it("draws one row per part, with a dot per agent at their share", () => {
    expect(html.match(/<li data-named="true"/g)).toHaveLength(1);
    expect(html.match(/class="ag-coach-label"/g)).toHaveLength(2);
    expect(html).toContain("--at:0.76");
    expect(html).toContain("--at:0.19");
  });

  it("names both ends of a row that has them, each with what its figure is of", () => {
    expect(html).toContain("<b>Agent a</b> 76% <em>of 33 meetings</em>");
    expect(html).toContain("<b>Agent b</b> 19% <em>of 26 meetings</em>");
    expect(html.match(/class="ag-coach-ends"/g)).toHaveLength(1);
  });

  it("states what every dot is a share of", () => {
    expect(html).toContain("Share of each agent’s own meetings");
  });

  it("wears each agent's own colour on their dot", () => {
    expect(html).toContain("--tone:var(--d-series-2)");
  });
});

describe("lifting an agent from the key", () => {
  it("draws the lifted agent last, at full strength, and fades the rest", () => {
    const { lift, shown } = shownPeople(PEOPLE, new Set(), "a");
    expect(lift).toBe("a");
    expect(shown.map((p) => [p.id, p.tone])).toEqual([
      ["b", "color-mix(in oklab, var(--d-series-2) 22%, transparent)"],
      ["a", "var(--d-series-1)"],
    ]);
  });

  it("fades nobody when the agent pointed at is hidden", () => {
    /* The press that hides an agent leaves the pointer on their entry: every dot faded before. */
    const { lift, shown } = shownPeople(PEOPLE, new Set(["a"]), "a");
    expect(lift).toBeNull();
    expect(shown.map((p) => p.tone)).toEqual(["var(--d-series-2)"]);
  });
});
