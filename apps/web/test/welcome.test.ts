import { describe, expect, it } from "vitest";
import { VIEWERS } from "@observer/synthetic";

import { repository } from "../src/lib/repository";
import {
  welcomeFacts,
  welcomeLines,
  type WelcomeFacts,
  type WelcomeProject,
} from "../src/lib/welcome";

/**
 * THE WELCOME SAYS WHAT THE REPOSITORY HOLDS, AND NOTHING IT DOES NOT.
 *
 * Every figure the sequence types is read for the project it opens: the
 * presentations in the default period, the presenters, the latest meeting's
 * day, the sources actually connected. These hold it to the same reads the
 * meetings register and the roster make.
 */

const QUERY = {
  viewer: VIEWERS.developer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  period: "quarter_to_date" as const,
  language: "en" as const,
};

describe("welcomeFacts", () => {
  it("reads the period's meetings, presenters and latest day from the repository", async () => {
    const facts = await welcomeFacts(VIEWERS.developer, "/alpha/northgate/ask");
    const meetings = await repository.listMeetings(QUERY);
    const agents = await repository.listAgents(QUERY);

    expect(facts.displayName).toBe(VIEWERS.developer.displayName);
    expect(facts.organisationName).toBe(VIEWERS.developer.organisationName);
    expect(facts.project?.name).toBe("Northgate Residences");
    expect(facts.project?.period?.meetings).toBe(meetings.length);
    expect(facts.project?.period?.agents).toBe(agents.length);
    expect(facts.project?.period?.latestDay).toBe(meetings[0]?.startedDisplay ?? null);
  });

  it("names only the sources the project has connected", async () => {
    const facts = await welcomeFacts(VIEWERS.developer, "/alpha/northgate/ask");
    const { project } = await repository.resolveProject(VIEWERS.developer, "alpha", "northgate");
    expect(facts.project?.sources.length).toBe(project.connectedSources.length);
  });

  it("reads no project for the picker, and none the viewer does not hold", async () => {
    expect((await welcomeFacts(VIEWERS.developer, "/projects")).project).toBeNull();
    expect((await welcomeFacts(VIEWERS.developer, "/beta/kingsford/ask")).project).toBeNull();
  });
});

describe("welcomeLines", () => {
  const PROJECT: WelcomeProject = {
    name: "Shark Residence",
    sources: ["showroom", "WEB IRIS", "CRM", "catalogue"],
    locale: "en-GB",
    period: { label: "Quarter to date", meetings: 1520, agents: 5, latestDay: "23 Aug" },
  };
  const base: WelcomeFacts = {
    displayName: "Clara Weiss",
    organisationName: "Shark Developments",
    destination: "/shark/shark-residence/ask",
    project: PROJECT,
  };

  it("types the five lines, every figure from the facts", () => {
    expect(welcomeLines(base)).toEqual([
      "Signed in · Clara Weiss, Shark Developments",
      "Connecting Shark Residence · showroom, WEB IRIS, CRM, catalogue",
      "Reading 1,520 presentations · quarter to date",
      "5 agents · latest meeting 23 Aug",
      "Briefing ready",
    ]);
  });

  it("says no presentation was recorded rather than counting one, and draws no presenter line", () => {
    const lines = welcomeLines({
      ...base,
      project: {
        ...PROJECT,
        period: { label: "Quarter to date", meetings: 0, agents: 0, latestDay: null },
      },
    });
    expect(lines).toContain("No presentations recorded · quarter to date");
    expect(lines.some((line) => line.includes("agent"))).toBe(false);
  });

  it("leaves a figure out when the period could not be read", () => {
    const lines = welcomeLines({ ...base, project: { ...PROJECT, period: null } });
    expect(lines.some((line) => /\d/.test(line))).toBe(false);
  });

  it("says when a project has no source connected", () => {
    const lines = welcomeLines({ ...base, project: { ...PROJECT, sources: [] } });
    expect(lines).toContain("Opening Shark Residence · no source connected yet");
  });

  it("opens the picker in words, with no project figure", () => {
    expect(welcomeLines({ ...base, destination: "/projects", project: null })).toEqual([
      "Signed in · Clara Weiss, Shark Developments",
      "Opening your projects",
      "Ready",
    ]);
  });

  it("names what it opens by the destination, not always the projects", () => {
    const line = (destination: string) => welcomeLines({ ...base, destination, project: null })[1];
    expect(line("/madspace")).toBe("Opening MADSPACE administration");
    expect(line("/shark/shark-residence/ask")).toBe("Opening Ask IRIS");
  });

  /* ADR-0022: the sign-in selects a scenario; it confirms nobody's identity. */
  it("says signed in, never that an identity was confirmed", () => {
    expect(welcomeLines(base).join(" ")).not.toMatch(/identity|confirmed|verified/i);
  });
});
