import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * P2-21: THE VERIFIED ITEMS, ON THE PAGE A READER OPENS (EJJEL1, 2026-10-02).
 *
 * The acceptance measurement (`docs/23-phase2-acceptance.md`) held 38 of its 88
 * items VERIFIED, and 27 of those rested on a unit test or on reading the
 * source alone. A status read from the source has been wrong before (P2-07),
 * so each of those 27 is checked here on the rendered screen, in the words
 * the screen prints. Where the synthetic world cannot reach a branch, the
 * test says which half it holds and the measurement records the rest.
 *
 * Every test names its item by route and position (R03-4 is R03's fourth row)
 * and asserts only what the requirement claims.
 */

const ROOT = "/alpha/northgate";

async function mainText(page: Page, who: string, path: string): Promise<string> {
  await signInAs(page, who);
  await page.goto(path, { waitUntil: "networkidle" });
  return page.locator("main").innerText();
}

/** The text between two headings a page prints, both included only as bounds. */
function between(text: string, from: string, to: string): string {
  /* A card's heading is in the reader's case since the Hyper kit; a kicker is in capitals. */
  const at = (needle: string, after: number) => {
    const i = text.slice(after).toLowerCase().indexOf(needle.toLowerCase());
    return i < 0 ? -1 : after + i;
  };
  const start = at(from, 0);
  const end = at(to, start + from.length);
  expect(start, `"${from}" is on the page`).toBeGreaterThanOrEqual(0);
  expect(end, `"${to}" follows "${from}"`).toBeGreaterThan(start);
  return text.slice(start + from.length, end);
}

test.beforeEach(({ isMobile }, testInfo) => {
  test.skip(isMobile || testInfo.project.name !== "desktop", "a reading of the page, not of its width");
});

/*
 * The Briefing's "Worth acting on" region. Its note and each state's rank stand
 * behind an `i` since the owner asked for less text (2026-10-22, ADR-0058), so
 * the region is found by its heading rather than between two printed lines.
 */
function worthActing(page: Page) {
  return page
    .locator("main section.ox-plane")
    .filter({ has: page.getByRole("heading", { name: "Worth acting on" }) });
}

test("R02-2 · R04-6 · the Briefing's alert is the first state What needs attention raised", async ({
  page,
}) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/showroom`);
  const alert = (await worthActing(page).locator(".ox-result > span").first().innerText()).trim();
  await page.goto(`${ROOT}/attention`, { waitUntil: "networkidle" });
  const raised = page.getByRole("list", { name: "States raised in this period" });
  const titles = (await raised.locator("li.ox-alert h3").allInnerTexts()).map((t) => t.trim());
  expect(alert, "the Briefing names one alert").toBeTruthy();
  expect(titles[0], "and it is the first one raised").toContain(alert);
  await expect(
    raised.locator("li.ox-alert").first().locator(".iris-info-panel"),
    "the states are ranked",
  ).toContainText("Rank 1 of");
});

test("R02-5 · a Briefing draws one alert or none, never a row of cards", async ({ page }) => {
  for (const [who, path] of [
    ["Tomáš Varga", `${ROOT}/showroom`],
    ["Tomáš Varga", "/beta/kingsford/showroom"],
    ["Petra Novák", "/alpha/riverside/showroom"],
  ] as const) {
    await mainText(page, who, path);
    const result = worthActing(page).locator(".ox-result");
    await expect(result, path).toHaveCount(1);
    const lines = (await result.innerText())
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    expect(lines.length, `${path}: one title and its one way in, at most`).toBeLessThanOrEqual(2);
  }
});

test("R03-1 · the Pinned section stands only over conversations someone pinned", async ({ page }) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/ask/history`);
  const pinned = /(\d+) pinned of (\d+)/.exec(text);
  expect(pinned, "the section counts what it holds").not.toBeNull();
  expect(Number(pinned?.[1])).toBeGreaterThan(0);
});

test("R03-2 · R03-6 · no My questions or Reports filter without the data behind it", async ({
  page,
}) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/ask/history`);
  const main = page.locator("main");
  for (const name of ["My questions", "Reports", "All"]) {
    await expect(main.getByRole("tab", { name })).toHaveCount(0);
    await expect(main.getByRole("radio", { name })).toHaveCount(0);
  }
  await expect(main.getByRole("searchbox")).toHaveCount(1);
});

test("R03-3 · each row's title is the question asked, not a written summary", async ({ page }) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/ask/history`);
  const register = between(text, "Every question, newest first", "Ask IRIS about");
  /* A row is its title, then its date line: "23 Aug · 06:43". */
  const lines = register.split("\n").map((l) => l.trim());
  const titles = lines.filter((_, i) => /^\d{1,2} [A-Z][a-z]{2} · \d{2}:\d{2}$/.test(lines[i + 1] ?? ""));
  expect(titles.length).toBeGreaterThan(0);
  for (const title of titles) expect(title, "a question").toMatch(/\?$/);
});

test("R03-4 · pin, rename and delete are not offered where nothing writes them", async ({ page }) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/ask/history`);
  const main = page.locator("main");
  for (const name of [/^Pin/i, /^Rename/i, /^Delete/i]) {
    await expect(main.getByRole("button", { name })).toHaveCount(0);
  }
  expect(text).toContain("nothing on this deployment writes to the conversation store");
});

test("R04-2 · lateness is Not evaluated without a task, a deadline and a completion", async ({
  page,
}) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/attention`);
  /* A row of the register is its answer, the check's name, what it found and its step (ADR-0058). */
  const lateness = checkRow(page, "Lateness");
  await expect(lateness.locator('[data-part="answer"]')).toHaveText("Not evaluated");
  expect(await lateness.innerText()).not.toMatch(/\b(Raised|Clear)\b/);
});

test("R04-3 · a missing outcome and an unverified one are two checks with two answers", async ({
  page,
}) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/attention`);
  const notRecorded = checkRow(page, "Outcome not recorded");
  const notVerified = checkRow(page, "Outcomes not verified");
  /* A raised row names its card, and the card carries the figure (ADR-0058). */
  await expect(notRecorded.locator('[data-part="found"]')).toHaveText(
    "Above: Meetings ending without a recorded outcome",
  );
  await expect(
    page
      .locator("main li.ox-alert", { hasText: "Meetings ending without a recorded outcome" })
      .locator(".ox-alert-detail"),
  ).toHaveText(/\d+ of \d+ presentations/);
  await expect(notVerified.locator('[data-part="answer"]')).toHaveText("Not evaluated");
});

/** One row of What needs attention's register, by the check's name. */
function checkRow(page: Page, name: string) {
  return page
    .getByRole("list", { name: "Every check, and what it found" })
    .locator(":scope > li")
    .filter({ has: page.locator(".sheet-check-name", { hasText: new RegExp(`^${name}$`) }) });
}

test("R04-5 · no state claims lost revenue or blames an agent", async ({ page }) => {
  for (const path of [`${ROOT}/attention`, `${ROOT}/showroom`]) {
    /* What stands behind a closed `i` is screened too (ADR-0058): innerText skips it. */
    const text = [
      await mainText(page, "Tomáš Varga", path),
      ...(await page.locator("main .iris-info-panel").allTextContents()),
    ].join("\n");
    expect(text, path).not.toMatch(/lost revenue|revenue lost|missed sales?|fault|blame|negligen/i);
  }
});

test("R05-1 · Sales Flow says which blocks follow the period and which their own window", async ({
  page,
}) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/flow`);
  expect(text).toContain("The summary cards read the whole dataset over the window you pick.");
  expect(text).toContain("These read the period in the bar at the top");
});

test("R05-2 · the four groups are drawn and named", async ({ page }) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/flow`);
  for (const group of ["VOLUME", "PROGRESS", "CONVERSION", "CYCLE TIME"]) {
    expect(text, group).toContain(group);
  }
});

test("R05-6 · an IRIS-assisted sale is a time relation, never a cause", async ({ page }) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/flow`);
  const assisted = between(text, "IRIS-ASSISTED SALES", "MEETINGS, AND HOW MANY PROGRESSED");
  expect(assisted).toMatch(/followed an IRIS showing of the unit within \d+ hours/);
  expect(assisted).not.toMatch(/caused|because of IRIS|led to the sale|drove/i);
});

test("R05-8 · the longest lists show five rows and keep the rest behind Show all", async ({
  page,
}) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/flow`);
  const collapsed = page.locator("main details:has(> summary:text-is('Show all'))");
  expect(await collapsed.count()).toBeGreaterThan(0);
  for (const details of await collapsed.all()) {
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  }
});

test("R06-7 · interest is by catalogue room count, never by an interior room", async ({ page }) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/project`);
  expect(text).toMatch(/\b(One|Two|Three|Four)-room\b/);
  expect(text).not.toMatch(/kitchen|bathroom|bedroom|living room|interior/i);
});

test("R07-5 · a unit's page names no buyer", async ({ page }) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/units`);
  const href = await page.locator('main a[href*="/units/"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href ?? "", { waitUntil: "networkidle" });
  await expect(page.locator("main")).toContainText("No buyer is named here");
});

test("R07-6 · the register prints no verified-outcome row beside the sold status", async ({
  page,
}) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/units`);
  expect(text).not.toContain("Verified outcome");
});

/* Sold in the catalogue with no dated sale in the CRM, and available (VEGHAJRAS1 probe). */
const SOLD_UNDATED = "B-201";
const UNSOLD = "B-501";

test("R07-6 · a unit sold with no dated sale says it has no cycle, and an unsold one says nothing", async ({
  page,
}) => {
  await signInAs(page, "Tomáš Varga");
  const main = page.locator("main");
  const status = main.locator(".ox-tally-item").filter({ has: page.locator("dt", { hasText: /^Status$/ }) });
  await page.goto(`${ROOT}/units/${SOLD_UNDATED}`, { waitUntil: "networkidle" });
  await expect(status).toContainText("Sold");
  await expect(main).toContainText(
    "Sales cycle: none, because the catalogue lists this unit as sold and the CRM holds no sale of it.",
  );
  await expect(main, "its real first opening, not a false none").toContainText("First recorded showroom opening:");
  await expect(main).not.toContainText(/Sales cycle: \d/);
  await page.goto(`${ROOT}/units/${UNSOLD}`, { waitUntil: "networkidle" });
  await expect(status).toContainText("Available");
  await expect(main).not.toContainText("Sales cycle:");
});

test("R08-4 · the outcome filter is named as recorded", async ({ page }) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/meetings`);
  await expect(page.getByLabel("Recorded outcome", { exact: true })).toHaveCount(1);
});

test("R08-5 · nothing on the meetings register is called overdue", async ({ page }) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/meetings`);
  expect(text).not.toMatch(/overdue/i);
});

test("R11-1 · the caption names the aggregation, and the lane is not one meeting", async ({
  page,
}) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/presentation`);
  expect(text).toContain("every section stands at its mean position across that lane’s meetings");
  expect(text).toContain("not on one meeting’s path");
});

test("R11-2 · every section code carries its full name", async ({ page }) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/presentation`);
  const named = await page
    .locator("main abbr[title]")
    .evaluateAll((els) => els.map((e) => [e.textContent ?? "", e.getAttribute("title") ?? ""]));
  const pairs = new Map(named);
  expect(pairs.get("HOM")).toBe("Home");
  expect(pairs.get("AMN")).toBe("Amenities");
  expect(pairs.get("SUR")).toBe("Surroundings");
  expect(pairs.get("TWX")).toBe("Time & weather");
});

test("R12-1 · R12-3 · the roster credits no CRM and states no offers", async ({ page }) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/agents`);
  expect(text).not.toContain("CRM");
  expect(text).not.toMatch(/\boffers?\b/i);
});

test("R12-4 · a meeting with no linked contact is counted apart, not as a first", async ({
  page,
}) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/agents`);
  expect(text).toContain("First meeting");
  /* The row's plain name since ADR-0057; its `i` says why it is neither a first nor a return. */
  expect(text).toContain("Buyer not identified");
});

test("R13-1 · the agent's page has one heading", async ({ page }) => {
  await mainText(page, "Tomáš Varga", `${ROOT}/agents/agt_akhilesh`);
  await expect(page.locator("h1")).toHaveCount(1);
});

test("R13-6 · where else an agent presents is limited to this account's projects", async ({
  page,
}) => {
  const text = await mainText(page, "Tomáš Varga", `${ROOT}/agents/agt_akhilesh`);
  const listed = between(text, "WHERE ELSE THEY PRESENT", "Scoped to the projects this account holds");
  await page.goto("/projects", { waitUntil: "networkidle" });
  const held = await page.locator("main").innerText();
  const names = listed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/meetings? in |^This project$/.test(l));
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(held, `${name} is a project this account holds`).toContain(name);
});
