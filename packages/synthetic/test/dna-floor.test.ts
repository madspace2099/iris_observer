import { describe, expect, it } from "vitest";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type { ShowroomSession, ShowroomStep } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildPresentationIntelligence } from "../src/showroom/project";

/**
 * Presentation DNA claims no more than it has meetings for.
 *
 * ## Two shapes, told apart
 *
 * A side with NO meetings is an absence: `share()` divides by nought as 0, and
 * a lane nobody presented came out as "0%" on every behaviour — on the review
 * project's default view, about a named colleague. There is no comparison at
 * all in that case, and the read model says who was absent.
 *
 * A side with FEWER meetings than `AGENT_MIN_SAMPLE` is a small sample. The
 * lanes stay as raw figures with their counts in their headers; the finding and
 * the differences — the comparative claims — are withheld, with the reason.
 *
 * ## Why constructed
 *
 * The fixtures hold both shapes (ister-tower's default pair is 23 and 0; the
 * shared quarter's pair is 19 and 22), but a fixture moves with every scenario
 * change, and a test that reads "19" from one cannot say why 19 matters. These
 * sessions are built at the floor, one under it, and none.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_dna_floor"; // never a real project: isolation is provable, not coincidental

function step(ordinal: number, sectionId: ShowroomStep["sectionId"]): ShowroomStep {
  return {
    ordinal,
    sectionId,
    itemId: null,
    itemLabel: null,
    enteredAt: null,
    dwellSeconds: 30,
    isReturn: false,
    availability: "legacy_available",
  };
}

function session(
  meetingId: string,
  agentId: string,
  steps: readonly ShowroomStep[],
): ShowroomSession {
  return {
    sessionId: `s-${meetingId}`,
    meetingId,
    projectId: PROJECT_ID,
    agentId,
    channel: "showroom",
    contactId: null,
    startedAt: "2026-03-12T14:30:00.000Z",
    endedAt: "2026-03-12T15:00:00.000Z",
    durationSeconds: 1_800,
    outcome: "presentation_only",
    steps,
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

const CONTEXT = {
  tenant: { slug: "test-tenant" },
  project: {
    id: PROJECT_ID,
    slug: "test-project",
    locale: "en-GB",
    timeZone: "Europe/Bratislava",
    connectedSources: [],
  },
  period: { to: "9999-01-01T00:00:00.000Z", label: "This quarter", baselineLabel: "last quarter" },
} as unknown as ViewContext;

/** Opens Compare mode — the behaviour the two sides are built to differ on. */
const compares = (i: number, agentId = "agent_test") =>
  session(`mtg_c${i}`, agentId, [step(1, "home"), step(2, "compare"), step(3, "residences")]);
/** Never opens it. */
const plain = (i: number, agentId = "agent_test") =>
  session(`mtg_p${i}`, agentId, [step(1, "home"), step(2, "residences")]);
const many = (n: number, make: (i: number) => ShowroomSession) =>
  Array.from({ length: n }, (_, i) => make(i));

const periods = (current: readonly ShowroomSession[], previous: readonly ShowroomSession[]) =>
  buildPresentationIntelligence(CONTEXT, current, previous, "periods", null, null);

describe("a side with no meetings is an absence, not a rate", () => {
  const absent = periods(many(25, compares), []);

  it("draws no comparison when the previous period has no meetings", () => {
    expect(
      absent.comparison,
      "a lane of nought meetings was compared, and 0% of nothing drawn as its rate",
    ).toBeNull();
  });

  it("says what was absent", () => {
    expect(absent.noComparison).toMatch(/no meetings in last quarter/i);
  });

  /* The review project's own shape: Monika presented, the roster still names Akhilesh beside her. */
  const roster = buildPresentationIntelligence(
    CONTEXT,
    many(25, (i) => compares(i, "agt_monika")),
    [],
    "agents",
    "agt_monika",
    "agt_akhilesh",
  );

  it("draws no comparison for a rostered agent who presented no meeting", () => {
    expect(
      roster.comparison,
      "a colleague with no meetings on the project was compared as 0% on every behaviour",
    ).toBeNull();
  });

  it("names who was absent", () => {
    /* `String()` so a null reads as "null" in the failure, not as an invalid assertion. */
    expect(String(roster.noComparison)).toContain("Akhilesh Undev");
  });
});

describe("under the floor, the lanes stay and the verdict goes", () => {
  /* 19 against 25, Compare mode on every meeting of one side and none of the other: a 100-point gap. */
  const under = periods(many(AGENT_MIN_SAMPLE - 1, compares), many(25, plain));

  it("keeps both lanes, with their counts", () => {
    expect(under.comparison?.left.meetingCount).toBe(AGENT_MIN_SAMPLE - 1);
  });

  it("withholds every difference", () => {
    expect(
      under.comparison?.differences,
      "a difference was presented on fewer meetings than the floor",
    ).toEqual([]);
  });

  it("names the floor it withheld them for", () => {
    expect(
      String(under.comparison?.verdictRefusal),
      "the differences went silent without a stated reason",
    ).toContain(String(AGENT_MIN_SAMPLE));
  });

  it("draws no finding", () => {
    expect(under.findings, "a verdict was drawn under the floor").toEqual([]);
  });
});

describe("at the floor, the comparison speaks", () => {
  /* Guards the guard: a floor that silenced everything would pass every test above. */
  const at = periods(many(AGENT_MIN_SAMPLE, compares), many(AGENT_MIN_SAMPLE, plain));

  it("presents the difference", () => {
    expect(at.comparison?.differences.map((d) => d.id)).toContain("compare_used");
  });

  it("carries no refusal", () => {
    expect(at.comparison?.verdictRefusal).toBeNull();
  });

  it("draws the finding", () => {
    expect(at.findings.map((f) => f.id)).toContain("difference-compare_used");
  });
});
