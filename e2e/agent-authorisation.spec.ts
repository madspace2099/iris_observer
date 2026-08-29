import { expect, test, type Page } from "@playwright/test";
import { signIn, signInAs } from "./sign-in";

/**
 * WHAT A SALES AGENT MAY SEE, AND WHERE THAT STOPS.
 *
 * ## The two projects, and what they stand for
 *
 * The acceptance brief names HINOHARA and ISTER TOWER. Neither exists in this
 * build: HINOHARA appears nowhere in the repository or in the reference
 * archive, and ISTER TOWER is a project in the MADSPACE Client Portal's own
 * demonstration data rather than Observer's. Renaming Observer's synthetic
 * developments to match would rewrite the content of four frozen screens so
 * that a test could read nicely.
 *
 * So the cases below run against the projects this build actually has, and the
 * mapping is stated once, here:
 *
 *   HINOHARA     ->  Northgate Residences, Alpha Estates   (the agent's project)
 *   ISTER TOWER  ->  Kingsford Yard, Beta Development      (a project she does
 *                                                           not hold, belonging
 *                                                           to a competitor)
 *
 * Nothing is weakened by the substitution: the two belong to different
 * developers, which is the strongest form of the boundary, and Alpha's other
 * project (Riverside Walk) adds a third case — one she does not hold from a
 * developer she does.
 *
 * ## The two agents
 *
 *   Monika Kovacova   one grant    Northgate
 *   Akhilesh Undev    two grants   Northgate AND Kingsford, two developers
 *
 * Both are sales agents. The only difference between them is the grants on the
 * account, which is the whole claim under test.
 */

const HINOHARA = { tenant: "alpha", project: "northgate", name: "Northgate Residences" } as const;
const ISTER = { tenant: "beta", project: "kingsford", name: "Kingsford Yard" } as const;
const THIRD = { tenant: "alpha", project: "riverside", name: "Riverside Walk" } as const;

const AGENT = "Monika Kováčová";
const DUAL = "Akhilesh Undev";

/** Every route beneath a project, so refusal is proved for the whole shell. */
const SURFACES = [
  "showroom",
  "flow",
  "project",
  "agents",
  "presentation",
  "units",
  "storytelling",
  "meetings",
  "audience",
  "people",
  "overview",
] as const;

async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

/** The agent names rendered on a Sales Agents surface, in order. */
async function agentsNamed(page: Page): Promise<string[]> {
  return page.locator(".iris-ring-card h3").allInnerTexts();
}

/** Every figure the rings carry, so two projects can be compared as data. */
async function agentFigures(page: Page): Promise<{ name: string; detail: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".iris-ring-card")].map((card) => ({
      name: (card.querySelector("h3")?.textContent ?? "").trim(),
      detail: (card.querySelector(".iris-code")?.textContent ?? "").trim(),
    })),
  );
}

test.describe("the project she holds", () => {
  test("shows exactly one card, and it is HINOHARA", async ({ page }) => {
    await signIn(page, AGENT);

    const projects = await page.locator(".mp-project").allInnerTexts();
    expect(projects).toEqual([HINOHARA.name]);

    /* Not merely "one card": no trace of the others anywhere on the page. */
    const text = await bodyText(page);
    expect(text).not.toContain(ISTER.name);
    expect(text).not.toContain(THIRD.name);
    expect(text).not.toContain("Beta Development");
  });

  test("opens, and the Sales Agents surface opens with it", async ({ page }) => {
    await signInAs(page, AGENT);
    expect(new URL(page.url()).pathname).toBe(`/${HINOHARA.tenant}/${HINOHARA.project}/showroom`);

    /* Offered in the navigation and reachable from it, not only by URL. */
    const nav = page.getByRole("navigation", { name: "Sections" });
    await nav.getByRole("link", { name: "Sales Agents" }).click();
    await page.waitForURL(/\/agents/);
    await expect(page.locator(".iris-rings")).toHaveCount(1);
  });

  test("names every agent on it, not only her own results", async ({ page }) => {
    await signInAs(page, AGENT);
    await page.goto(`/${HINOHARA.tenant}/${HINOHARA.project}/agents`);

    const named = await agentsNamed(page);
    expect(named, "her own results are present").toContain(AGENT);
    expect(named.length, "and she is not the only one").toBeGreaterThan(1);

    /*
     * Each colleague carries their own figures, which is what makes this a team
     * view rather than a list of names: a card with a name and no numbers would
     * satisfy "sees every agent" and tell her nothing.
     */
    for (const row of await agentFigures(page)) {
      expect(row.detail, row.name).toMatch(/progressed/);
    }
  });

  test("carries no rating, credential, invitation or billing control", async ({ page }) => {
    await signInAs(page, AGENT);
    await page.goto(`/${HINOHARA.tenant}/${HINOHARA.project}/agents`);
    const text = await bodyText(page);

    /*
     * Seeing a colleague's meeting outcomes is not a licence to see anything
     * else about them. The IRIS rating is feedback on the software and stays
     * MADSPACE-only; the rest of this list has no business on a project surface
     * at all, for any role.
     */
    expect(text).not.toMatch(/Rates IRIS/);
    expect(text).not.toMatch(/@[a-z-]+\.example/i);
    expect(text).not.toMatch(/password|invitation|billing|invoice|subscription/i);
    await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(0);
  });
});

test.describe("the project she does not hold", () => {
  test("refuses every surface, and names nothing", async ({ page }) => {
    await signInAs(page, AGENT);

    for (const surface of SURFACES) {
      await page.goto(`/${ISTER.tenant}/${ISTER.project}/${surface}`);
      const text = await bodyText(page);
      expect(text, surface).toMatch(/not available to your account/i);
      expect(text, surface).not.toContain(ISTER.name);
      expect(text, surface).not.toContain("Beta Development");
    }
  });

  test("refuses its Sales Agents surface without leaking who is on it", async ({ page }) => {
    /* Who Kingsford's agents are, read by an account that may see them. */
    await signInAs(page, "MADSPACE Operations");
    await page.goto(`/${ISTER.tenant}/${ISTER.project}/agents`);
    const theirs = await agentsNamed(page);
    expect(theirs.length).toBeGreaterThan(0);

    await signInAs(page, AGENT);
    await page.goto(`/${ISTER.tenant}/${ISTER.project}/agents`);
    await expect(page.locator(".iris-rings")).toHaveCount(0);

    const text = await bodyText(page);
    for (const name of theirs) expect(text, name).not.toContain(name);
  });

  test("refuses an Ask Observer request about it", async ({ page }) => {
    await signInAs(page, AGENT);

    const held = await page.request.post("/api/ask", {
      data: {
        tenantSlug: HINOHARA.tenant,
        projectSlug: HINOHARA.project,
        question: "How does the team present this project?",
        period: "quarter_to_date",
      },
    });
    expect(held.status(), "the project she holds").toBe(200);

    for (const target of [ISTER, THIRD]) {
      const refused = await page.request.post("/api/ask", {
        data: {
          tenantSlug: target.tenant,
          projectSlug: target.project,
          question: "How does the team present this project?",
          period: "quarter_to_date",
        },
      });
      expect(refused.status(), target.name).not.toBe(200);
      expect(await refused.text(), target.name).not.toContain(target.name);
    }
  });

  test("refuses every other endpoint that carries its data", async ({ page }) => {
    await signInAs(page, AGENT);

    /*
     * Observer ships no export: there is no CSV, no download and no report
     * route, so there is no export path to test. What it does ship is three
     * further endpoints carrying project data, any of which an agent could
     * reach with a fetch. Each is asked about the project she does not hold,
     * and none answers with it.
     */
    const body = {
      tenantSlug: ISTER.tenant,
      projectSlug: ISTER.project,
      question: "Summarise this project.",
      period: "quarter_to_date",
    };

    for (const url of ["/api/ask", "/api/ask/stream", "/api/observer/voice/session"]) {
      const response = await page.request.post(url, { data: body });
      expect(response.status(), url).not.toBe(200);
      expect(await response.text(), url).not.toContain(ISTER.name);
    }

    const tool = await page.request.post("/api/observer/voice/tool", {
      data: { ...body, tool: "list_agents", arguments: {} },
    });
    expect(await tool.text(), "the voice tool").not.toContain(ISTER.name);
  });
});

test.describe("an agent granted both projects", () => {
  test("sees two cards, one from each developer", async ({ page }) => {
    await signIn(page, DUAL);

    const projects = await page.locator(".mp-project").allInnerTexts();
    expect([...projects].sort()).toEqual([ISTER.name, HINOHARA.name].sort());

    const developers = await page.locator(".mp-developer").allInnerTexts();
    expect([...new Set(developers)].sort()).toEqual(["Alpha Estates", "Beta Development"]);

    /* Two grants, not a developer's portfolio: Alpha's other project is out. */
    expect(projects).not.toContain(THIRD.name);
  });

  test("opens each one separately, and each shows only its own team", async ({ page }) => {
    await signIn(page, DUAL);

    const seen: Record<string, { names: string[]; verdict: string }> = {};
    for (const target of [HINOHARA, ISTER]) {
      await page.goto(`/${target.tenant}/${target.project}/agents`);
      await expect(page.locator(".iris-rings"), target.name).toHaveCount(1);
      seen[target.name] = {
        names: await agentsNamed(page),
        verdict: await page.locator("h1").first().innerText(),
      };

      /* The other project is not named on this one, anywhere. */
      const other = target === HINOHARA ? ISTER : HINOHARA;
      expect(await bodyText(page), target.name).not.toContain(other.name);
    }

    /*
     * NOT COMBINED — the property the second grant exists to test.
     *
     * These two teams do not overlap at all, so the check is the sharpest kind
     * available: neither page names a single person from the other, and the
     * verdict on each counts its own agents and its own meetings rather than
     * the pair's. If the grants were being read together, one page would carry
     * six agents and the other's names would be on it.
     */
    const a = seen[HINOHARA.name];
    const b = seen[ISTER.name];
    expect(a, HINOHARA.name).toBeDefined();
    expect(b, ISTER.name).toBeDefined();

    const overlap = (a?.names ?? []).filter((n) => (b?.names ?? []).includes(n));
    expect(overlap, "no colleague crosses the boundary").toEqual([]);

    for (const name of b?.names ?? []) {
      expect(a?.verdict, name).not.toContain(name);
    }

    /*
     * And the totals are each project's own. Read out of the verdict rather
     * than asserted as literals, so this keeps working when the synthetic
     * world changes — what it pins is the arithmetic, not the numbers.
     */
    const count = (verdict: string): { agents: number; meetings: number } => {
      const m = verdict.match(/(\d+) agents presented (\d+) meetings/);
      return { agents: Number(m?.[1] ?? 0), meetings: Number(m?.[2] ?? 0) };
    };
    const left = count(a?.verdict ?? "");
    const right = count(b?.verdict ?? "");

    expect(left.agents, "the first project reports its own team size").toBe(a?.names.length);
    expect(right.agents, "and so does the second").toBe(b?.names.length);
    for (const side of [left, right]) {
      expect(side.agents, "never the two teams added up").not.toBe(left.agents + right.agents);
      expect(side.meetings, "never the two projects added up").not.toBe(
        left.meetings + right.meetings,
      );
    }
  });

  test("counts one agent's meetings per project, not across them", async ({ page }) => {
    /*
     * Northgate and Kingsford have no one in common, so the sharpest version of
     * "never combined" needs two projects that share a person. Northgate and
     * Riverside do — Monika and Lucia present on both — and MADSPACE holds
     * them both, so the same reader can compare.
     *
     * The same name, on two projects, must carry two different sets of figures.
     * One figure repeated would mean the pages were counting a person rather
     * than a person's work on a project.
     */
    await signIn(page, "MADSPACE Operations");

    const byProject: Record<string, Record<string, string>> = {};
    for (const target of [HINOHARA, THIRD]) {
      await page.goto(`/${target.tenant}/${target.project}/agents`);
      byProject[target.name] = Object.fromEntries(
        (await agentFigures(page)).map((row) => [row.name, row.detail]),
      );
    }

    const left = byProject[HINOHARA.name] ?? {};
    const right = byProject[THIRD.name] ?? {};
    const shared = Object.keys(left).filter((name) => name in right);
    expect(shared.length, "these two projects share a presenter").toBeGreaterThan(0);

    for (const name of shared) {
      expect(left[name], `${name} is counted per project`).not.toBe(right[name]);
    }
  });

  test("reads a project identically to an agent who holds only that one", async ({ page }) => {
    /*
     * The figures belong to the project, not to the reader. Monika holds one
     * project; Akhilesh holds it and another. On that project they must see the
     * same thing — if the second grant moved a single number, something is
     * being aggregated across projects.
     */
    await signInAs(page, AGENT);
    await page.goto(`/${HINOHARA.tenant}/${HINOHARA.project}/agents`);
    const asSingle = await agentFigures(page);

    await signIn(page, DUAL);
    await page.goto(`/${HINOHARA.tenant}/${HINOHARA.project}/agents`);
    const asDual = await agentFigures(page);

    expect(asDual).toEqual(asSingle);
  });
});
