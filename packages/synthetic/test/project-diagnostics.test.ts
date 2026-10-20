import { describe, expect, it } from "vitest";

import { ProjectIdSchema, TenantIdSchema, type ShowroomSession } from "@observer/contracts";
import {
  DEFAULT_LANGUAGE,
  NotPermittedError,
  type ProjectSummary,
  type TenantSummary,
  type Viewer,
} from "@observer/readmodels";

import { SyntheticObserverRepository } from "../src/repository";
import { VIEWERS } from "../src/world";

/**
 * PROJECT DIAGNOSTICS COUNT AGAINST THEIR OWN DENOMINATORS, AND ABSENT STAYS ABSENT.
 *
 * MADSPACE reads one row per client project (ADR-0047). Each window's meetings
 * are the meetings the project's own screens count for that window; a project
 * without a CRM has no deal count rather than a count of nought; and nobody but
 * MADSPACE can read any of it.
 */

const repo = new SyntheticObserverRepository();
const query = (viewer: Viewer, tenantSlug: string, projectSlug: string) => ({
  viewer,
  tenantSlug,
  projectSlug,
  period: "quarter_to_date" as const,
  language: DEFAULT_LANGUAGE,
});
const madspace = VIEWERS.madspace as Viewer;

describe("project diagnostics", () => {
  it("names both windows and counts the meetings the project's own slice counts", async () => {
    const view = await repo.getProjectDiagnostics(query(madspace, "shark", "shark-residence"));
    expect(view.windows.map((w) => w.period.preset)).toEqual(["last_28_days", "quarter_to_date"]);

    for (const window of view.windows) {
      const slice = await repo.getSessionSlice({
        ...query(madspace, "shark", "shark-residence"),
        period: window.period.preset,
      });
      expect(window.meetings).toBe(slice.sessions.length);
      const meetings = window.meetings ?? Number.NaN;
      expect(window.outcomeRecorded ?? Number.NaN).toBeLessThanOrEqual(meetings);
      expect(window.webiris).toBeLessThanOrEqual(meetings);
      expect(window.rosterPresenting).not.toBeNull();
      /* Every synthetic presenter is on the roster. */
      expect(window.offRoster).toBe(0);
      expect(window.presenters).toBe((window.rosterPresenting ?? 0) + (window.offRoster ?? 0));
      expect(window.rosterPresenting ?? 0).toBeLessThanOrEqual(view.roster ?? 0);
      expect(window.unitsOpened).toBeLessThanOrEqual(view.catalogueUnits ?? 0);
    }
    /* No window holds more meetings than were recorded to date. */
    expect(view.windows.every((w) => w.meetings !== null && w.meetings <= view.recorded)).toBe(
      true,
    );
    expect(view.data).toBe("demonstration");
    expect(view.roster).toBeGreaterThan(0);
    expect(view.crm.connected).toBe(true);
    expect(view.crm.deals).toBeGreaterThan(0);
  });

  it("states a missing CRM as absent, never as nought deals or nought outcomes", async () => {
    const view = await repo.getProjectDiagnostics(query(madspace, "alpha", "riverside"));
    expect(view.crm.connected).toBe(false);
    expect(view.crm.deals).toBeNull();
    for (const window of view.windows) {
      expect(window.meetings).toBeGreaterThan(0);
      expect(window.outcomeRecorded).toBeNull();
    }
  });

  it("does not age a fixture's August feeds against the real clock once its showroom delivers", async () => {
    const now = new Date("2026-10-20T10:00:00.000Z");
    const meeting: ShowroomSession = {
      sessionId: "7a1c9f6e-2c7a-4a4e-9b31-0000000000bb",
      meetingId: "7a1c9f6e-2c7a-4a4e-9b31-0000000000bb",
      projectId: "prj_akhileshdemo1",
      agentId: "agent-guid",
      channel: "showroom",
      contactId: null,
      startedAt: "2026-10-20T08:00:00.000Z",
      endedAt: "2026-10-20T08:12:00.000Z",
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
    const delivering = new SyntheticObserverRepository({
      now: () => now,
      sessionSource: {
        async sessionsFor(project) {
          if ((project.id as string) !== meeting.projectId) return null;
          return { connector: "ue5_events", sessions: [meeting], fetchedAt: now.toISOString() };
        },
      },
    });
    const view = await delivering.getProjectDiagnostics(
      query(madspace, "madspace-integration", "akhilesh-demo-source"),
    );
    expect(view.data).toBe("delivered");
    expect(view.asOf).toBe(now.toISOString());
    expect(view.lastMeetingAt).toBe(meeting.startedAt);
    expect(view.sources.length).toBeGreaterThan(0);
    for (const source of view.sources) {
      expect(source.tracked).toBe(false);
      expect(source.lastSeenAt).toBeNull();
      expect(source.ageHours).toBeNull();
      expect(source.stale).toBe(false);
    }
  });

  it("states meetings as absent where no feed could deliver one", async () => {
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
    const own = new SyntheticObserverRepository({
      now: () => new Date("2026-10-20T10:00:00.000Z"),
      projectDirectory: { entries: async () => ({ tenants: [tenant], projects: [project] }) },
    });
    const viewer: Viewer = {
      ...madspace,
      tenantIds: [...madspace.tenantIds, tenant.id],
      projectIds: [...madspace.projectIds, project.id],
    };
    const view = await own.getProjectDiagnostics(query(viewer, tenant.slug, project.slug));
    expect(view.data).toBe("own");
    for (const window of view.windows) {
      expect(window.meetings).toBeNull();
      expect(window.outcomeRecorded).toBeNull();
    }
  });

  it("flags a feed last seen more than a day before the project's today", async () => {
    const views = await Promise.all([
      repo.getProjectDiagnostics(query(madspace, "alpha", "northgate")),
      repo.getProjectDiagnostics(query(madspace, "shark", "shark-residence")),
    ]);
    for (const view of views) {
      for (const source of view.sources) {
        if (source.ageHours === null) expect(source.stale).toBe(false);
        else expect(source.stale).toBe(source.ageHours >= 24);
      }
    }
    /* Northgate's catalogue was last seen three days before the synthetic today. */
    expect(views[0]?.sources.find((s) => s.kind === "catalogue")?.stale).toBe(true);
  });

  it("is refused to everybody but MADSPACE", async () => {
    await expect(
      repo.getProjectDiagnostics(
        query(VIEWERS.developerShark as Viewer, "shark", "shark-residence"),
      ),
    ).rejects.toBeInstanceOf(NotPermittedError);
  });
});
