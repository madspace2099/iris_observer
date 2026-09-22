import { describe, expect, it } from "vitest";
import { VIEWERS, syntheticRepository } from "@observer/synthetic";

/**
 * The project view carries what its figures are of, and how they read.
 *
 * The page printed an index with its two shares in a tooltip, five rates with
 * their set in a tooltip, two counts with no set at all, and three shares it
 * rounded itself. The read model now carries the sets and the display strings;
 * this proves the builder fills them. The print site is
 * `e2e/project-denominators.spec.ts`, on the rendered page.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const QUERY = {
  viewer: VIEWERS.developer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  period: "quarter_to_date" as const,
};

const view = await syntheticRepository.getProjectView(QUERY, "rooms-2");
const segment = view.selectedSegment;
if (segment === null) throw new Error("the fixture has no two-room segment: nothing to measure");

describe("a segment's shares", () => {
  it("carry their display form, formatted by the read model", () => {
    expect(segment.attentionShareDisplay, "the page would have to round it itself").toMatch(
      /^(<1%|\d+%)$/,
    );
  });

  it("agree with the number they display", () => {
    /* Guards the guard: a display string of "27%" beside a share of 0.7 is a second figure. */
    expect(segment.stockShareDisplay).toBe(
      new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 }).format(
        segment.stockShare,
      ),
    );
  });
});

describe("the sets the examined-how rates stand on", () => {
  it("are stated for this segment's units", () => {
    expect(segment.unitsOpened, "a rate of nothing in particular").toBeGreaterThan(0);
  });

  it("are stated for every other unit", () => {
    expect(segment.otherUnitsOpened).toBeGreaterThan(0);
  });
});

describe("what a search's counts are of", () => {
  it("is the catalogue's available stock, the sum of every segment's", () => {
    /* The room segments partition the catalogue, the unstated-rooms segment included. */
    expect(view.availableUnits).toBe(view.segments.reduce((n, s) => n + s.availableUnits, 0));
  });
});

describe("the place shares", () => {
  it("carry their display form on the segment's places", () => {
    expect(segment.attendedTo.every((a) => /^(<1%|\d+%)$/.test(a.shareDisplay))).toBe(true);
  });

  it("carry their display form on the categories", () => {
    expect(view.placeCategories.every((c) => /^(<1%|\d+%)$/.test(c.shareDisplay))).toBe(true);
  });
});
