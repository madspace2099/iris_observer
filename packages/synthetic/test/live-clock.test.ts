import { describe, expect, it } from "vitest";

import type { ShowroomSession } from "@observer/contracts";
import type { ShowroomSessionSource, Viewer } from "@observer/readmodels";

import { SyntheticObserverRepository } from "../src/repository";
import { PROJECTS, VIEWERS } from "../src/world";

/**
 * TWO CLOCKS.
 *
 * The defect this holds shut: the product's today was the synthetic world's
 * fixed day for every project, so a meeting a real showroom ingested after that
 * day fell outside every period and a correctly integrated project read "0
 * presentations" for ever. A project a source delivers for runs on the clock;
 * a synthetic one must not move.
 */

const madspace = VIEWERS.madspace as Viewer;
const NOW = new Date("2026-09-17T12:00:00.000Z");
const NO_FILTERS = { agentId: null, channel: null, outcome: null } as const;

const yesterday: ShowroomSession = {
  sessionId: "7a1c9f6e-2c7a-4a4e-9b31-0000000000aa",
  meetingId: "7a1c9f6e-2c7a-4a4e-9b31-0000000000aa",
  projectId: "prj_akhileshdemo1",
  agentId: "agent-guid",
  channel: "showroom",
  contactId: null,
  startedAt: "2026-09-16T10:00:00.000Z",
  endedAt: "2026-09-16T10:12:00.000Z",
  durationSeconds: 720,
  outcome: "interested",
  steps: [],
  units: [],
  environment: [],
  filters: [],
  places: [],
  screenshots: 0,
  irisRating: null,
  priorMeetings: 0,
  timingUnavailable: true,
};

const source: ShowroomSessionSource = {
  async sessionsFor(project) {
    if ((project.id as string) !== yesterday.projectId) return null;
    return { connector: "ue5_events", sessions: [yesterday], fetchedAt: NOW.toISOString() };
  },
};

const repository = new SyntheticObserverRepository({ sessionSource: source, now: () => NOW });

describe("a project a real source delivers for runs on the real clock", () => {
  it("counts a meeting ingested after the synthetic world's fixed day", async () => {
    const view = await repository.getMeetings(
      {
        viewer: madspace,
        tenantSlug: "madspace-integration",
        projectSlug: "akhilesh-demo-source",
        period: "last_28_days",
      },
      NO_FILTERS,
    );
    expect(view.periodTotal).toBe(1);
    expect(view.context.generatedAt).toBe(NOW.toISOString());
    /* Local midnight this morning in Bratislava, not the fixed 24 August. */
    expect(Date.parse(view.context.period.to)).toBe(Date.parse("2026-09-17T00:00:00.000+02:00"));
  });

  it("answers the port's own period question from the same clock", async () => {
    const demo = PROJECTS.find((p) => p.slug === "akhilesh-demo-source");
    if (demo === undefined) throw new Error("the demo project is missing from the world");
    const period = await repository.resolvePeriod(demo.id, "quarter_to_date");
    expect(Date.parse(period.from)).toBe(Date.parse("2026-07-01T00:00:00.000+02:00"));
    expect(Date.parse(period.to)).toBe(Date.parse("2026-09-17T00:00:00.000+02:00"));
    expect(period.baselineLabel).toBe("the same 78 days of the previous quarter");
  });

  it("leaves a synthetic project on the synthetic day", async () => {
    const view = await repository.getMeetings(
      { viewer: madspace, tenantSlug: "alpha", projectSlug: "northgate", period: "last_28_days" },
      NO_FILTERS,
    );
    expect(view.context.generatedAt).toBe("2026-08-24T09:00:00.000+02:00");
    expect(view.context.period.to).toBe("2026-08-24T00:00:00.000+02:00");
    expect(view.periodTotal).toBeGreaterThan(0);
  });
});
