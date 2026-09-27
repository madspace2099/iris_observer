import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PeriodSteps } from "@/showroom/charts";

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
  it("prints a dash and the reason for a window outside the period", () => {
    const html = renderToStaticMarkup(
      createElement(PeriodSteps, {
        periods: [
          step("this_month", "This month", true, 32),
          step("last_month", "Last month, first 24 days", false, 0),
        ],
      }),
    );
    const outside = html.slice(html.indexOf("Last month, first 24 days") - 200);
    expect(html).toContain('<span class="iris-step-figure">32</span>');
    expect(html).not.toContain('<span class="iris-step-figure">0</span>');
    expect(outside).toContain('<span class="iris-step-figure">—</span>');
    expect(outside).toContain('<span class="iris-step-meta">Not in this period</span>');
    expect(outside).not.toContain("0 meetings");
  });
});
