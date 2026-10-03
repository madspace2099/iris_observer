import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * MÁTÉ'S DECISIONS OF 2026-10-02, ON THE SCREENS (DONTESEK1).
 *
 * Each test names the decision it holds and asserts it on the rendered page.
 * The labels are English by the scope decision of 2026-10-02.
 */

const ROOT = "/alpha/northgate";

test.beforeEach(({ isMobile }, testInfo) => {
  test.skip(isMobile || testInfo.project.name !== "desktop", "a reading of the page, not of its width");
});

test("R12-6 · an agent card leads with Agent detail, then its meetings and its report page", async ({
  page,
}) => {
  await signInAs(page, "Tomáš Varga");
  await page.goto(`${ROOT}/agents`, { waitUntil: "networkidle" });
  const card = page.locator("main article").filter({ has: page.getByRole("link", { name: "Agent detail →" }) }).first();
  const detail = await card.getByRole("link", { name: "Agent detail →" }).getAttribute("href");
  const agentId = /\/agents\/([^/?]+)/.exec(detail ?? "")?.[1];
  expect(agentId, "the card names its agent").toBeTruthy();

  /* The one action is the pill; the two that follow are plain links. */
  await expect(card.locator("a.iris-action")).toHaveCount(1);
  const meetings = card.getByRole("link", { name: "Meetings", exact: true });
  const report = card.getByRole("link", { name: "Report", exact: true });
  await expect(meetings).not.toHaveClass(/iris-action/);
  await expect(report).not.toHaveClass(/iris-action/);

  await meetings.click();
  await page.waitForURL(/\/meetings\?/);
  expect(new URL(page.url()).searchParams.get("agent")).toBe(agentId);
  await expect(page.getByLabel("Agent", { exact: true })).toHaveValue(agentId ?? "");

  await page.goBack({ waitUntil: "networkidle" });
  await card.getByRole("link", { name: "Report", exact: true }).click();
  await page.waitForURL(/\/report\?/);
  expect(new URL(page.url()).searchParams.get("agent")).toBe(agentId);
  /* The report page, not the export panel. */
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("R02-1 · the Briefing chip and its sentence name what they compare against, and neither says On course", async ({
  page,
}) => {
  /*
   * The sentence beside the chip names the same window (FEJEZET1): "On course"
   * needs a named plan and threshold, and none exists. Exact words only on
   * Northgate, whose day is pinned; ISTER TOWER changes with the lab's plane.
   */
  const EXPECTED: Readonly<Record<string, string>> = {
    [`${ROOT}/showroom`]: "Against last month, meetings and progression held up.",
    [`${ROOT}/showroom?period=last_28_days`]: "Against the previous 28 days, meetings and progression held up.",
    [`${ROOT}/showroom?period=last_quarter`]:
      "There is no earlier period to compare against, so there is no verdict.",
  };
  await signInAs(page, "Tomáš Varga");
  for (const path of [...Object.keys(EXPECTED), "/alpha/ister-tower/showroom"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const chip = (await page.locator(".ox-head-aside .ox-chip").first().innerText()).trim();
    expect(chip, path).not.toBe("On course");
    expect(chip, path).toMatch(/^(?:(?:Above|In line with|Below|Mixed against) \S.*|No verdict)$/);
    const answer = (await page.locator(".ox-head .ox-answer").first().innerText()).trim();
    expect(answer, path).not.toMatch(/on course/i);
    if (chip === "No verdict") expect(answer, path).not.toMatch(/^Against /);
    else
      expect(answer, `${path}: the sentence names the chip's window`).toContain(
        `Against ${chip.replace(/^(?:Above|In line with|Below|Mixed against) /, "")}, `,
      );
    if (path in EXPECTED) expect(answer, path).toBe(EXPECTED[path]);
  }
});

test("R04-1 · R07-3 · the shortlist follow-up check is retired on attention and on units", async ({
  page,
}) => {
  await signInAs(page, "Tomáš Varga");
  await page.goto(`${ROOT}/attention`, { waitUntil: "networkidle" });
  const attention = await page.locator("main").innerText();
  expect(attention).not.toContain("High interest, no follow-up recorded");
  expect(attention).not.toContain("Units shortlisted with no follow-up recorded");
  await page.goto(`${ROOT}/units`, { waitUntil: "networkidle" });
  const units = await page.locator("main").innerText();
  expect(units).not.toContain("meetings that shortlisted a unit");
  expect(units).toContain("A unit opened repeatedly and never kept is a question the register cannot show in a column.");
});

test("R01-2 · Northgate's Ask opens on computed questions, with no scripted scenario", async ({
  page,
}) => {
  await signInAs(page, "Tomáš Varga");
  await page.goto(`${ROOT}/ask`, { waitUntil: "networkidle" });
  const ask = await page.locator("main").innerText();
  expect(ask).toContain("How many presentations were recorded, and how did they end?");
  expect(ask).not.toMatch(/Viktória|viewings held at 46|A-505/);
});

test("R05-4 · Sales Flow's Cycle time names where the cycle starts", async ({ page }) => {
  await signInAs(page, "Tomáš Varga");
  await page.goto(`${ROOT}/flow`, { waitUntil: "networkidle" });
  const group = page.getByRole("group", { name: "Cycle time" });
  await expect(group).toContainText(
    "Measured from the first recorded showroom opening to the date the deal entered the Sold stage.",
  );
  await expect(group).toContainText(/Sales cycle|No sale/);
});

test("R07-4 · a sold unit's page states its cycle, or why it has none", async ({ page }) => {
  await signInAs(page, "Tomáš Varga");
  await page.goto(`${ROOT}/units/A-802`, { waitUntil: "networkidle" });
  await expect(page.locator("main")).toContainText(
    "Sales cycle: 105 days. Measured from the first recorded showroom opening to the date the deal entered the Sold stage.",
  );
  await page.goto(`${ROOT}/units/B-502`, { waitUntil: "networkidle" });
  await expect(page.locator("main")).toContainText(
    "Sales cycle: none counted, because its first recorded opening is the first moment the data covers",
  );
});

test("R03-5 · a reopened answer says it is recalculated", async ({ page }) => {
  await signInAs(page, "Tomáš Varga");
  await page.goto(`${ROOT}/ask/history`, { waitUntil: "networkidle" });
  const href = await page.locator('main a[href*="/ask/"]').filter({ hasNotText: /Ask a new question|Earlier questions/ }).first().getAttribute("href");
  expect(href).toMatch(/\/ask\/(?!history)[^/?]+/);
  await page.goto(href ?? "", { waitUntil: "networkidle" });
  await expect(page.locator("main")).toContainText(
    "This answer is recalculated from the latest data when you reopen it.",
  );
});
