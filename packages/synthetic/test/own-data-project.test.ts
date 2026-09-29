import { describe, expect, it } from "vitest";

import { ProjectIdSchema, TenantIdSchema, type ShowroomSession } from "@observer/contracts";
import {
  NOTHING_RECEIVED_YET,
  PRESENTER_NOT_NAMED,
  type ProjectDirectory,
  type ProjectSummary,
  type ShowroomSessionSource,
  type TenantSummary,
  type Viewer,
  DEFAULT_LANGUAGE,
} from "@observer/readmodels";

import { SyntheticObserverRepository } from "../src/repository";
import { SYNTHETIC_AGENTS } from "../src/showroom/sessions";
import { VIEWERS } from "../src/world";

/**
 * A PROJECT WITH NOTHING BEHIND IT BUT ITS OWN DATA TELLS THE TRUTH.
 *
 * Two truths in particular. Before its showroom has sent anything it does not
 * report a count of nought, a running showroom or a comparison of two people
 * who never presented there: it says nothing has arrived. And once meetings
 * come, each shows the name administration keeps for the identifier the
 * showroom sent, because MADSPACE made that a condition (2026-09-17), and a
 * name given on one project never appears on another's meetings.
 */

const NOW = new Date("2026-09-18T09:30:00.000Z");
const NO_FILTERS = { agentId: null, channel: null, outcome: null } as const;

const tenant: TenantSummary = {
  id: TenantIdSchema.parse("tnt_0123456789abcdef0123456789abcdef"),
  slug: "alder-homes",
  name: "Alder Homes",
};
const project: ProjectSummary = {
  id: ProjectIdSchema.parse("prj_fedcba9876543210fedcba9876543210"),
  tenantId: tenant.id,
  slug: "alder-court",
  name: "Alder Court",
  currency: "EUR",
  locale: "sk-SK",
  timeZone: "Europe/Bratislava",
  connectedSources: [],
  sources: [],
};
const directory: ProjectDirectory = {
  entries: async () => ({ tenants: [tenant], projects: [project] }),
};
const viewer: Viewer = {
  ...(VIEWERS.madspace as Viewer),
  tenantIds: [...VIEWERS.madspace.tenantIds, tenant.id],
  projectIds: [...VIEWERS.madspace.projectIds, project.id],
};
const query = {
  viewer,
  tenantSlug: tenant.slug,
  projectSlug: project.slug,
  period: "last_28_days",
  language: DEFAULT_LANGUAGE,
} as const;

function meeting(id: string, agentId: string, projectId: string): ShowroomSession {
  return {
    sessionId: id,
    meetingId: id,
    projectId,
    agentId,
    channel: "showroom",
    contactId: null,
    startedAt: "2026-09-17T10:00:00.000Z",
    endedAt: "2026-09-17T10:20:00.000Z",
    durationSeconds: 1200,
    outcome: "interested",
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

describe("before its showroom has sent anything", () => {
  const empty = new SyntheticObserverRepository({ projectDirectory: directory, now: () => NOW });

  it("says nothing has arrived, in the same words on every surface, and never a count", async () => {
    const meetings = await empty.getMeetings(query, NO_FILTERS);
    const home = await empty.getHome(query);
    const projectView = await empty.getProjectView(query, null);
    const flow = await empty.getSalesFlow(query);

    expect(meetings.emptyState).toBe(NOTHING_RECEIVED_YET);
    expect(home.verdict).toBe(NOTHING_RECEIVED_YET);
    expect(projectView.verdict).toBe(NOTHING_RECEIVED_YET);
    expect(flow.verdict).toBe(NOTHING_RECEIVED_YET);
    for (const words of [home.verdict, projectView.verdict, flow.verdict]) {
      expect(words).not.toMatch(/\b0\b|running/);
    }
  });

  it("draws no comparison, where the roster's pair used to stand in", async () => {
    const view = await empty.getPresentationIntelligence(query, {
      mode: "agents",
      left: null,
      right: null,
    });
    expect(view.comparison).toBeNull();
    const names = SYNTHETIC_AGENTS.map((a) => a.name);
    expect(names.some((name) => JSON.stringify(view).includes(name))).toBe(false);
  });

  it("offers nobody in the meeting filter", async () => {
    expect((await empty.getMeetings(query, NO_FILTERS)).options.agents).toEqual([]);
  });
});

describe("a quiet period on a showroom that works is still a count", () => {
  it("keeps the ordinary sentence for a synthetic project with an empty slice", async () => {
    const repository = new SyntheticObserverRepository({
      projectDirectory: directory,
      now: () => NOW,
    });
    const view = await repository.getMeetings(
      {
        viewer: VIEWERS.madspace as Viewer,
        tenantSlug: "madspace-integration",
        projectSlug: "akhilesh-demo-source",
        period: "last_28_days",
        language: DEFAULT_LANGUAGE,
      },
      NO_FILTERS,
    );
    expect(view.emptyState).not.toBe(NOTHING_RECEIVED_YET);
    expect(view.emptyState).toMatch(/^No presentations were recorded on /);
  });
});

describe("every meeting shows who presented it", () => {
  const named = meeting("7a1c9f6e-2c7a-4a4e-9b31-0000000000c1", "AG-1", project.id as string);
  const unnamed = meeting("7a1c9f6e-2c7a-4a4e-9b31-0000000000c2", "AG-2", project.id as string);
  const elsewhere = meeting("7a1c9f6e-2c7a-4a4e-9b31-0000000000c3", "AG-1", "prj_akhileshdemo1");

  const sessions: ShowroomSessionSource = {
    sessionsFor: async (p) => {
      if (p.id === project.id) {
        return {
          connector: "ue5_events",
          sessions: [named, unnamed],
          fetchedAt: NOW.toISOString(),
          agentNames: { "AG-1": "Monika Kováčová" },
        };
      }
      if ((p.id as string) === "prj_akhileshdemo1") {
        return { connector: "ue5_events", sessions: [elsewhere], fetchedAt: NOW.toISOString() };
      }
      return null;
    },
  };
  const live = new SyntheticObserverRepository({
    projectDirectory: directory,
    sessionSource: sessions,
    now: () => NOW,
  });

  it("by the name administration keeps, and by a stated absence where there is none yet", async () => {
    /*
     * AG-2 is named by nobody. It used to appear as "AG-2" in the name's
     * place, which is an identifier wearing a name's clothes; it now says so
     * and keeps the identifier, because that identifier is the only thing
     * separating this unnamed presenter from the next one.
     */
    const unnamedWord = `${PRESENTER_NOT_NAMED} · AG-2`;
    const view = await live.getMeetings(query, NO_FILTERS);
    const byMeeting = new Map(view.rows.map((row) => [row.meetingId, row.agentName]));
    expect(byMeeting.get(named.meetingId)).toBe("Monika Kováčová");
    expect(byMeeting.get(unnamed.meetingId)).toBe(unnamedWord);
    // The filter offers them too: a presenter nobody named is still somebody a
    // reader may want to filter to, and dropping the option would hide meetings.
    expect(view.options.agents.map((o) => o.label).sort()).toEqual([
      "Monika Kováčová",
      unnamedWord,
    ]);

    const agents = await live.listAgents(query);
    expect(agents.map((a) => a.name).sort()).toEqual(["Monika Kováčová", unnamedWord]);
  });

  it("on the replay too, with a way through to that person's page", async () => {
    const replay = await live.getMeetingReplay({
      viewer,
      tenantSlug: tenant.slug,
      projectSlug: project.slug,
      meetingId: named.meetingId as never,
      language: DEFAULT_LANGUAGE,
    });
    expect(replay.agentName).toBe("Monika Kováčová");
    expect(replay.agentHref).toBe("/alder-homes/alder-court/agents/AG-1");
  });

  it("and never on another project's meetings, where the same identifier is somebody else", async () => {
    /* The named project is built first, so its names are in the overlay when the other is read. */
    await live.getMeetings(query, NO_FILTERS);
    const other = await live.getMeetings(
      {
        viewer: VIEWERS.madspace as Viewer,
        tenantSlug: "madspace-integration",
        projectSlug: "akhilesh-demo-source",
        period: "last_28_days",
        language: DEFAULT_LANGUAGE,
      },
      NO_FILTERS,
    );
    /*
     * The SAME identifier, unnamed here. A name given on one development must
     * not travel to another's meetings, so AG-1 is Monika above and an unnamed
     * presenter on this project — and the absence is stated rather than
     * rendered as the id, exactly as it is anywhere else.
     */
    expect(other.rows.map((row) => row.agentName)).toEqual([`${PRESENTER_NOT_NAMED} · AG-1`]);
  });
});
