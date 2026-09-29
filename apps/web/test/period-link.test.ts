import { describe, expect, it } from "vitest";
import { withPeriod } from "@/lib/period";

/**
 * THE PERIOD GOES BEFORE A FRAGMENT.
 *
 * `withPeriod` appended `?period=…` to the whole address, so a link to a
 * section of a page — the unit page's table of the meetings that opened it —
 * carried the period inside its anchor, and the page opened on the quarter.
 */
describe("withPeriod", () => {
  it("puts the period before the fragment", () => {
    expect(withPeriod("/alpha/northgate/units/A-101#meetings-that-opened-it", "last_28_days")).toBe(
      "/alpha/northgate/units/A-101?period=last_28_days#meetings-that-opened-it",
    );
  });

  it("keeps the query a link already had, then the fragment", () => {
    expect(withPeriod("/alpha/northgate/meetings?outcome=skipped#top", "year_to_date")).toBe(
      "/alpha/northgate/meetings?outcome=skipped&period=year_to_date#top",
    );
  });

  it("leaves an address with no fragment as it was", () => {
    expect(withPeriod("/alpha/northgate/flow", "last_quarter")).toBe(
      "/alpha/northgate/flow?period=last_quarter",
    );
    expect(withPeriod("/alpha/northgate/flow#x", "quarter_to_date")).toBe(
      "/alpha/northgate/flow#x",
    );
  });
});
