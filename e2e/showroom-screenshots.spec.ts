import { test, type Page } from "@playwright/test";

/**
 * Review artefacts for the Showroom Intelligence surfaces.
 *
 * Not assertions — these produce the images a human looks at. Written outside
 * the repository: a screenshot committed without a visual baseline policy is a
 * binary nobody updates and everybody ignores.
 */
const OUT =
  process.env["OBSERVER_SHOWROOM_SHOTS"] ??
  "C:/Users/42191/AppData/Local/Temp/claude/C--Users-42191-Documents-IRIS-OBSERVER/fca1dc8c-8691-435c-b958-dd07be3e192c/scratchpad/showroom";

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/(showroom|overview)/);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string, project: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-${project}.png` });
  await page.screenshot({ path: `${OUT}/${name}-${project}-full.png`, fullPage: true });
}

test.describe("showroom intelligence", () => {
  test("showroom overview", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await shoot(page, "01-showroom", info.project.name);
  });

  test("presentation intelligence, two agents", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/presentation?mode=agents&left=agt_monika&right=agt_akhilesh");
    await shoot(page, "02-presentation-agents", info.project.name);
  });

  test("presentation intelligence, cohorts", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/presentation?mode=cohorts");
    await shoot(page, "03-presentation-cohorts", info.project.name);
  });

  test("unit attention", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/units");
    await shoot(page, "04-units", info.project.name);
    await page.locator(".iris-matrix-row").first().click();
    await shoot(page, "05-unit-selected", info.project.name);
  });

  test("every column explains itself", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/units");
    // The info control is the answer to "what measurement is behind this
    // number", so it is reviewed rather than assumed.
    await page.getByRole("button", { name: /What Typical look measures/ }).click();
    await shoot(page, "11-measurement-explained", info.project.name);
  });

  test("storytelling", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/storytelling");
    await shoot(page, "06-storytelling", info.project.name);
  });

  test("meeting replay", async ({ page }, info) => {
    await signInAs(page, "Monika Kováčová");
    await page.goto("/alpha/northgate/meetings");
    await shoot(page, "07-meetings", info.project.name);
    await page.locator(".iris-matrix-row").first().click();
    await page.waitForURL(/\/meetings\/mtg_/);
    await shoot(page, "08-replay", info.project.name);
    await page.locator(".iris-replay-step").nth(2).click();
    await shoot(page, "09-replay-step", info.project.name);
  });

  test("ask observer", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    const ask = page.getByPlaceholder("Ask Observer…");
    await ask.fill("Compare Monika and Akhilesh's presentation flows.");
    await ask.press("Enter");
    await page.getByRole("dialog", { name: "Ask Observer" }).waitFor();
    await shoot(page, "10-ask", info.project.name);
  });
});
