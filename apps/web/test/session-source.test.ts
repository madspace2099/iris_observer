import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "@observer/readmodels";
import type { ShowroomSession } from "@observer/contracts";

/**
 * The seam where a project's real sessions are chosen.
 *
 * What matters here is not the fold (tested beside it) or the facade (tested
 * against a real Postgres) but the ORDER OF FAILURE: a database that predates
 * `observer_events_for_project` must lose the V2 path only, and keep delivering
 * the connector's sessions exactly as it did the day before.
 */

const TWIN = "11111111-1111-4111-8111-111111111111";
const project = {
  id: "prj_ister",
  slug: "ister-tower",
  name: "ISTER TOWER",
} as unknown as ProjectSummary;

const eventsForProject = vi.fn();
const connector = { list: vi.fn(), currentSessions: vi.fn() };

vi.mock("../src/lib/sources/control-plane", () => ({
  CONTROL_PLANE_ACCOUNT: "acct_test",
  controlPlane: () =>
    Promise.resolve({
      ok: true,
      admin: {
        projectsForAccount: () =>
          Promise.resolve({
            ok: true,
            value: [{ project_id: TWIN, slug: "ister-tower", name: "Ister Tower" }],
          }),
      },
    }),
}));
vi.mock("../src/lib/sources/deps", () => ({
  observerDepsAsync: () => Promise.resolve({ db: { eventsForProject } }),
}));
vi.mock("../src/lib/connectors/live", () => ({
  liveSessionSourceService: () => Promise.resolve(connector),
}));

const { liveSessionSource, forgetSessionMemo } =
  await import("../src/lib/connectors/session-source");

const legacy = { sessionId: "legacy-1" } as unknown as ShowroomSession;

function connectorDelivers(): void {
  connector.list.mockResolvedValue([
    {
      kind: "supabase_showroom",
      enabled: true,
      lastSync: { outcome: "ok", at: "2026-09-10T08:00:00.000Z" },
    },
  ]);
  connector.currentSessions.mockResolvedValue([legacy]);
}

const started = {
  event_name: "session.started",
  occurred_at: "2026-09-16T10:00:00.000Z",
  ingested_at: "2026-09-16T10:00:01.000Z",
  session_id: "7a1c9f6e-2c7a-4a4e-9b31-0000000000aa",
  sequence: 1,
  agent_id: "agent-guid",
  entity_type: null,
  entity_id: null,
  properties: {},
  page_cursor: "2026-09-16T10:00:01.000000Z|s|e",
};

beforeEach(() => {
  forgetSessionMemo();
  vi.clearAllMocks();
  connector.list.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("which real sessions a project is composed with", () => {
  it("delivers the sessions folded from ingested events, under the read model's project id", async () => {
    eventsForProject.mockResolvedValueOnce([started]).mockResolvedValue([]);
    const delivered = await liveSessionSource.sessionsFor(project);

    expect(eventsForProject).toHaveBeenCalledWith({
      account: "acct_test",
      project: TWIN,
      after: null,
      limit: 1000,
    });
    expect(delivered?.connector).toBe("ue5_events");
    expect(delivered?.sessions.map((s) => [s.sessionId, s.projectId])).toEqual([
      [started.session_id, "prj_ister"],
    ]);
    expect(delivered?.fetchedAt).toBe("2026-09-16T10:00:01.000Z");
  });

  it("keeps the connector's sessions when the event store cannot be read", async () => {
    eventsForProject.mockRejectedValue(new Error("404: function does not exist"));
    connectorDelivers();

    const delivered = await liveSessionSource.sessionsFor(project);
    expect(delivered?.connector).toBe("supabase_showroom");
    expect(delivered?.sessions).toEqual([legacy]);
  });

  it("delivers both when both answer", async () => {
    eventsForProject.mockResolvedValueOnce([started]).mockResolvedValue([]);
    connectorDelivers();

    const delivered = await liveSessionSource.sessionsFor(project);
    expect(delivered?.sessions.map((s) => s.sessionId)).toEqual(["legacy-1", started.session_id]);
  });

  it("answers null, so the synthetic world stands, when neither has anything", async () => {
    eventsForProject.mockResolvedValue([]);
    expect(await liveSessionSource.sessionsFor(project)).toBeNull();
  });
});
