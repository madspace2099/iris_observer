import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BehaviourFunnel } from "@observer/readmodels";
import { Funnel } from "@/showroom/charts2";

/**
 * SALES FLOW'S NOT-INTERESTED SECTION DRAWS THE READ MODEL (ADR-0053).
 *
 * Whose the meetings were, how long they ran, what was opened, and each
 * behaviour against the others: every word and figure arrives written, and the
 * component only lays them out and links a presenter to their meetings for a
 * reader the register admits. Strings no arithmetic could produce, so a
 * component that computed its own would not pass.
 */

const DATA: BehaviourFunnel = {
  cohortLabel: "group label",
  steps: [],
  empty: null,
  comparisonLabel: "comparison label",
  disclaimer: "the disclaimer",
  lead: "the lead sentence from the read model",
  figures: [
    {
      id: "length",
      metricId: "flow.not_interested_length",
      label: "Median length",
      value: "length value",
      qualifier: "length qualifier",
    },
  ],
  byAgent: [
    {
      agentId: "agt_oliver",
      name: "Oliver Grant",
      count: 8,
      recordedDisplay: "Oliver's recorded",
      display: "Oliver's figure",
      share: 0.3125,
      belowMinimum: false,
      href: "/t/p/meetings?agent=agt_oliver&outcome=not_interested",
    },
    {
      agentId: "agt_marek",
      name: "Marek Dvořák",
      count: 0,
      recordedDisplay: "Marek's recorded",
      display: "Marek's figure",
      share: null,
      belowMinimum: true,
      href: null,
    },
  ],
  reach: [
    {
      id: "used_compare",
      label: "Used Compare",
      share: 0.11,
      comparisonShare: 0.58,
      text: "Compare's sentence",
    },
  ],
  reachOf: "what the shares are of",
};

const render = (data: BehaviourFunnel, canOpen: boolean) =>
  renderToStaticMarkup(createElement(Funnel, { data, period: "last_28_days", canOpen }));

describe("the not-interested section", () => {
  const html = render(DATA, true);

  it("prints the lead, the figures and each presenter's words as written", () => {
    for (const words of [
      "the lead sentence from the read model",
      "length value",
      "length qualifier",
      "Oliver&#x27;s recorded",
      "Oliver&#x27;s figure",
      "Marek&#x27;s figure",
      "what the shares are of",
    ]) {
      expect(html).toContain(words);
    }
  });

  it("opens a presenter's meetings of the group in the reader's period", () => {
    expect(html).toContain(
      'href="/t/p/meetings?agent=agt_oliver&amp;outcome=not_interested&amp;period=last_28_days"',
    );
    expect(html).toContain(
      'aria-label="Oliver Grant: 8 meetings ended &quot;not interested&quot; — open them"',
    );
  });

  it("links nobody with no meeting in the group, and nobody for a reader the register refuses", () => {
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(render(DATA, false)).not.toContain("<a ");
  });

  it("draws a presenter's bar to the rate beside it, and none where no rate is stated", () => {
    // Oliver's rate as the read model wrote it, never his 8 of the group's 8.
    expect(html).toContain("flex-grow:0.3125");
    expect(html).toContain("flex-grow:0.6875");
    const below = render(
      { ...DATA, byAgent: [{ ...DATA.byAgent[0]!, share: null, belowMinimum: true }] },
      true,
    );
    expect(below).toContain('<span class="iris-orow-bar" aria-hidden="true"></span>');
  });

  it("draws each behaviour's pair under the names of both groups", () => {
    expect(html).toContain("Used Compare");
    expect(html).toContain('title="Compare&#x27;s sentence"');
    expect(html).toContain("This group");
    expect(html).toContain("Others");
  });

  it("says why no pair is drawn where a side is under the floor, and leaves out an empty strip", () => {
    const under = render({ ...DATA, figures: [], reach: [], reachOf: "why not compared" }, true);
    expect(under).toContain("why not compared");
    expect(under).not.toContain("iris-paired");
    expect(under).not.toContain("iris-kpis");
  });
});
