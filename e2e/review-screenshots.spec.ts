import { test, type Page } from "@playwright/test";

/**
 * Review artefacts.
 *
 * Not assertions — these produce the images a human looks at. They are written
 * outside the repository on purpose: a screenshot committed without a visual
 * baseline policy is a binary nobody updates and everybody ignores.
 *
 * Set OBSERVER_SHOTS to change the destination.
 */
const OUT =
  process.env["OBSERVER_SHOTS"] ??
  "C:/Users/42191/AppData/Local/Temp/claude/C--Users-42191-Documents-webiris/fca1dc8c-8691-435c-b958-dd07be3e192c/scratchpad/review";

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("button", { name: "Continue" })
    .click();
  // Sign-in lands on the Showroom since ADR-0023. This review set is about the
  // demoted executive surface, so it navigates on from there.
  await page.waitForURL(/\/(showroom|overview)/);
  await page.goto("/alpha/northgate/overview");
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string, project: string) {
  // The fold shot is the ten-second test made visible; the full shot is the
  // page as a reader would scroll it.
  await page.screenshot({ path: `${OUT}/${name}-${project}-fold.png` });
  await page.screenshot({ path: `${OUT}/${name}-${project}-full.png`, fullPage: true });
}

test.describe("review artefacts", () => {
  test("executive overview", async ({ page }, testInfo) => {
    await signInAs(page, "Petra Novák");
    await shoot(page, "01-executive-overview", testInfo.project.name);
  });

  test("sales agent overview", async ({ page }, testInfo) => {
    await signInAs(page, "Monika Kováčová");
    await shoot(page, "02-agent-overview", testInfo.project.name);
  });

  test("pre-meeting brief", async ({ page }, testInfo) => {
    await signInAs(page, "Monika Kováčová");
    await page.goto("/alpha/northgate/meetings/mtg_viktoria0827");
    await page.evaluate(() => document.fonts.ready);
    await shoot(page, "03-viktoria-brief", testInfo.project.name);
  });

  test("disconnected CRM", async ({ page }, testInfo) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/riverside/overview");
    await page.evaluate(() => document.fonts.ready);
    await shoot(page, "04-crm-disconnected", testInfo.project.name);
  });

  test("insufficient data", async ({ page }, testInfo) => {
    await signInAs(page, "Tomáš Varga");
    await page.goto("/beta/kingsford/overview");
    await page.evaluate(() => document.fonts.ready);
    await shoot(page, "05-insufficient-data", testInfo.project.name);
  });

  test("sign in", async ({ page }, testInfo) => {
    await page.goto("/sign-in");
    await page.evaluate(() => document.fonts.ready);
    await shoot(page, "06-sign-in", testInfo.project.name);
  });

  test("madspace administration", async ({ page }, testInfo) => {
    await signInAs(page, "MADSPACE Operations");
    await page.goto("/madspace");
    await page.evaluate(() => document.fonts.ready);
    await shoot(page, "07-madspace-admin", testInfo.project.name);
  });
});
