import { afterEach, describe, expect, it } from "vitest";
import type { CrmDeal, ShowroomSession } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildSalesFlow, bucketBounds, trend, DEADBAND } from "../src/showroom/views3";
import { provideCatalogue, type RawUnit } from "../src/pulse";

/**
 * The verdict's judgment mechanism, and the month-clipping bug it exposed.
 *
 * These sessions are hand-placed rather than drawn from the shared synthetic
 * dataset on purpose: the point under test is `buildSalesFlow`'s own
 * threshold logic (the deadband, the week/month fallback, the clip), not
 * whatever ISTER TOWER's fixture happens to contain today. Pinning a fixture
 * number here would fail the moment that dataset grows and teach the next
 * reader to update the number instead of to read the assertion — the same
 * reasoning `screens.test.ts` states for the read models proper.
 */

const DAY = 24 * 60 * 60 * 1000;

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

let seq = 0;
function session(startedAt: Date, outcome: ShowroomSession["outcome"]): ShowroomSession {
  seq += 1;
  return {
    sessionId: `s${seq}`,
    meetingId: `m${seq}`,
    projectId: "prj_test",
    agentId: "agent_test",
    channel: "showroom",
    contactId: null,
    startedAt: startedAt.toISOString(),
    endedAt: startedAt.toISOString(),
    durationSeconds: 600,
    outcome,
    steps: [],
    units: [],
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  };
}

// `tenant.slug`, `project.slug`, `project.locale` and `period.to` are the
// fields `buildSalesFlow` reads; everything else here is a type-satisfying
// stand-in. `period.to` is year 9999 on purpose: every test below places
// sessions around its own `today` and exercises the week/month recency
// path (`stillRunning`), so the period must outlast any `today` used here
// without needing a per-test value. The closed-period path (`period.to` in
// the past) has its own describe block further down, with its own context.
const CONTEXT = {
  tenant: { slug: "test-tenant" },
  project: { slug: "test-project", locale: "en-GB" },
  period: { to: utc(9999, 0, 1).toISOString(), label: "the period", baselineLabel: "before" },
} as unknown as ViewContext;

describe("trend — classification immediately below, at, and above every cutoff", () => {
  // Each floor has two boundaries: `floor - DEADBAND` (the down/flat line)
  // and `floor` itself (the flat/up line). Checked one step (0.001) to
  // either side of each, plus exactly on it, so the table this produces is
  // the actual behaviour at the edges, not an inference from "tests pass".
  it.each([
    [0.8, "just below the lower edge (0.749)", 0.749, "down"],
    [0.8, "at the lower edge exactly (0.75)", 0.75, "flat"],
    [0.8, "just above the lower edge (0.751)", 0.751, "flat"],
    [0.8, "just below the floor (0.799)", 0.799, "flat"],
    [0.8, "at the floor exactly (0.8)", 0.8, "up"],
    [0.8, "just above the floor (0.801)", 0.801, "up"],
    [0.9, "just below the lower edge (0.849)", 0.849, "down"],
    [0.9, "at the lower edge exactly (0.85)", 0.85, "flat"],
    [0.9, "just above the lower edge (0.851)", 0.851, "flat"],
    [0.9, "just below the floor (0.899)", 0.899, "flat"],
    [0.9, "at the floor exactly (0.9)", 0.9, "up"],
    [0.9, "just above the floor (0.901)", 0.901, "up"],
  ] as const)("floor=%s, %s -> %s", (floor, _label, ratio, expected) => {
    expect(trend(ratio, floor)).toBe(expected);
  });

  it("the band is exactly 0.05 on both floors this file uses", () => {
    expect(DEADBAND).toBe(0.05);
  });
});

describe("bucketBounds — last month clipped like last week already is", () => {
  it("first day of a month: last month is clipped to a single day", () => {
    const bounds = bucketBounds(utc(2027, 4, 1)); // 1 May 2027
    const lastMonth = bounds.find((b) => b.id === "last_month");
    expect(lastMonth?.label).toBe("Last month, first 1 day");
    expect(lastMonth?.from).toBe(Date.UTC(2027, 3, 1));
    expect((lastMonth?.to ?? 0) - (lastMonth?.from ?? 0)).toBe(DAY);
  });

  it("last day of a month at least as long as the one before it: no clip needed", () => {
    const bounds = bucketBounds(utc(2027, 6, 31)); // 31 July 2027 — June has 30 days
    const lastMonth = bounds.find((b) => b.id === "last_month");
    expect(lastMonth?.label).toBe("Last month");
    expect(lastMonth?.from).toBe(Date.UTC(2027, 5, 1));
    expect(lastMonth?.to).toBe(Date.UTC(2027, 6, 1)); // the whole of June
  });

  it("a shorter previous month cannot be clipped past its own length", () => {
    // 29 March 2027 — 29 days into March, but February 2027 (non-leap) only
    // has 28. The guard must show all of February rather than ask it for a
    // 29th day it does not have, and label it as complete, not clipped.
    const bounds = bucketBounds(utc(2027, 2, 29));
    const lastMonth = bounds.find((b) => b.id === "last_month");
    expect(lastMonth?.label).toBe("Last month");
    expect(lastMonth?.from).toBe(Date.UTC(2027, 1, 1));
    expect(lastMonth?.to).toBe(Date.UTC(2027, 2, 1)); // the whole of February, 28 days
  });
});

describe("buildSalesFlow verdict — every reachable state", () => {
  it("no outcomes recorded: reuses the opening screen's own sentence", () => {
    const today = utc(2027, 5, 15);
    const sessions = Array.from({ length: 10 }, () => session(today, "skipped"));
    const view = buildSalesFlow(CONTEXT, sessions, today, []);
    expect(view.verdict).toBe("The showroom is running; no outcomes are being recorded.");
  });

  it("too early to call: no prior period to compare against", () => {
    const today = utc(2027, 5, 15);
    const thisWeek = Array.from({ length: 8 }, (_, i) =>
      session(today, i < 5 ? "purchase" : "not_interested"),
    );
    const view = buildSalesFlow(CONTEXT, thisWeek, today, []);
    expect(view.verdict).toBe(
      "Too early to call: 8 meetings this week, and 63% of recorded meetings progressed this week. There's no earlier comparable period yet.",
    );
  });

  it("good: both volume and progression clearly up", () => {
    const today = utc(2027, 5, 20); // a Sunday, so "last week" is a full, unclipped 7 days
    const lastWeekStart = new Date(today.getTime() - 7 * DAY);
    const sessions = [
      ...Array.from({ length: 4 }, () => session(lastWeekStart, "purchase")),
      ...Array.from({ length: 6 }, () => session(lastWeekStart, "not_interested")),
      ...Array.from({ length: 6 }, () => session(today, "purchase")),
      ...Array.from({ length: 4 }, () => session(today, "not_interested")),
    ];
    const view = buildSalesFlow(CONTEXT, sessions, today, []);
    expect(view.verdict).toBe(
      "Meetings are holding up and progressing well: 10 meetings this week against 10 last week, and 60% of recorded meetings progressed, against 40% before.",
    );
  });

  it("good, deadbanded, does not claim the figure went up when it actually dipped", () => {
    // This is the case the live fixture surfaced: the ratio (6/13 ≈ 0.46
    // against a baseline of 0.50) clears the 0.9 floor, so the deadband
    // correctly calls the *signal* "good" — but 46% is still less than 50%,
    // and printing "up from 50%" next to a true 46% would be a false
    // sentence, not a rounding nicety. The wording must say "against", never
    // assert a direction the raw figures do not support.
    const today = utc(2027, 5, 20);
    const lastWeekStart = new Date(today.getTime() - 7 * DAY);
    const sessions = [
      ...Array.from({ length: 5 }, () => session(lastWeekStart, "purchase")),
      ...Array.from({ length: 5 }, () => session(lastWeekStart, "not_interested")),
      ...Array.from({ length: 6 }, () => session(today, "purchase")),
      ...Array.from({ length: 7 }, () => session(today, "not_interested")),
    ];
    const view = buildSalesFlow(CONTEXT, sessions, today, []);
    expect(view.verdict).toBe(
      "Meetings are holding up and progressing well: 13 meetings this week against 10 last week, and 46% of recorded meetings progressed, against 50% before.",
    );
    expect(view.verdict).not.toContain("up from");
  });

  it("poor: both volume and progression clearly down", () => {
    const today = utc(2027, 5, 20);
    const lastWeekStart = new Date(today.getTime() - 7 * DAY);
    const sessions = [
      ...Array.from({ length: 5 }, () => session(lastWeekStart, "purchase")),
      ...Array.from({ length: 5 }, () => session(lastWeekStart, "not_interested")),
      ...Array.from({ length: 6 }, () => session(today, "not_interested")),
    ];
    const view = buildSalesFlow(CONTEXT, sessions, today, []);
    expect(view.verdict).toBe(
      "Worth a look: 6 meetings this week against 10 last week, and 0% of recorded meetings progressed, against 50% before.",
    );
  });

  it("attention: volume up, progression down — a genuine mix, not a verdict", () => {
    const today = utc(2027, 5, 20);
    const lastWeekStart = new Date(today.getTime() - 7 * DAY);
    const sessions = [
      ...Array.from({ length: 5 }, () => session(lastWeekStart, "purchase")),
      ...Array.from({ length: 5 }, () => session(lastWeekStart, "not_interested")),
      ...Array.from({ length: 3 }, () => session(today, "purchase")),
      ...Array.from({ length: 7 }, () => session(today, "not_interested")),
    ];
    const view = buildSalesFlow(CONTEXT, sessions, today, []);
    expect(view.verdict).toBe(
      "A mixed signal: 10 meetings this week against 10 last week, and 30% of recorded meetings progressed, against 50% before.",
    );
  });

  it("one meeting's difference does not flip good to poor (the deadband)", () => {
    // Identical to the "good" case above, but last week had one more meeting
    // (11 instead of 10): the raw ratio (10/11 ≈ 0.91) is still comfortably
    // "up" by the 0.8 floor, so this is really checking the boundary case
    // sits where intended, not a regression risk on its own — the meaningful
    // guard is the next test, where the ratio actually lands in the band.
    const today = utc(2027, 5, 20);
    const lastWeekStart = new Date(today.getTime() - 7 * DAY);
    const sessions = [
      ...Array.from({ length: 4 }, () => session(lastWeekStart, "purchase")),
      ...Array.from({ length: 7 }, () => session(lastWeekStart, "not_interested")),
      ...Array.from({ length: 6 }, () => session(today, "purchase")),
      ...Array.from({ length: 4 }, () => session(today, "not_interested")),
    ];
    const view = buildSalesFlow(CONTEXT, sessions, today, []);
    expect(view.verdict).toContain("Meetings are holding up and progressing well");
  });

  it("a ratio inside the deadband reads as attention, not a flipped verdict", () => {
    // 10 this week against 13 last week: 10/13 ≈ 0.769, which is below the
    // 0.8 floor but inside the 0.05 band around it (>= 0.75) — a swing this
    // small must not tip an otherwise-good progression reading to "poor".
    const today = utc(2027, 5, 20);
    const lastWeekStart = new Date(today.getTime() - 7 * DAY);
    const sessions = [
      ...Array.from({ length: 5 }, () => session(lastWeekStart, "purchase")),
      ...Array.from({ length: 8 }, () => session(lastWeekStart, "not_interested")),
      ...Array.from({ length: 6 }, () => session(today, "purchase")),
      ...Array.from({ length: 4 }, () => session(today, "not_interested")),
    ];
    const view = buildSalesFlow(CONTEXT, sessions, today, []);
    expect(view.verdict).toContain("A mixed signal");
    expect(view.verdict).not.toContain("Worth a look");
    expect(view.verdict).not.toContain("holding up");
  });

  it("falls back to month when the week is too thin, and last month is clipped to match", () => {
    // 12 April 2027 is a Monday, so "this week" and "last week" are each a
    // single day (12 and 5 April) — thin enough to force the month fallback
    // while leaving the rest of April and all of March free of week-bucket
    // overlap, which is what lets the fixture below place sessions without
    // fighting two bucket definitions at once.
    //
    // Last month (March) must be clipped to its first 12 days, matching the
    // 12 elapsed in April — exactly the clip this week's own bucket already
    // gets. Sessions placed after day 12 of March must be invisible to the
    // comparison; if the clip were not applied they would change the reading.
    const today = utc(2027, 3, 12); // 12 April 2027
    const sessions = [
      session(utc(2027, 3, 12), "purchase"), // this week (= today)
      session(utc(2027, 3, 5), "purchase"), // last week
      ...Array.from({ length: 4 }, (_, i) => session(utc(2027, 3, 1 + i), "purchase")), // this month, 1-4 Apr
      ...Array.from({ length: 4 }, (_, i) => session(utc(2027, 3, 8 + i), "not_interested")), // this month, 8-11 Apr
      ...Array.from({ length: 3 }, () => session(utc(2027, 2, 2), "purchase")), // last month, 2 Mar (inside the clip)
      ...Array.from({ length: 7 }, (_, i) => session(utc(2027, 2, 5 + i), "not_interested")), // last month, 5-11 Mar (inside the clip)
      ...Array.from({ length: 15 }, () => session(utc(2027, 2, 20), "purchase")), // last month, 20 Mar — outside the clip, must be excluded
    ];
    const view = buildSalesFlow(CONTEXT, sessions, today, []);
    // This month: 1+1+4+4 = 10 meetings, 6 progressed (purchase) = 60%.
    // Last month, clipped to 1-12 March: 3+7 = 10 meetings, 3 progressed = 30%.
    // The 15 sessions on 20 March are outside the clip and must not appear.
    expect(view.verdict).toBe(
      "Meetings are holding up and progressing well: 10 meetings this month against 10 last month, first 12 days, and 60% of recorded meetings progressed, against 30% before.",
    );
  });
});

describe("buildSalesFlow verdict — a closed period, viewed after it ended", () => {
  // `today` is always in August; every closed-period test below places its
  // sessions in spring, so "this week"/"this month" relative to the real
  // clock contain none of them — the exact shape of the bug this describe
  // block exists to prove fixed. `period.to` in the past is what makes
  // `stillRunning` false and switches `buildSalesFlow` onto the whole-period
  // path instead of the recency buckets the block above tests.
  const TODAY = utc(2027, 7, 24); // 24 August 2027
  const CLOSED_CONTEXT = {
    tenant: { slug: "test-tenant" },
    project: { slug: "test-project", locale: "en-GB" },
    period: {
      to: utc(2027, 3, 1).toISOString(), // period ended 1 April 2027 — well before TODAY
      label: "the selected quarter",
      baselineLabel: "the quarter before",
    },
  } as unknown as ViewContext;

  it("regression: recorded outcomes in a closed period must not read as none, just because 'this week' (relative to today) contains none of them", () => {
    // 61 sessions in spring, nowhere near `today` in August — the exact
    // dataset shape that made the old week/month-bucket verdict read
    // "no outcomes are being recorded" while the ring two sections down,
    // built from the same `sessions`, showed 56 of 61 decided.
    const sessions = [
      ...Array.from({ length: 56 }, (_, i) => session(utc(2027, 2, 1 + (i % 28)), "purchase")),
      ...Array.from({ length: 5 }, (_, i) => session(utc(2027, 2, 2 + i), "skipped")),
    ];
    const view = buildSalesFlow(CLOSED_CONTEXT, sessions, TODAY, []);
    expect(view.verdict).not.toBe("The showroom is running; no outcomes are being recorded.");
    expect(view.verdict).toContain("61 meetings");
  });

  it("no baseline: a closed period with an empty previous period reads as too-early, not as a week-over-week comparison", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session(utc(2027, 2, 1 + i), i < 5 ? "purchase" : "not_interested"),
    );
    const view = buildSalesFlow(CLOSED_CONTEXT, sessions, TODAY, []);
    expect(view.verdict).toBe(
      "Too early to call: 8 meetings the selected quarter, and 63% of recorded meetings progressed the selected quarter. There's no earlier comparable period yet.",
    );
  });

  it("compares the whole selected period against the whole baseline period, by label, not by week or month", () => {
    const sessions = Array.from(
      { length: 10 },
      (_, i) => session(utc(2027, 2, 1 + i), i < 6 ? "purchase" : "not_interested"), // 60% progressed
    );
    const previous = Array.from(
      { length: 10 },
      (_, i) => session(utc(2027, 0, 1 + i), i < 3 ? "purchase" : "not_interested"), // 30% progressed
    );
    const view = buildSalesFlow(CLOSED_CONTEXT, sessions, TODAY, previous);
    expect(view.verdict).toBe(
      "Meetings are holding up and progressing well: 10 meetings the selected quarter against 10 the quarter before, and 60% of recorded meetings progressed, against 30% before.",
    );
  });
});

/*
 * ============================================================================
 * THE DEAL LADDER'S UNIT LINKS — the same "does the catalogue actually hold
 * this code" contract `screens.test.ts`'s "the register's unit references"
 * pins for the meeting register, checked here for the stalled-deal list
 * `buildSalesFlow` draws through `buildDealLadder`. `buildSalesFlow` is
 * called directly (as every other test in this file does) rather than
 * through the repository, so the catalogue seam below (`provideCatalogue`)
 * is the same one a live connector writes to, undisturbed by
 * `overlayCatalogue`'s per-request reset — nothing here calls the
 * repository, so nothing wipes it mid-test.
 * ============================================================================
 */
describe("the deal ladder's unit references follow the register's own contract", () => {
  const DEAL_PROJECT_ID = "prj_test_deal_ladder_only"; // never a real project: isolation is provable, not coincidental
  const DEAL_CONTEXT = {
    tenant: { slug: "test-tenant" },
    project: {
      id: DEAL_PROJECT_ID,
      slug: "test-project",
      locale: "en-GB",
      timeZone: "UTC",
    },
    period: { to: utc(9999, 0, 1).toISOString(), label: "the period", baselineLabel: "before" },
  } as unknown as ViewContext;

  function deal(externalId: string, unitCode: string | null): CrmDeal {
    return {
      externalId,
      unitCode,
      subjectKey: null,
      stage: "negotiation", // an OPEN stage, so it appears in `stalled`
      stageRaw: "Negotiating",
      stageEnteredAt: utc(2027, 0, 1).toISOString(),
      openedAt: utc(2026, 11, 1).toISOString(),
      updatedAt: utc(2027, 0, 1).toISOString(),
      won: null,
      lost: null,
    };
  }

  afterEach(() => {
    provideCatalogue(DEAL_PROJECT_ID, null); // never leak a fixture catalogue into another file
  });

  /** Narrows `DealLadder`'s "not connected" branch away, for a ladder built from real deals. */
  function stalledOf(ladder: ReturnType<typeof buildSalesFlow>["ladder"]) {
    if (ladder.source === "not_connected") throw new Error("expected a CRM-backed ladder");
    return ladder.stalled;
  }

  it("links a stalled deal's unit only when THIS project's own catalogue holds the code — a code that is real elsewhere does not satisfy it", () => {
    const ownCode: RawUnit = {
      code: "T-101",
      block: "T",
      floor: 1,
      rooms: 2,
      areaSqm: 55,
      orientation: "N",
      price: 200_000,
      status: "available",
    };
    provideCatalogue(DEAL_PROJECT_ID, [ownCode]);

    const deals = {
      connector: "realpad" as const,
      fetchedAt: utc(2027, 0, 2).toISOString(),
      deals: [
        deal("d-own", "T-101"), // this project's own catalogue: linked
        deal("d-foreign", "A-402"), // a REAL Northgate code -- not in THIS catalogue: not linked
        deal("d-freetext", "LEGACY-SPREADSHEET-CODE"), // no catalogue anywhere: readable, not linked
        deal("d-none", null), // the source stated no unit at all
      ],
    };

    const view = buildSalesFlow(DEAL_CONTEXT, [], utc(2027, 0, 10), [], deals);
    const byId = new Map(stalledOf(view.ladder).map((s) => [s.externalId, s]));

    expect(byId.get("d-own")?.unitHref).toBe("/test-tenant/test-project/units/T-101");
    expect(byId.get("d-own")?.unitCode).toBe("T-101"); // the code itself is always readable

    expect(byId.get("d-foreign")?.unitHref).toBeNull();
    expect(byId.get("d-foreign")?.unitCode).toBe("A-402"); // still shown, just not a link to nowhere

    expect(byId.get("d-freetext")?.unitHref).toBeNull();
    expect(byId.get("d-freetext")?.unitCode).toBe("LEGACY-SPREADSHEET-CODE");

    expect(byId.get("d-none")?.unitHref).toBeNull();
    expect(byId.get("d-none")?.unitCode).toBeNull();
  });

  it("encodes a catalogue code that needs it, rather than dropping the character or leaving it raw in the path", () => {
    const spacedCode: RawUnit = {
      code: "A 4/02", // a space and a slash: neither is a valid raw path segment
      block: "A",
      floor: 4,
      rooms: 3,
      areaSqm: 78,
      orientation: "S",
      price: 260_000,
      status: "reserved",
    };
    provideCatalogue(DEAL_PROJECT_ID, [spacedCode]);

    const deals = {
      connector: "realpad" as const,
      fetchedAt: utc(2027, 0, 2).toISOString(),
      deals: [deal("d-spaced", "A 4/02")],
    };

    const view = buildSalesFlow(DEAL_CONTEXT, [], utc(2027, 0, 10), [], deals);
    const stalled = stalledOf(view.ladder).find((s) => s.externalId === "d-spaced");
    expect(stalled?.unitHref).toBe(
      `/test-tenant/test-project/units/${encodeURIComponent("A 4/02")}`,
    );
    // Concretely, not just "whatever encodeURIComponent does" -- pinned so a
    // future switch to a different escaping function is a visible diff here.
    expect(stalled?.unitHref).toBe("/test-tenant/test-project/units/A%204%2F02");
  });
});
