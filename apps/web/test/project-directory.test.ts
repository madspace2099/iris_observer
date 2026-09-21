import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectSummary, Viewer } from "@observer/readmodels";

import {
  projectIdFromUuid,
  tenantIdFromUuid,
  uuidFromDirectoryId,
} from "../src/lib/directory/identity";

/**
 * A PROJECT MADE IN ADMINISTRATION, SEEN FROM THE CUSTOMER SIDE.
 *
 * Three decisions live in the application rather than in the repository or the
 * database, so they are held here: which control-plane row stands behind a
 * read-model project, which projects are complete enough to be listed at all,
 * and whose viewer a grant is merged into.
 */

const FRESH = "11111111-1111-4111-8111-111111111111";
const TWIN = "22222222-2222-4222-8222-222222222222";
const HALF = "33333333-3333-4333-8333-333333333333";
const DEVELOPER = "44444444-4444-4444-8444-444444444444";

const complete = {
  project_id: FRESH,
  /* The same name as the fixture, on purpose. */
  name: "ISTER TOWER",
  slug: "ister-tower-two",
  tenant_id: DEVELOPER,
  tenant_name: "Alder Homes",
  tenant_slug: "alder-homes",
  currency: "EUR",
  locale: "sk-SK",
  time_zone: "Europe/Bratislava",
  created_at: "2026-09-18T08:00:00Z",
};
const bare = {
  tenant_id: null,
  tenant_name: null,
  tenant_slug: null,
  currency: null,
  locale: null,
  time_zone: null,
  created_at: "2026-09-01T08:00:00Z",
};
const rows = [
  complete,
  { ...bare, project_id: TWIN, name: "Ister Tower", slug: "ister-tower" },
  { ...bare, project_id: HALF, name: "Half made", slug: "half-made" },
];

const db = {
  projectDirectory: vi.fn(),
  projectsForViewer: vi.fn(),
  sourceOperations: vi.fn(),
};

vi.mock("../src/lib/sources/control-plane", () => ({
  CONTROL_PLANE_ACCOUNT: "acct_test",
  controlPlane: () => Promise.resolve({ ok: false, absence: { kind: "not_enabled" } }),
}));
vi.mock("../src/lib/sources/deps", () => ({
  observerDepsAsync: () => Promise.resolve({ db, env: {}, now: () => new Date() }),
}));
vi.mock("../src/lib/connectors/live", () => ({
  liveConnectorService: () => Promise.resolve(null),
}));

const { controlPlaneProjectFor } = await import("../src/lib/directory/rows");
const { liveProjectDirectory, withDirectoryGrants, forgetDirectoryMemo } =
  await import("../src/lib/directory/live");

beforeEach(() => {
  forgetDirectoryMemo();
  vi.clearAllMocks();
  db.projectDirectory.mockResolvedValue(rows);
  db.projectsForViewer.mockResolvedValue([]);
  db.sourceOperations.mockResolvedValue([]);
});

describe("a control-plane uuid as a read-model identifier", () => {
  it("round-trips, and no fixture id is mistaken for one", () => {
    expect(projectIdFromUuid(FRESH)).toBe("prj_11111111111141118111111111111111");
    expect(uuidFromDirectoryId(projectIdFromUuid(FRESH))).toBe(FRESH);
    expect(uuidFromDirectoryId(tenantIdFromUuid(DEVELOPER))).toBe(DEVELOPER);
    for (const fixture of ["prj_istertower1", "prj_northgate01", "tnt_demoalpha01", "nonsense"]) {
      expect(uuidFromDirectoryId(fixture), fixture).toBeNull();
    }
  });
});

describe("which row stands behind a read-model project", () => {
  const fixture = { id: "prj_istertower1", slug: "ister-tower", name: "ISTER TOWER" };

  it("is its own uuid for a project from the directory, and nothing for one that is not complete", async () => {
    const own = { id: projectIdFromUuid(FRESH), slug: "ister-tower-two", name: "ISTER TOWER" };
    expect(await controlPlaneProjectFor(own as unknown as ProjectSummary)).toBe(FRESH);

    const half = { id: projectIdFromUuid(HALF), slug: "half-made", name: "Half made" };
    expect(await controlPlaneProjectFor(half as unknown as ProjectSummary)).toBeNull();
  });

  it("is the old twin for a fixture, and never a complete project of the same name", async () => {
    expect(await controlPlaneProjectFor(fixture as unknown as ProjectSummary)).toBe(TWIN);

    db.projectDirectory.mockResolvedValue([complete]);
    forgetDirectoryMemo();
    expect(
      await controlPlaneProjectFor(fixture as unknown as ProjectSummary),
      "the only row of that name is somebody's real project",
    ).toBeNull();
  });
});

describe("what the customer side is told exists", () => {
  it("is the complete projects only, each with its four feeds stated", async () => {
    db.sourceOperations.mockResolvedValue([
      {
        source_id: "src-1",
        project_id: FRESH,
        source_type: "showroom_ue5",
        state: "active",
        display_label: "Showroom PC 1",
        last_seen_at: "2026-09-18T07:59:00Z",
      },
      {
        source_id: "src-2",
        project_id: FRESH,
        source_type: "showroom_ue5",
        state: "active",
        display_label: "Showroom PC 2",
        last_seen_at: null,
      },
    ]);
    const entries = await liveProjectDirectory.entries();

    expect(entries?.tenants).toEqual([
      { id: tenantIdFromUuid(DEVELOPER), slug: "alder-homes", name: "Alder Homes" },
    ]);
    expect(entries?.projects.map((p) => p.slug)).toEqual(["ister-tower-two"]);

    const project = entries?.projects[0];
    expect(project?.timeZone).toBe("Europe/Bratislava");
    expect(project?.connectedSources).toEqual(["showroom"]);
    expect(project?.sources.map((s) => [s.kind, s.displayName, s.connected, s.lastSeenAt])).toEqual(
      [
        ["showroom", "Showroom PC 1", true, "2026-09-18T07:59:00Z"],
        ["showroom", "Showroom PC 2", false, null],
        ["webiris", "WEB IRIS", false, null],
        ["crm", "CRM", false, null],
        ["catalogue", "Unit catalogue", false, null],
      ],
    );
  });

  it("is nothing, and breaks nothing, when the directory cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.projectDirectory.mockRejectedValue(new Error("404"));
    expect(await liveProjectDirectory.entries()).toEqual({ tenants: [], projects: [] });
  });
});

describe("whose viewer a grant is merged into", () => {
  const petra = {
    userId: "usr_petra",
    displayName: "Petra",
    role: "developer",
    tenantIds: ["tnt_demoalpha01"],
    projectIds: ["prj_northgate01"],
    agentId: null,
    organisationName: "Alpha",
  } as unknown as Viewer;

  it("leaves an account with no grant exactly as it was", async () => {
    expect(await withDirectoryGrants("acct_petra", petra)).toBe(petra);
    expect(db.projectsForViewer).toHaveBeenCalledWith({
      account: "acct_test",
      viewer: "acct_petra",
    });
  });

  it("adds a granted project and its developer, keeping what was held", async () => {
    db.projectsForViewer.mockResolvedValue([{ project_id: FRESH }, { project_id: HALF }]);
    const merged = await withDirectoryGrants("acct_petra", petra);
    expect(merged.projectIds).toEqual(["prj_northgate01", projectIdFromUuid(FRESH)]);
    expect(merged.tenantIds).toEqual(["tnt_demoalpha01", tenantIdFromUuid(DEVELOPER)]);
  });

  it("gives an administrator every complete project without asking for grants", async () => {
    const admin = { ...petra, role: "madspace_admin" } as Viewer;
    const merged = await withDirectoryGrants("acct_madspace", admin);
    expect(merged.projectIds).toContain(projectIdFromUuid(FRESH));
    expect(merged.projectIds).not.toContain(projectIdFromUuid(HALF));
    expect(db.projectsForViewer).not.toHaveBeenCalled();
  });

  it("stays closed when grants cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.projectsForViewer.mockRejectedValue(new Error("boom"));
    expect(await withDirectoryGrants("acct_petra", petra)).toBe(petra);
  });
});
