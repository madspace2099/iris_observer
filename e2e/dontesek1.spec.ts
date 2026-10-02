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

test("R02-1 · the Briefing chip names what it compares against, and never a bare On course", async ({
  page,
}) => {
  await signInAs(page, "Tomáš Varga");
  for (const path of [`${ROOT}/showroom`, `${ROOT}/showroom?period=last_28_days`, "/alpha/ister-tower/showroom"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const chip = (await page.locator(".ox-head-aside .ox-chip").first().innerText()).trim();
    expect(chip, path).not.toBe("On course");
    expect(chip, path).toMatch(/^(?:(?:Above|In line with|Below|Mixed against) \S.*|No verdict)$/);
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

