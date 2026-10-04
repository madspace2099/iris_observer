import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * P2-21: THE HALVES THE RENDER DID NOT HOLD (P221-MERES, 2026-10-03).
 *
 * `p221-render.spec.ts` put 27 verified items on the rendered page. Measured
 * again item by item, nineteen of the items it and its neighbours hold have a
 * second claim the render never asserted: the definitions beside the four
 * group names, the project half of a door that keeps its period, the returning
 * buckets beside "First meeting". Each was built and read from the source. A
 * status read from the source has been wrong before, so each is asserted here
 * on the screen, in the words the screen prints.
 *
 * Two halves stay off the render because the synthetic world cannot reach
 * them: a Briefing with nothing raised (R02-5) and a sale with no Sold date
 * (R07-6). The measurement in `docs/23` records them as such.
 *
 * Every test names its item by route and position and asserts only what the
 * requirement claims.
 */

const ROOT = "/alpha/northgate";

async function mainText(page: Page, who: string, path: string): Promise<string> {
  await signInAs(page, who);
  await page.goto(path, { waitUntil: "networkidle" });
  return page.locator("main").innerText();
}

test.beforeEach(({ isMobile }, testInfo) => {
  test.skip(isMobile || testInfo.project.name !== "desktop", "a reading of the page, not of its width");
});

test("R02-6 · the Briefing's three doors keep this project and this period", async ({ page }) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/showroom?period=last_28_days`);
  const doors = page.locator('nav[aria-label="Views"] a');
  await expect(doors.filter({ hasText: /^Open / })).toHaveCount(3);
  for (const href of await doors.evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) {
    expect(href, "the door stays in this project").toMatch(/^\/alpha\/northgate\//);
    expect(href, "and carries the period").toContain("period=last_28_days");
  }
  for (const [label, path] of [
    ["Open Sales Flow", "flow"],
    ["Open Project", "project"],
    ["Open Sales Agents", "agents"],
  ] as const) {
    await page.goto(`${ROOT}/showroom?period=last_28_days`, { waitUntil: "networkidle" });
    await page.locator('nav[aria-label="Views"]').getByRole("link", { name: label }).click();
    await page.waitForURL(new RegExp(`/alpha/northgate/${path}\\?(.*&)?period=last_28_days`));
  }
});

test("R03-2 · each earlier question names its project, its period and its turns", async ({ page }) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/ask/history`);
  const lines = await page
    .locator("li.ox-thread-row .ox-thread-context")
    .evaluateAll((cs) => cs.map((c) => (c.textContent ?? "").trim()));
  expect(lines.length).toBeGreaterThan(0);
  const shape = /^Northgate Residences · [^·]+ · (?:([^·]+) · )?\d+ turns?(?: Pinned)?$/;
  for (const line of lines) expect(line, "project · period · [selection ·] turns").toMatch(shape);
  const selections = lines.map((l) => shape.exec(l)?.[1]);
  expect(selections.some((s) => s !== undefined), "a row with a selection names it").toBe(true);
  expect(selections.some((s) => s === undefined), "a row without one prints none").toBe(true);
});

test("R04-5 · every raised state names its severity, and the page prints the rule", async ({
  page,
}) => {
  for (const [who, path] of [
    ["Tomáš Varga", `${ROOT}/attention`],
    ["Tomáš Varga", "/beta/kingsford/attention"],
  ] as const) {
    const text = await mainText(page, who, path);
    expect(text).toContain("Red is kept for a record going missing right now");
    /* The ordering rule is method, folded since FEJEZET1 (R04-7): read it opened. */
    await page.locator("main details.iris-method summary").click();
    expect(await page.locator("main").innerText()).toContain(
      "Severity first, then how much each one is about.",
    );
    const headings = await page
      .locator("main h3")
      .evaluateAll((hs) => hs.map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim()));
    expect(headings.length, `${path}: something is raised`).toBeGreaterThan(0);
    for (const h of headings) expect(h, path).toMatch(/^(Critical|Attention|Info) — /);
  }
});

test("R05-1 · Sales Flow names the blocks that read the period and the ones that do not", async ({
  page,
}) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/flow`);
  expect(text).toContain("The summary cards read the whole dataset over the window you pick.");
  expect(text).toContain(
    "The deal ladder, stalled deals and IRIS-assisted sales do not read the period either: they read the deals the CRM states, whatever the period.",
  );
  expect(text).toContain(
    "These read the period in the bar at the top: meetings and how many progressed, every outcome, what changed, when meetings happen, presentations week by week, what those meetings became, how each agent’s meetings end, the not-interested group, the longest presentations, presentations given, and the findings.",
  );
});

test("R05-2 · each of the four groups carries its own definition", async ({ page }) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/flow`);
  for (const [name, definition] of [
    ["Volume", "How much the showroom was used: the presentations given, and the units opened in them."],
    [
      "Progress",
      "How far the meetings went: of those with an outcome recorded, the share that ended at a follow-up or better.",
    ],
    [
      "Conversion",
      "The share of buyers who move forward from each rung to the next, counted by when they entered it rather than when they moved.",
    ],
    [
      "Cycle time",
      "Measured from the first recorded showroom opening to the date the deal entered the Sold stage.",
    ],
  ] as const) {
    await expect(page.getByRole("group", { name, exact: true })).toContainText(definition);
  }
});

test("R05-8 · a long list shows five rows and keeps every other row, numbered on, behind Show all", async ({
  page,
}) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/flow`);
  const folds = page.locator("main details.iris-ranked-more");
  expect(await folds.count()).toBeGreaterThan(0);
  for (const fold of await folds.all()) {
    const shape = await fold.evaluate((d) => {
      const shown = d.previousElementSibling;
      const rest = d.querySelector("ol");
      return {
        shown: shown?.tagName === "OL" ? shown.querySelectorAll(":scope > li").length : -1,
        start: rest?.getAttribute("start"),
        rest: rest?.querySelectorAll(":scope > li").length ?? 0,
        open: (d as HTMLDetailsElement).open,
      };
    });
    expect(shape).toMatchObject({ shown: 5, start: "6", open: false });
    expect(shape.rest, "the folded rows are there, not dropped").toBeGreaterThan(0);
    await fold.locator("summary").click();
    for (const row of await fold.locator("ol > li").all()) await expect(row).toBeVisible();
  }
});

test("R06-3 · /project and /units read one attention index for the same rooms", async ({ page }) => {
  const project = await mainText(page, "Tomáš Varga", `${ROOT}/project`);
  const onProject = /Two-room\n+([\d.]+)× attention for its share of stock/.exec(project)?.[1];
  await page.goto(`${ROOT}/units`, { waitUntil: "networkidle" });
  const units = await page.locator("main").innerText();
  const onUnits = /Two-room units are [^\n]+\n+against an index of ([\d.]+)× their share/.exec(units)?.[1];
  expect(onProject, "the matrix prints the Two-room index").toBeTruthy();
  expect(onUnits, "the register's finding prints it too").toBe(onProject);
});

test("R06-8 · each Project finding offers one next step, and the lead finding exactly one", async ({
  page,
}) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/project`);
  const findings = page.locator("main article.iris-finding");
  expect(await findings.count()).toBeGreaterThan(0);
  for (const finding of await findings.all()) {
    expect(await finding.locator("a.iris-action").count()).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('main article.iris-finding[data-lead="true"] a.iris-action')).toHaveCount(1);
});

test("R07-1 · the plan and the register open the same unit, and the legend defines floor, attention and status", async ({
  page,
}) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/units`);
  const rowHref = (await page.locator("main .ox-table-code a").first().getAttribute("href")) ?? "";
  const code = new URL(rowHref, "http://x").pathname.split("/").pop() ?? "";
  expect(code).toMatch(/^[A-Z]-\d+$/);
  const cellHref = (await page.locator(`main a.ox-stack-unit[href$="/units/${code}"]`).getAttribute("href")) ?? "";
  expect(new URL(cellHref, "http://x").pathname).toBe(new URL(rowHref, "http://x").pathname);
  const key = await page.locator(".ox-stack-key").innerText();
  for (const line of [
    "Row · one floor, top floor first",
    "Brighter fill · more meaningful views in this period",
    "Dashed edge · reserved",
    "Hatched · sold",
  ]) {
    expect(key).toContain(line);
  }
  const headings: string[] = [];
  for (const href of [rowHref, cellHref]) {
    await page.goto(href, { waitUntil: "networkidle" });
    headings.push(await page.locator("h1").innerText());
  }
  expect(headings[0]).toContain(code);
  expect(headings[1]).toBe(headings[0]);
});

test("R07-5 · a unit's meetings name no visitor: every Visitor cell is a label, never a name", async ({
  page,
}) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/units`);
  const href = (await page.locator("main .ox-table-code a").first().getAttribute("href")) ?? "";
  await page.goto(href, { waitUntil: "networkidle" });
  const table = page.locator("main table").filter({ has: page.locator("th", { hasText: /^Visitor$/ }) });
  await expect(table).toHaveCount(1);
  const column = await table
    .locator("thead th")
    .evaluateAll((hs) => hs.findIndex((h) => (h.textContent ?? "").trim() === "Visitor"));
  expect(column).toBeGreaterThanOrEqual(0);
  const cells = await table
    .locator("tbody tr")
    .evaluateAll((rows, i) => rows.map((r) => (r.children[i]?.textContent ?? "").trim()), column);
  expect(cells.length, "the unit was opened in meetings").toBeGreaterThan(0);
  for (const cell of cells) {
    expect(cell).toMatch(/^(First meeting|Not linked to a contact|Returning · \d+(st|nd|rd|th) meeting)$/);
  }
  await expect(page.locator("main .ox-visitor-name")).toHaveCount(0);
});

test("R11-1 · no averaged lane opens a replay, and each states how many meetings it averages", async ({
  page,
}) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/presentation`);
  const lanes = page.locator("main .iris-dna-lane");
  expect(await lanes.count()).toBeGreaterThan(0);
  await expect(lanes.locator("a[href]")).toHaveCount(0);
  for (const lane of await lanes.all()) await expect(lane).toContainText(/\d+ meetings/);
  const team = /Team benchmark\s*(\d+) meetings/.exec(await page.locator("main").innerText())?.[1];
  expect(Number(team), "the team lane averages more than one meeting").toBeGreaterThan(1);
});

test("R11-3 · the chosen pair and period survive a switch of mode", async ({ page }) => {
  const scope = "period=last_quarter&mode=agents&left=agt_jan&right=agt_lucia";
  await mainText(page, "Tomáš Varga", `${ROOT}/presentation?${scope}`);
  for (const [tab, mode] of [
    ["Outcome cohorts", "cohorts"],
    ["Two agents", "agents"],
  ] as const) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForURL(new RegExp(`mode=${mode}`));
    await page.waitForLoadState("networkidle");
    const search = new URL(page.url()).searchParams;
    expect([search.get("left"), search.get("right"), search.get("period")], tab).toEqual([
      "agt_jan",
      "agt_lucia",
      "last_quarter",
    ]);
  }
  const chosen = await page.locator('main a[aria-current="true"]').allInnerTexts();
  expect(chosen.map((c) => c.replace(/\d+$/, "").trim())).toEqual(["Ján Hruška", "Lucia Bartošová"]);
  await page.goto(`${ROOT}/presentation?period=last_quarter&mode=agents&left=agt_martinkovac&right=agt_lucia`, {
    waitUntil: "networkidle",
  });
  expect(await page.locator("main").innerText(), "another project's agent is not drawn").not.toContain(
    "Martin Kováč",
  );
});

test("R11-4 · below twenty meetings on a side the comparison grades nobody", async ({ page }) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/presentation?mode=agents`);
  const counts = await page
    .locator('main a[aria-current="true"]')
    .evaluateAll((as) => as.map((a) => Number(/(\d+)$/.exec((a.textContent ?? "").trim())?.[1])));
  expect(Math.min(...counts), "one side of the default pair is under the floor").toBeLessThan(20);
  expect(text).toContain("Fewer than 20 meetings on a side");
  await expect(page.locator("main .iris-diff-row")).toHaveCount(0);
  const comparison = await page.locator("main aside.iris-plane").innerText();
  expect(comparison).not.toMatch(/\b(better|worse|best|worst)\b/i);
});

test("R11-6 · at phone width the comparison stands above the lanes, in one column", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await mainText(page, "Tomáš Varga", `${ROOT}/presentation?mode=cohorts`);
  const aside = await page.locator("main aside.iris-plane").boundingBox();
  const lanes = await page.locator("main section.iris-plane .iris-dna").first().boundingBox();
  expect(aside && lanes).toBeTruthy();
  expect(aside!.y + aside!.height, "the comparison ends before the lanes begin").toBeLessThanOrEqual(lanes!.y + 1);
  expect(Math.abs(aside!.x - lanes!.x), "one column").toBeLessThanOrEqual(32);
});

/*
 * R11-5 (VEGHAJRAS1): a sold and unsold comparison only with an evaluable
 * cohort, a buyer's path only from an existing link. Neither is drawn on any
 * mode, and the page's own list of what it cannot say gives each its reason.
 */
test("R11-5 · no sold and unsold comparison and no buyer’s path, and the page says why for each", async ({
  page,
}) => {
  await signInAs(page, "Tomáš Varga");
  for (const mode of ["agents", "cohorts", "periods"] as const) {
    await page.goto(`${ROOT}/presentation?mode=${mode}`, { waitUntil: "networkidle" });
    const tabs = await page
      .getByRole("tablist", { name: "Comparison mode" })
      .getByRole("tab")
      .allInnerTexts();
    expect(tabs, mode).toHaveLength(3);
    expect(tabs.join(" | "), `${mode}: no mode compares sales`).not.toMatch(/\b(un)?sold\b|\bsales?\b/i);
    expect(
      (await page.locator("main aside .iris-dna").allInnerTexts()).join(" | "),
      `${mode}: no lane is a sold or unsold group`,
    ).not.toMatch(/\b(un)?sold\b/i);
    const said = page
      .locator("main aside .iris-gap")
      .filter({ hasText: "What this source cannot say" })
      .locator("li");
    await expect(
      said.filter({ hasText: "Sold and unsold units are not compared" }).filter({ hasText: "control group" }),
      mode,
    ).toHaveCount(1);
    await expect(
      said.filter({ hasText: "no buyer’s path is drawn" }).filter({ hasText: "not linked to the visitor" }),
      mode,
    ).toHaveCount(1);
    await expect(page.locator("main").getByText(/buyer.s path/i), `${mode}: no buyer’s path offered`).toHaveCount(1);
  }
  await page.goto(`${ROOT}/presentation?mode=cohorts`, { waitUntil: "networkidle" });
  await expect(page.locator("main aside .iris-dna .iris-dna-lane"), "the cohorts lanes are drawn").toHaveCount(2);
});

test("R12-2 · under twenty meetings an agent gets counts, no flag and no comparison with the team", async ({
  page,
}) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/agents`);
  const cards = await page.locator("main .iris-ring-card").evaluateAll((cs) =>
    cs.map((c) => ({
      under: (c.textContent ?? "").includes("needed for a verdict"),
      flags: c.querySelectorAll(".iris-ring-flag").length,
      team: (c.textContent ?? "").includes("for the team"),
    })),
  );
  expect(cards.filter((c) => c.under).length, "an agent under the floor is on the page").toBeGreaterThan(0);
  for (const card of cards.filter((c) => c.under)) expect(card).toMatchObject({ flags: 0, team: false });
  await page.goto(`${ROOT}/flow?period=last_quarter`, { waitUntil: "networkidle" });
  const flow = await page.locator("main").innerText();
  expect(flow, "an agent with ten meetings is on Sales Flow").toContain("Lucia Bartošová");
  for (const line of flow.split("\n").filter((l) => l.includes("Lucia Bartošová"))) {
    expect(line).not.toContain("for the team");
  }
});

test("R12-4 · the roster breaks meetings into first, returning and not linked", async ({ page }) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/agents`);
  const lines = text.split("\n").map((l) => l.trim());
  expect(lines).toContain("First meeting");
  expect(lines).toContain("Not linked to a contact");
  expect(lines.some((l) => /^(2nd|3rd) meeting$|^Fourth or later$/.test(l)), "a returning bucket").toBe(true);
});

test("R12-5 · the IRIS rating is shown to MADSPACE on a FREE tenant, and to nobody else", async ({
  page,
}) => {
  const madspace = await mainText(page, "MADSPACE Operations", `${ROOT}/agents`);
  expect(madspace).toMatch(/Rates IRIS [\d.]+\/5 · \d+ responses · MADSPACE only/);
  const developer = await mainText(page, "Petra Novák", `${ROOT}/agents`);
  expect(developer).not.toContain("Rates IRIS");
});

test("R13-6 · where else an agent presents follows the reader's projects, not the agent's", async ({
  page,
}) => {
  const listOf = (text: string) => {
    const start = text.indexOf("WHERE ELSE THEY PRESENT");
    const end = text.indexOf("Scoped to the projects this account holds", start);
    expect(start).toBeGreaterThanOrEqual(0);
    return text.slice(start, end);
  };
  const manager = listOf(await mainText(page, "Tomáš Varga", `${ROOT}/agents/agt_monika`));
  expect(manager).toContain("ISTER TOWER");
  expect(manager, "a project this reader does not hold").not.toContain("Riverside Walk");
  const developer = listOf(await mainText(page, "Petra Novák", `${ROOT}/agents/agt_monika`));
  expect(developer, "the same agent, read by someone who holds it").toContain("Riverside Walk");
});

test("R13-7 · the agent and her manager read one page with the same figures", async ({ page }) => {
  const figures = (text: string) => {
    const start = text.indexOf("Activity in this period");
    const end = text.indexOf("FOLLOW-UPS COMPLETED", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return text.slice(start, end);
  };
  const manager = await mainText(page, "Tomáš Varga", `${ROOT}/agents/agt_monika`);
  const managerHeading = await page.locator("h1").innerText();
  const own = await mainText(page, "Monika Kováčová", `${ROOT}/agents/agt_monika`);
  expect(new URL(page.url()).pathname, "her own reading is this route").toBe(`${ROOT}/agents/agt_monika`);
  expect(await page.locator("h1").innerText()).toBe(managerHeading);
  expect(figures(own)).toBe(figures(manager));
});
