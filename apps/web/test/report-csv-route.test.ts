import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { DATA_SOURCE_MARKER_WORDS, type Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";

import { REPORT_WORDS } from "@/components/report/words";

/**
 * THE CSV ROUTE REFUSES WHAT THE REPORT PAGE REFUSES (ADR-0045).
 *
 * A route handler is not wrapped by the project layout, so nothing the layout
 * checks is checked for it unless it checks it itself. These are the page's
 * refusals, asked of the route: a project the viewer does not hold, an agent
 * this project does not have for them, a role the meeting surface does not
 * admit — and, so the refusals cannot pass for the wrong reason, a granted
 * request that downloads. The session and the repository are stood in for:
 * one viewer per request, the synthetic world, no network.
 */

const state = vi.hoisted(() => ({ viewer: null as unknown }));

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

vi.mock("../src/lib/session", () => ({
  requireViewer: async () => state.viewer,
}));

vi.mock("../src/lib/repository", async () => {
  const synthetic = await import("@observer/synthetic");
  return { repository: new synthetic.SyntheticObserverRepository() };
});

const { GET } = await import("../src/app/(app)/[tenantSlug]/[projectSlug]/report/csv/route");

const repo = new SyntheticObserverRepository();
const petra = VIEWERS.developer as Viewer; // alpha: northgate, riverside, ister-tower
const tomas = VIEWERS.agencyManager as Viewer; // northgate, ister-tower, beta/kingsford

function get(viewer: Viewer, tenantSlug: string, projectSlug: string, search = "") {
  state.viewer = viewer;
  return GET(new Request(`http://localhost/${tenantSlug}/${projectSlug}/report/csv${search}`), {
    params: Promise.resolve({ tenantSlug, projectSlug }),
  });
}

describe("the CSV route refuses what the report page refuses", () => {
  it("refuses a project the viewer does not hold, and a project that does not exist, alike", async () => {
    const held = await get(petra, "beta", "kingsford");
    const missing = await get(petra, "alpha", "no-such-project");
    expect(held.status).toBe(404);
    expect(missing.status).toBe(404);
    const [heldBody, missingBody] = [await held.text(), await missing.text()];
    expect(heldBody).toBe(missingBody);
    /* The project layout's own sentence: the page and the file refuse in the same words. */
    const layout = readFileSync(
      resolve(import.meta.dirname, "../src/app/(app)/[tenantSlug]/[projectSlug]/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain(heldBody);
  });

  it("refuses an agent outside the viewer's grants", async () => {
    const query = { period: "quarter_to_date", language: "en" } as const;
    const kingsford = await repo.getAgentsView({
      viewer: tomas,
      tenantSlug: "beta",
      projectSlug: "kingsford",
      ...query,
    });
    const northgate = await repo.getAgentsView({
      viewer: petra,
      tenantSlug: "alpha",
      projectSlug: "northgate",
      ...query,
    });
    const elsewhere = kingsford.agents.filter(
      (agent) => !northgate.agents.some((ours) => ours.agentId === agent.agentId),
    );
    expect(elsewhere.length).toBeGreaterThan(0);
    for (const agent of elsewhere) {
      const response = await get(petra, "alpha", "northgate", `?agent=${agent.agentId}`);
      expect(response.status, agent.agentId).toBe(404);
      expect(response.headers.get("content-type")).not.toContain("text/csv");
      expect(await response.text()).toBe("This report is not available.");
    }
  });

  it("sends a developer who asks for one meeting's figures where the page sends them", async () => {
    await expect(get(petra, "alpha", "northgate", "?meeting=anything")).rejects.toMatchObject({
      to: "/alpha/northgate/ask",
    });
  });
});

describe("the CSV route downloads what the report page prints", () => {
  it("names the file and writes it in the language, period and sections asked for", async () => {
    const scope = await repo.getReportScope({
      viewer: petra,
      tenantSlug: "alpha",
      projectSlug: "northgate",
      period: "year_to_date",
      language: "hu",
    });
    const omitted = scope.sections.find(
      (section) => section.availability !== "unavailable" && section.id !== "evidence-appendix",
    );
    expect(omitted).toBeDefined();

    const response = await get(
      petra,
      "alpha",
      "northgate",
      `?period=year_to_date&lang=hu&omit=${omitted?.id ?? ""}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="northgate_project_year-to-date_hu.csv"',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    /* The UTF-8 byte-order mark, as bytes: what tells Excel the file is UTF-8. */
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(body.startsWith("\uFEFFSzakasz;Adat;Érték;")).toBe(true);
    expect(body).toContain(scope.periodLabel);
    /* The page's "Demo data", whole: a forwarded file must not pass for real sales records. */
    expect(body).toContain(DATA_SOURCE_MARKER_WORDS.hu.synthetic.full);
    /* Named once, on the cover, as left out; never framed as a section of its own. */
    expect(body).toContain(`${omitted?.label ?? ""};${REPORT_WORDS.hu.leftOut}`);
    expect(body).not.toContain(`${omitted?.label ?? ""};Állapot;`);
  });

  it("writes one agent's summary under the agent's name", async () => {
    const response = await get(petra, "alpha", "ister-tower", "?agent=agt_martinkovac");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="ister-tower_martin-kovac_quarter-to-date_en.csv"',
    );
  });
});
