import { describe, expect, it } from "vitest";

import { ProjectIdSchema, TenantIdSchema, type ShowroomSession } from "@observer/contracts";
import {
  PRESENTER_NOT_NAMED,
  presenterWord,
  visitorLabel,
  type ProjectDirectory,
  type ProjectSummary,
  type ShowroomSessionSource,
  type TenantSummary,
  type Viewer,
} from "@observer/readmodels";

import { SyntheticObserverRepository } from "../src/repository";
import { VIEWERS } from "../src/world";

/**
 * WHO GAVE THE PRESENTATION — AND THE ONE NAME THAT IS STILL NOT THIS.
 *
 * A showroom mints its own identifier for whoever ran a meeting; the name for
 * that identifier arrives separately, from the roster an administration keeps
 * or from the installation's own report of who presents on it. Three things
 * have to hold and each used to be one line away from failing.
 *
 * **A name that exists is shown.** On the register row and on the replay, on a
 * project entitled to nothing above the base plan, because who presented is not
 * a premium fact.
 *
 * **A name that does not exist is SAID not to exist.** Not a blank, not an
 * invention, and — the defect this file was written for — not the identifier
 * standing in the name's place. Akhilesh's delivered demonstration showed
 * "agent-guid" as the person who gave the presentation, and a reader who does
 * not know the shape of these ids, which is every reader the product is for,
 * has no way to tell that from somebody actually called that.
 *
 * **Two people with one name stay two people.** Identity is the identifier the
 * showroom minted and never the label a directory happens to give it, so two
 * presenters called the same thing keep two rows, two ids and two pages.
 *
 * And the boundary this file must not cross: none of the above is the BUYER's
 * name. P1-08b is blocked by product decision — ADR-0018, `docs/05-identity.md`
 * and the `visitorLabel` type, which has no parameter a name could be passed
 * through. The last case here is the tripwire for that staying true.
 */

const NOW = new Date("2026-09-18T09:30:00.000Z");
const NO_FILTERS = { agentId: null, channel: null, outcome: null } as const;

const tenant: TenantSummary = {
  id: TenantIdSchema.parse("tnt_00000000000000000000000000000a1"),
  slug: "birch-estates",
  name: "Birch Estates",
};
const project: ProjectSummary = {
  id: ProjectIdSchema.parse("prj_00000000000000000000000000000b1"),
  tenantId: tenant.id,
  slug: "birch-quarter",
  name: "Birch Quarter",
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
} as const;

function meeting(id: string, agentId: string): ShowroomSession {
  return {
    sessionId: id,
    meetingId: id,
    projectId: project.id,
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

/** A repository over exactly these meetings and exactly these names. */
function repositoryOver(
  sessions: readonly ShowroomSession[],
  agentNames: Readonly<Record<string, string>> | undefined,
): SyntheticObserverRepository {
  const source: ShowroomSessionSource = {
    sessionsFor: async (p) =>
      p.id === project.id
        ? { connector: "ue5_events", sessions, fetchedAt: NOW.toISOString(), agentNames }
        : null,
  };
  return new SyntheticObserverRepository({
    projectDirectory: directory,
    sessionSource: source,
    now: () => NOW,
  });
}

const FIRST = "3f5b1a2c-0000-4000-8000-000000000001";
const SECOND = "3f5b1a2c-0000-4000-8000-000000000002";

describe("the word that stands where a presenter's name would", () => {
  it("is the name itself when there is one", () => {
    expect(presenterWord("Monika Kováčová", "AG-1")).toBe("Monika Kováčová");
  });

  it("states the absence and keeps the identifier when there is not", () => {
    for (const nothing of [null, "", "   "]) {
      const word = presenterWord(nothing, "AG-9");
      expect(word, JSON.stringify(nothing)).toContain(PRESENTER_NOT_NAMED);
      // The identifier survives. Dropping it would merge every unnamed
      // presenter on a project into one anonymous person.
      expect(word, JSON.stringify(nothing)).toContain("AG-9");
      // And it is never blank, which is the state a reader cannot interpret.
      expect(word.trim().length, JSON.stringify(nothing)).toBeGreaterThan(0);
    }
  });

  it("never returns the bare identifier, which is what it replaced", () => {
    // The regression in one line: `?? agentId` at the end of the chain.
    expect(presenterWord(null, "agent-guid")).not.toBe("agent-guid");
  });
});

describe("a meeting shows who presented it", () => {
  it("names them on the register row and on the replay", async () => {
    const repo = repositoryOver([meeting(FIRST, "AG-1")], { "AG-1": "Monika Kováčová" });

    const view = await repo.getMeetings(query, NO_FILTERS);
    expect(view.rows.map((r) => r.agentName)).toEqual(["Monika Kováčová"]);

    const replay = await repo.getMeetingReplay({
      viewer,
      tenantSlug: tenant.slug,
      projectSlug: project.slug,
      meetingId: FIRST as never,
    });
    expect(replay.agentName).toBe("Monika Kováčová");
    // A real roster entry gets a real page. An unresolved id gets null rather
    // than a link to a route with nobody behind it.
    expect(replay.agentHref).toBe(`/${tenant.slug}/${project.slug}/agents/AG-1`);
  });

  it("says so, rather than showing an id, when nothing names them", async () => {
    const repo = repositoryOver([meeting(FIRST, "AG-1")], undefined);
    const view = await repo.getMeetings(query, NO_FILTERS);
    const shown = view.rows[0]?.agentName ?? "";

    expect(shown).toBe(`${PRESENTER_NOT_NAMED} · AG-1`);
    expect(shown).not.toBe("AG-1");
    expect(shown.length).toBeGreaterThan(0);
  });
});

describe("two presenters with one name stay two presenters", () => {
  it("keeps two identities, two ids and two pages", async () => {
    /*
     * The case the world file already argues for in prose: "Two people can
     * share a forename, and a product that resolves identity for a living
     * should be able to hold both without merging them." Here they share the
     * WHOLE name, which is the harder version and the one a directory can
     * actually produce.
     */
    const repo = repositoryOver([meeting(FIRST, "AG-1"), meeting(SECOND, "AG-2")], {
      "AG-1": "Ján Hruška",
      "AG-2": "Ján Hruška",
    });

    const agents = await repo.listAgents(query);
    expect(agents).toHaveLength(2);
    expect(new Set(agents.map((a) => a.agentId))).toEqual(new Set(["AG-1", "AG-2"]));
    // The label repeats, because it is their name and it is the truth. The
    // identity does not: each has one meeting, not one of them two.
    expect(agents.map((a) => a.name)).toEqual(["Ján Hruška", "Ján Hruška"]);
    expect(agents.map((a) => a.meetingCount)).toEqual([1, 1]);

    // Two pages, and each answers over its own meeting rather than both.
    for (const id of ["AG-1", "AG-2"]) {
      const detail = await repo.getAgentDetail(query, id);
      expect(detail.sampleSize, id).toBe(1);
    }

    // The meeting filter offers both, so neither one's meetings are hidden
    // behind the other's row.
    const view = await repo.getMeetings(query, NO_FILTERS);
    expect(view.options.agents.map((o) => o.id).sort()).toEqual(["AG-1", "AG-2"]);
  });
});

describe("the presenter's name is not the buyer's, and cannot become it", () => {
  it("leaves the visitor label free of anything a presenter is called", async () => {
    /*
     * P1-08b is blocked by decision, not by omission. This is the tripwire:
     * the presenter's name travels on `agentName`, the visitor travels on
     * `VisitorLabel`, and the two must not meet. `visitorLabel` takes a closed
     * enum and an integer and has no parameter a name could be passed through,
     * which is what makes the guarantee structural rather than careful.
     */
    const repo = repositoryOver([meeting(FIRST, "AG-1")], { "AG-1": "Monika Kováčová" });
    const view = await repo.getMeetings(query, NO_FILTERS);
    const row = view.rows[0];
    expect(row).toBeDefined();

    expect(row?.agentName).toBe("Monika Kováčová");
    // Whatever the visitor label says, it is one of the three states the type
    // declares — never a person's name, and never the presenter's.
    const permitted = [
      visitorLabel("unlinked", null).display,
      visitorLabel("known_first_meeting", 0).display,
      visitorLabel("known_returning", 2).display,
    ];
    expect(permitted).toContain(row?.visitor.display);
    expect(row?.visitor.display).not.toContain("Monika");
    expect(JSON.stringify(row?.visitor)).not.toContain("Monika");
  });
});
