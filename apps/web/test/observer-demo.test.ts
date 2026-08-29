import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEMO_DAY_ROWS,
  DEMO_PROJECTS,
  DEMO_TODAY,
  DEMO_UNITS,
  eventsForUnit,
} from "@/observer-demo/fixtures";
import { DEMO_INSIGHTS, EVIDENCE_LABEL } from "@/observer-demo/insights";
import {
  CHANNEL_LABEL,
  RANGE_DAYS,
  channelSplit,
  demandSeries,
  funnel,
  metricCards,
  unitDemand,
  unitSeries,
} from "@/observer-demo/metrics";
import { CHANNELS, RANGES, flattenParams, selectionFrom } from "@/observer-demo/params";
import { LoadingScreen, RecoverableError } from "@/observer-demo/components/states";
import type { ChannelFilter, RangeKey, Selection } from "@/observer-demo/types";

/**
 * WHAT THESE HOLD.
 *
 * The demonstration surface makes one substantive promise beyond looking
 * finished: every number on it comes from the same array, so a card cannot
 * disagree with the chart beside it. That is checkable, and most of what
 * follows checks it — at every range, on every channel, for every project.
 *
 * The rest guard the wording. A screen that says "caused" where it means
 * "moved together" is worse than a screen with no findings on it, and the
 * vocabulary is the product.
 */

const EVERY_SELECTION: readonly Selection[] = DEMO_PROJECTS.flatMap((p) =>
  RANGES.flatMap((range: RangeKey) =>
    CHANNELS.map((channel: ChannelFilter) => ({ projectId: p.id, range, channel })),
  ),
);

const sel = (over: Partial<Selection> = {}): Selection => ({
  projectId: "ister-tower",
  range: "28d",
  channel: "all",
  ...over,
});

describe("the demonstration dataset is deterministic", () => {
  it("produces identical figures on repeated derivation", () => {
    const once = metricCards(sel());
    const twice = metricCards(sel());
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("anchors to a fixed date rather than to now", () => {
    /*
     * A demonstration that re-anchors to today shows a different ninety days in
     * every screenshot, and its reservations drift out of the window they
     * belong to.
     */
    expect(DEMO_TODAY).toBe("2026-08-28");
    const dates = [...new Set((DEMO_DAY_ROWS["ister-tower"] ?? []).map((r) => r.date))].sort();
    expect(dates.at(-1)).toBe(DEMO_TODAY);
    expect(dates).toHaveLength(90);
  });

  it("carries no personal data and no secret-shaped value", () => {
    const text = JSON.stringify({ DEMO_DAY_ROWS, DEMO_UNITS, DEMO_INSIGHTS });
    expect(text).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(text).not.toMatch(/\b(sk|pk|sb|rk)[-_][A-Za-z0-9]{16,}/);
    expect(text).not.toMatch(/\b[A-Z][A-Z0-9_]{6,}\s*=\s*\S/);
    /* And it never claims to have come from anywhere. */
    expect(text.toLowerCase()).not.toContain("supabase");
  });
});

describe("every displayed total reconciles with the dataset", () => {
  it.each(EVERY_SELECTION.map((s) => [`${s.projectId}/${s.range}/${s.channel}`, s] as const))(
    "unit views and favourites sum to the summary cards for %s",
    (_label, selection) => {
      const cards = metricCards(selection);
      const units = unitDemand(selection);
      const views = cards.find((c) => c.key === "unitViews")?.value ?? -1;
      const favourites = cards.find((c) => c.key === "favorites")?.value ?? -1;
      expect(units.reduce((a, u) => a + u.views, 0)).toBe(views);
      expect(units.reduce((a, u) => a + u.favorites, 0)).toBe(favourites);
    },
  );

  it.each(EVERY_SELECTION.map((s) => [`${s.projectId}/${s.range}/${s.channel}`, s] as const))(
    "the demand chart sums to the sessions card for %s",
    (_label, selection) => {
      /*
       * The chart always shows both channels; the card counts only the selected
       * one. They agree exactly when the selection is "all", and the card is a
       * strict subset otherwise — which is the relationship, stated.
       */
      const sessions = metricCards(selection).find((c) => c.key === "sessions")?.value ?? -1;
      const charted = demandSeries(selection).reduce((a, p) => a + p.web + p.showroom, 0);
      if (selection.channel === "all") expect(charted).toBe(sessions);
      else expect(sessions).toBeLessThan(charted);
    },
  );

  it("gives every range exactly the number of days it names", () => {
    for (const range of RANGES) {
      expect(demandSeries(sel({ range }))).toHaveLength(RANGE_DAYS[range]);
      expect(metricCards(sel({ range }))[0]?.spark).toHaveLength(RANGE_DAYS[range]);
    }
  });
});

describe("the funnel cannot invert", () => {
  it.each(EVERY_SELECTION.map((s) => [`${s.projectId}/${s.range}/${s.channel}`, s] as const))(
    "each stage is no larger than the one before it for %s",
    (_label, selection) => {
      const stages = funnel(selection);
      expect(stages.map((s) => s.key)).toEqual([
        "viewed",
        "explored",
        "favorited",
        "meeting",
        "reserved",
      ]);
      for (let i = 1; i < stages.length; i += 1) {
        expect(stages[i]?.value ?? 0).toBeLessThanOrEqual(stages[i - 1]?.value ?? 0);
      }
    },
  );

  it("shares are of the first stage and of the previous one, both", () => {
    const stages = funnel(sel());
    const first = stages[0]?.value ?? 0;
    for (const stage of stages) {
      expect(stage.ofFirst).toBeCloseTo(stage.value / first, 10);
      expect(stage.ofFirst).toBeLessThanOrEqual(1);
      expect(stage.ofPrevious).toBeLessThanOrEqual(1);
    }
  });

  it("matches the funnel's first stage to the sessions card", () => {
    expect(funnel(sel())[0]?.value).toBe(
      metricCards(sel()).find((c) => c.key === "sessions")?.value,
    );
  });
});

describe("channel selection changes the data, not only the control", () => {
  it("counts strictly less on one channel than on both", () => {
    const all = metricCards(sel({ channel: "all" }))[0]?.value ?? 0;
    const web = metricCards(sel({ channel: "web" }))[0]?.value ?? 0;
    const showroom = metricCards(sel({ channel: "showroom" }))[0]?.value ?? 0;
    expect(web).toBeGreaterThan(0);
    expect(showroom).toBeGreaterThan(0);
    expect(web + showroom).toBe(all);
  });

  it("keeps unattributed activity as its own row rather than dividing it", () => {
    const split = channelSplit(sel());
    expect(split.map((c) => c.channel)).toEqual(["web", "showroom", "unknown"]);
    const unknown = split.find((c) => c.channel === "unknown");
    expect(unknown?.sessions).toBeGreaterThan(0);
    /* It is counted, and it is not folded into either channel. */
    const web = split.find((c) => c.channel === "web")?.sessions ?? 0;
    const showroom = split.find((c) => c.channel === "showroom")?.sessions ?? 0;
    expect(web + showroom).toBe(metricCards(sel())[0]?.value);
  });

  it("labels every channel option", () => {
    for (const channel of CHANNELS) expect(CHANNEL_LABEL[channel].length).toBeGreaterThan(2);
  });
});

describe("the selection is parsed from the URL and always falls back", () => {
  it("reads a complete selection", () => {
    expect(
      selectionFrom(new URLSearchParams("project=danube-quarter&range=7d&channel=showroom")),
    ).toEqual({ projectId: "danube-quarter", range: "7d", channel: "showroom" });
  });

  it.each([
    "",
    "project=nope",
    "range=999d",
    "channel=telepathy",
    "project=<script>&range=../&channel=%00",
  ])("falls back to a valid selection for %s", (query) => {
    const selection = selectionFrom(new URLSearchParams(query));
    expect(DEMO_PROJECTS.some((p) => p.id === selection.projectId)).toBe(true);
    expect(RANGES).toContain(selection.range);
    expect(CHANNELS).toContain(selection.channel);
  });

  it("takes the first value when a key repeats", () => {
    expect(flattenParams({ range: ["7d", "90d"], project: undefined })).toEqual({ range: "7d" });
  });
});

describe("unit demand", () => {
  it("gives every unit a status, and distinguishes quiet from cooling", () => {
    const statuses = new Set(unitDemand(sel()).map((u) => u.status));
    /*
     * A unit nobody opens has not lost interest — it never had any. An agent
     * should treat those differently, so they are different states.
     */
    expect(statuses.has("quiet")).toBe(true);
    expect(statuses.has("rising")).toBe(true);
    expect(statuses.size).toBeGreaterThanOrEqual(3);
  });

  it("reports no trend rather than a fabricated one when the prior window is empty", () => {
    for (const row of unitDemand(sel())) {
      if (row.priorViews === 0) expect(row.changePct).toBeNull();
      else expect(typeof row.changePct).toBe("number");
    }
  });

  it("derives a unit's own series from the same window", () => {
    const unit = DEMO_UNITS["ister-tower"]?.[0];
    expect(unit).toBeDefined();
    if (unit === undefined) return;
    expect(unitSeries(sel({ range: "7d" }), unit)).toHaveLength(7);
  });

  it("describes recent events without describing anybody", () => {
    const events = eventsForUnit("ister-tower-0703");
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(["web", "showroom"]).toContain(e.channel);
      expect(e.detail).not.toMatch(/\b(he|she|his|her|aged|income|family)\b/i);
    }
  });
});

describe("the findings say how strongly they are evidenced", () => {
  it("offers all three evidence types, including a warning against a causal reading", () => {
    const kinds = new Set(DEMO_INSIGHTS.map((i) => i.evidence));
    expect(kinds).toEqual(new Set(["observed-sequence", "attributed-conversion", "association"]));
    const association = DEMO_INSIGHTS.find((i) => i.evidence === "association");
    expect(association?.recommendation).toMatch(/do not treat|do not report/i);
  });

  it("covers a demand rise, a demand fall, a cross-channel journey and unknown attribution", () => {
    const text = DEMO_INSIGHTS.map((i) => `${i.title} ${i.measurement}`)
      .join(" ")
      .toLowerCase();
    expect(text).toMatch(/rising share/);
    expect(text).toMatch(/fallen out|fewer than a quarter/);
    expect(text).toMatch(/linked across both channels|cross-channel/);
    expect(text).toMatch(/cannot be linked|unattributed/);
  });

  it("labels every evidence type", () => {
    for (const insight of DEMO_INSIGHTS) {
      expect(EVIDENCE_LABEL[insight.evidence]).toBeDefined();
      expect(insight.strength.length).toBeGreaterThan(30);
      expect(insight.recommendation).toMatch(/recommended follow-up|may warrant review/i);
    }
  });
});

describe("nothing overclaims", () => {
  /* Every string a reader can see, gathered once. */
  const prose = [
    ...DEMO_INSIGHTS.flatMap((i) => [
      i.title,
      i.measurement,
      i.whyItMatters,
      i.recommendation,
      i.strength,
    ]),
    ...metricCards(sel()).map((c) => c.description),
  ].join(" ");

  it.each([
    ["caused", /\bcaus(ed|es|ing)\b/i],
    ["proves", /\bprove[sd]?\b/i],
    ["demonstrates intent", /\bdemonstrat\w* intent\b/i],
    ["guarantees", /\bguarantee[sd]?\b/i],
    ["will buy", /\bwill (buy|purchase|reserve)\b/i],
  ])("never says %s", (_word, pattern) => {
    expect(prose).not.toMatch(pattern);
  });

  it("infers nothing about who a buyer is", () => {
    expect(prose).not.toMatch(/\b(age|aged|gender|income|ethnic|marital|household size)\b/i);
  });

  it("says observed, associated with, and may warrant review", () => {
    expect(prose).toMatch(/\bobserved\b/i);
    expect(prose).toMatch(/associated with|association/i);
    expect(prose).toMatch(/may warrant review/i);
  });
});

describe("the states a screen has to have", () => {
  it("has a selection with no attributed reservation, and one with several", () => {
    /*
     * The no-attributed-data state is only honest if it is reachable and if it
     * is NOT the general case. Both halves are asserted, so a generator change
     * that silently removes the state fails here rather than in a screenshot.
     */
    const empty = funnel({ projectId: "buda-terrace", range: "28d", channel: "web" });
    expect(empty.find((s) => s.key === "reserved")?.value).toBe(0);
    /* And the stage above it is not zero: activity was observed, not absent. */
    expect(empty.find((s) => s.key === "viewed")?.value).toBeGreaterThan(0);

    const normal = funnel(sel());
    expect(normal.find((s) => s.key === "reserved")?.value).toBeGreaterThan(0);
  });

  it("offers a way out of a failure rather than a diagnosis of it", () => {
    const html = renderToStaticMarkup(
      createElement(RecoverableError, { onRetry: () => undefined }),
    );
    expect(html).toContain("Try again");
    expect(html).toContain("This view could not be assembled");
    /* Nothing was lost and nothing was changed: the reader is told so. */
    expect(html).toMatch(/nothing has been changed/i);
    /* No stack, no digest, no apology. */
    expect(html).not.toMatch(/sorry|at Object[.]|[.]tsx:|componentStack/i);
  });

  it("announces the wait instead of only animating it", () => {
    const html = renderToStaticMarkup(createElement(LoadingScreen));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading the selected window");
    expect(html).toContain("od-skel");
  });
});
