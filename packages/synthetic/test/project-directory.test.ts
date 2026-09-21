import { describe, expect, it } from "vitest";

import { ProjectIdSchema, TenantIdSchema, type ShowroomSession } from "@observer/contracts";
import {
  NotFoundError,
  NotPermittedError,
  type ProjectDirectory,
  type ProjectSummary,
  type ShowroomSessionSource,
  type TenantSummary,
  type Viewer,
} from "@observer/readmodels";

import { SyntheticObserverRepository } from "../src/repository";
import { PROJECTS, TENANTS, VIEWERS } from "../src/world";

/**
 * A PROJECT THAT EXISTS OUTSIDE THE SYNTHETIC WORLD.
 *
 * One made in administration has no building rule, no session dataset and no
 * scripted overview. The repository lists and resolves it beside the world's
 * own, decides access to it by the one rule it already had, puts it on the real
 * clock from the moment it exists, and lets no fixture's prose or people into
 * it (`docs/21-self-served-projects.md`).
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
  sources: [
    {
      id: "feed_showroom",
      displayName: "Showroom",
      kind: "showroom",
      connected: false,
      lastSeenAt: null,
    },
    {
      id: "feed_webiris",
      displayName: "WEB IRIS",
      kind: "webiris",
      connected: false,
      lastSeenAt: null,
    },
    { id: "feed_crm", displayName: "CRM", kind: "crm", connected: false, lastSeenAt: null },
    {
      id: "feed_catalogue",
      displayName: "Unit catalogue",
      kind: "catalogue",
      connected: false,
      lastSeenAt: null,
    },
  ],
};

const directory: ProjectDirectory = {
  entries: async () => ({ tenants: [tenant], projects: [project] }),
};

/** Petra, granted the new project on top of what she already held. */
const granted: Viewer = {
  ...(VIEWERS.developer as Viewer),
  tenantIds: [...VIEWERS.developer.tenantIds, tenant.id],
  projectIds: [...VIEWERS.developer.projectIds, project.id],
};
const notGranted = VIEWERS.developer as Viewer;

const query = {
  viewer: granted,
  tenantSlug: tenant.slug,
  projectSlug: project.slug,
  period: "last_28_days",
} as const;

const repository = new SyntheticObserverRepository({ projectDirectory: directory, now: () => NOW });

describe("a project from the directory is listed and resolved beside the world's own", () => {
  it("appears for a viewer who holds it, under its own developer", async () => {
    expect((await repository.listTenants(granted)).map((t) => t.slug)).toContain("alder-homes");
    expect((await repository.listProjects(granted, tenant.id)).map((p) => p.slug)).toEqual([
      "alder-court",
    ]);
    const resolved = await repository.resolveProject(granted, "alder-homes", "alder-court");
    expect(resolved.project.id).toBe(project.id);
    expect(resolved.tenant.name).toBe("Alder Homes");
  });

  it("leaves the synthetic world exactly as it was", async () => {
    const bare = new SyntheticObserverRepository();
    for (const t of TENANTS) {
      expect(await repository.listProjects(VIEWERS.madspace as Viewer, t.id)).toEqual(
        await bare.listProjects(VIEWERS.madspace as Viewer, t.id),
      );
    }
  });

  it("is refused to a viewer without the grant, and unknown to everybody under a wrong address", async () => {
    await expect(
      repository.resolveProject(notGranted, "alder-homes", "alder-court"),
    ).rejects.toBeInstanceOf(NotPermittedError);
    await expect(repository.listProjects(notGranted, tenant.id)).rejects.toBeInstanceOf(
      NotPermittedError,
    );
    await expect(
      repository.resolveProject(granted, "alder-homes", "alder-yard"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(repository.resolveProject(granted, "alpha", "alder-court")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("does not exist at all for a repository composed without a directory", async () => {
    await expect(
      new SyntheticObserverRepository().resolveProject(granted, "alder-homes", "alder-court"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("a directory entry cannot shadow a fixture", () => {
  const northgate = PROJECTS.find((p) => p.slug === "northgate");
  const alpha = TENANTS.find((t) => t.slug === "alpha");
  if (northgate === undefined || alpha === undefined) throw new Error("the fixtures moved");

  const impostor: ProjectDirectory = {
    entries: async () => ({
      tenants: [{ ...tenant, slug: "alpha" }],
      projects: [{ ...project, id: northgate.id, name: "Not Northgate" }],
    }),
  };
  const shadowed = new SyntheticObserverRepository({ projectDirectory: impostor });

  it("keeps the world's developer and project where a slug or an id collides", async () => {
    const resolved = await shadowed.resolveProject(
      VIEWERS.madspace as Viewer,
      "alpha",
      "northgate",
    );
    expect(resolved.project.name).toBe(northgate.name);
    expect(resolved.tenant.id).toBe(alpha.id);
    const names = (await shadowed.listProjects(VIEWERS.madspace as Viewer, alpha.id)).map(
      (p) => p.name,
    );
    expect(names).not.toContain("Not Northgate");
  });
});

describe("it runs on the real clock from the moment it exists", () => {
  it("with no meeting at all, in its own time zone", async () => {
    const view = await repository.getMeetings(query, NO_FILTERS);
    expect(view.periodTotal).toBe(0);
    expect(view.context.generatedAt).toBe(NOW.toISOString());
    expect(view.context.ownDataOnly).toBe(true);
    expect(view.context.sessionsDelivered).toBe(false);
    /* Local midnight this morning in Bratislava, not the synthetic world's 24 August. */
    expect(Date.parse(view.context.period.to)).toBe(Date.parse("2026-09-18T00:00:00.000+02:00"));
  });

  it("agrees with resolvePeriod, which no longer invents a period for a project nobody knows", async () => {
    const period = await repository.resolvePeriod(project.id, "last_28_days");
    expect(Date.parse(period.to)).toBe(Date.parse("2026-09-18T00:00:00.000+02:00"));
    await expect(
      repository.resolvePeriod(ProjectIdSchema.parse("prj_nobodyknowsthis"), "last_28_days"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps a synthetic project on the synthetic day", async () => {
    const view = await repository.getMeetings(
      {
        viewer: VIEWERS.madspace as Viewer,
        tenantSlug: "alpha",
        projectSlug: "northgate",
        period: "last_28_days",
      },
      NO_FILTERS,
    );
    expect(view.context.ownDataOnly).toBe(false);
    expect(view.context.generatedAt).not.toBe(NOW.toISOString());
  });
});

describe("nothing of a fixture reaches it", () => {
  it("answers Ask from what was delivered, never from the scenario's prose", async () => {
    const ask = await repository.getAskSession(query, null);
    const prose = JSON.stringify(ask);
    expect(prose).not.toMatch(/Vikt[oó]ria|Northgate|viewings held at 46|Offers fell/);
  });

  it("shows its own meetings once its showroom sends them, and only under itself", async () => {
    const meeting: ShowroomSession = {
      sessionId: "7a1c9f6e-2c7a-4a4e-9b31-0000000000bb",
      meetingId: "7a1c9f6e-2c7a-4a4e-9b31-0000000000bb",
      projectId: project.id as string,
      agentId: "AG-1",
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
    const sessions: ShowroomSessionSource = {
      sessionsFor: async (p) =>
        p.id === project.id
          ? { connector: "ue5_events", sessions: [meeting], fetchedAt: NOW.toISOString() }
          : null,
    };
    const live = new SyntheticObserverRepository({
      projectDirectory: directory,
      sessionSource: sessions,
      now: () => NOW,
    });

    const own = await live.getMeetings(query, NO_FILTERS);
    expect(own.periodTotal).toBe(1);
    expect(own.context.sessionsDelivered).toBe(true);

    const elsewhere = await live.getMeetings(
      {
        viewer: VIEWERS.madspace as Viewer,
        tenantSlug: "alpha",
        projectSlug: "northgate",
        period: "last_28_days",
      },
      NO_FILTERS,
    );
    expect(JSON.stringify(elsewhere)).not.toContain(meeting.sessionId);
  });
});
