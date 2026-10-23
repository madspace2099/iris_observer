import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OutcomeRing, PeriodSteps } from "@/showroom/charts";

/**
 * A WINDOW OUTSIDE THE PERIOD IS DRAWN AS OUTSIDE IT, NEVER AS ZERO.
 *
 * Inside the last 28 days "Last month" has no count: the period began after it
 * ended. It used to draw a "0" and a median of "—", which is the shape of a
 * month in which nothing happened.
 */
const step = (id: string, label: string, inPeriod: boolean, meetings: number) => ({
  id,
  label,
  inPeriod,
  meetings,
  progressed: 0,
  medianDurationDisplay: inPeriod ? "13m 56s" : "—",
});

describe("the period steps", () => {
  const html = renderToStaticMarkup(
    createElement(PeriodSteps, {
      periods: [
        step("this_month", "This month", true, 32),
        step("last_month", "Last month, first 24 days", false, 0),
      ],
    }),
  );

  it("prints a dash and the reason for a window outside the period", () => {
    const outside = html.slice(html.indexOf("Last month, first 24 days") - 200);
    expect(html).toContain('<span class="iris-step-figure">32</span>');
    expect(html).not.toContain('<span class="iris-step-figure">0</span>');
    expect(outside).toContain('<span class="iris-step-figure">—</span>');
    expect(outside).toContain('<span class="iris-step-meta">Not in this period</span>');
    expect(outside).not.toContain("0 meetings");
  });

  /* The owner struck the median length under each column (2026-10-23). */
  it("prints no median length under a column", () => {
    expect(html).not.toContain("13m 56s");
    const inside = html.slice(0, html.indexOf("Last month, first 24 days"));
    expect(inside).not.toContain("iris-step-meta");
  });
});

/**
 * THE RING BESIDE THE STEPS NAMES ITS PERIOD (the owner, 2026-10-23).
 *
 * "Which every outcome? 150 meetings is not the meetings in the left chart."
 * The ring counts the page's period; the steps count windows back from today.
 * Its hole says which, in the read model's own words.
 */
describe("the ring beside the steps", () => {
  const slices = [
    { outcome: "purchase", label: "Purchase", count: 11, share: 0.5 },
    { outcome: "skipped", label: "Outcome not recorded", count: 11, share: 0.5 },
  ] as const;
  const ring = (period?: string) =>
    renderToStaticMarkup(
      createElement(OutcomeRing, { slices, total: 22, size: 248, measured: true, period }),
    );
  const captions = (html: string) =>
    [...html.matchAll(/<text[^>]*class="iris-ring-caption"[^>]*>([^<]*)<\/text>/g)].map(
      (m) => m[1],
    );

  it("names the period under the count, and in its accessible name", () => {
    const html = ring("Quarter to date");
    expect(captions(html)).toEqual(["meetings", "Quarter to date"]);
    expect(html).toContain('aria-label="22 meetings, Quarter to date: Purchase 11,');
  });

  it("splits a name too long for the hole where the longer line is shortest", () => {
    expect(captions(ring("Last completed quarter"))).toEqual([
      "meetings",
      "Last completed",
      "quarter",
    ]);
  });

  it("keeps a two-line period's block centred where a one-line one is", () => {
    const middle = (html: string) => {
      const ys = [...html.matchAll(/<text[^>]* y="([^"]+)"/g)].map((m) => Number(m[1]));
      return (ys[0]! + ys[ys.length - 1]!) / 2;
    };
    expect(middle(ring("Last completed quarter"))).toBeCloseTo(middle(ring("Quarter to date")), 6);
  });

  it("draws the hole as before where no period is passed", () => {
    const html = ring();
    expect(captions(html)).toEqual(["meetings"]);
    expect(html).toContain('aria-label="22 meetings: Purchase 11,');
  });
});
