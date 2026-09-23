import { describe, expect, it } from "vitest";

import { ProjectIdSchema, TenantIdSchema, type ShowroomSession } from "@observer/contracts";
import type {
  ProjectDirectory,
  ProjectSummary,
  ShowroomSessionSource,
  TenantSummary,
  Viewer,
} from "@observer/readmodels";
import { CONTACT_DIRECTORY } from "../src/contacts";
import { SyntheticObserverRepository } from "../src/repository";
import { VIEWERS } from "../src/world";

/**
 * THE NAME DISAPPEARS WHEN THE CONSENT IS WITHDRAWN, AND THE LABEL STAYS.
 *
 * `docs/22-visitor-name-display.md` §6, the second promise. The contact is
 * chosen rather than found: one whose behavioural-linking consent stands and
 * one whose consent is withdrawn, each linked to one meeting on a project
 * built for this test alone, each a returning buyer. The read model's join
 * gives the first row its name beside the label and the second row the label
 * alone — and gives a developer, outside `AGENT_REGISTER_ROLES`, the labels
 * and nothing else. One assertion holds the four rows together, because the
 * claim is one claim: the name is a fact about consent and audience, the
 * label is a fact about the meeting, and the two are joined, never merged.
 */

const NOW = new Date("2026-09-18T09:30:00.000Z");
const NO_FILTERS = { agentId: null, channel: null, outcome: null } as const;

const tenant: TenantSummary = {
  id: TenantIdSchema.parse("tnt_00000000000000000000000000000c1"),
  slug: "cedar-estates",
  name: "Cedar Estates",
};
const project: ProjectSummary = {
  id: ProjectIdSchema.parse("prj_00000000000000000000000000000d1"),
  tenantId: tenant.id,
  slug: "cedar-court",
  name: "Cedar Court",
  currency: "EUR",
  locale: "sk-SK",
  timeZone: "Europe/Bratislava",
  connectedSources: [],
  sources: [],
};
const directory: ProjectDirectory = {
  entries: async () => ({ tenants: [tenant], projects: [project] }),
};

function viewerFrom(base: Viewer): Viewer {
  return {
    ...base,
    tenantIds: [...base.tenantIds, tenant.id],
    projectIds: [...base.projectIds, project.id],
  };
}
const manager = viewerFrom(VIEWERS.agencyManager as Viewer);
const developer = viewerFrom(VIEWERS.developer as Viewer);

function meeting(id: string, contactId: string): ShowroomSession {
  return {
    sessionId: id,
    meetingId: id,
    projectId: project.id,
    agentId: "AG-1",
    channel: "showroom",
    contactId,
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
    priorMeetings: 1,
    timingUnavailable: false,
  };
}

function repositoryOver(sessions: readonly ShowroomSession[]): SyntheticObserverRepository {
  const source: ShowroomSessionSource = {
    sessionsFor: async (p) =>
      p.id === project.id
        ? {
            connector: "ue5_events",
            sessions,
            fetchedAt: NOW.toISOString(),
            agentNames: { "AG-1": "Agent One" },
          }
        : null,
  };
  return new SyntheticObserverRepository({
    projectDirectory: directory,
    sessionSource: source,
    now: () => NOW,
  });
}

const consenting = CONTACT_DIRECTORY.find(
  (c) => c.consent.behaviouralLinking && c.fullName !== null && c.erasedAt === null,
);
const withdrawn = CONTACT_DIRECTORY.find(
  (c) => !c.consent.behaviouralLinking && c.fullName !== null && c.erasedAt === null,
);
if (consenting === undefined || withdrawn === undefined) {
  throw new Error("the directory no longer holds a consenting and a withdrawn named contact");
}

const CONSENTING_MEETING = "3f5b1a2c-0000-4000-8000-000000000011";
const WITHDRAWN_MEETING = "3f5b1a2c-0000-4000-8000-000000000012";

describe("the buyer's name beside the label", () => {
  it("disappears when the consent is withdrawn, and the label stays", async () => {
    const repo = repositoryOver([
      meeting(CONSENTING_MEETING, consenting.contactId),
      meeting(WITHDRAWN_MEETING, withdrawn.contactId),
    ]);
    const rowsFor = async (viewer: Viewer) => {
      const view = await repo.getMeetings(
        { viewer, tenantSlug: tenant.slug, projectSlug: project.slug, period: "last_28_days" },
        NO_FILTERS,
      );
      return view.rows
        .map((r) => ({ meetingId: r.meetingId, label: r.visitor.display, name: r.visitorName }))
        .sort((a, b) => a.meetingId.localeCompare(b.meetingId));
    };

    expect({ manager: await rowsFor(manager), developer: await rowsFor(developer) }).toEqual({
      manager: [
        {
          meetingId: CONSENTING_MEETING,
          label: "Returning · 2nd meeting",
          name: consenting.fullName,
        },
        { meetingId: WITHDRAWN_MEETING, label: "Returning · 2nd meeting", name: null },
      ],
      developer: [
        { meetingId: CONSENTING_MEETING, label: "Returning · 2nd meeting", name: null },
        { meetingId: WITHDRAWN_MEETING, label: "Returning · 2nd meeting", name: null },
      ],
    });
  });
});
