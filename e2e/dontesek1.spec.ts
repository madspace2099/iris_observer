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
