import { test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * Review artefacts for the chart vocabulary.
 *
 * Every shape added beyond the first four appears in at least one of these, so
 * a chart that renders as an empty box or a flat line is caught by looking
 * rather than by a selector that only proves the element exists.
 */
/*
 * Inside the repository. `_review/` rather than `test-results/`, which
 * Playwright clears before every run; and rather than the absolute Windows
 * temp path this defaulted to, which swept the images on one machine and, on
 * any other, is a relative path that makes a folder called `C:`.
 */
const OUT = process.env["OBSERVER_CHART_SHOTS"] ?? "_review/charts";


async function shoot(page: Page, name: string, project: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}-${project}.png` });
  await page.screenshot({ path: `${OUT}/${name}-${project}-full.png`, fullPage: true });
}

test.describe("chart vocabulary", () => {
  test("sales flow, every window", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/flow");
    await shoot(page, "01-flow", info.project.name);

    // The window control is the whole point of the KPI strip, so the two ends
    // of its range are reviewed rather than assumed to behave.
    await page.goto("/alpha/northgate/flow?window=today");
    await shoot(page, "02-flow-today", info.project.name);

    await page.goto("/alpha/northgate/flow?window=all");
    await shoot(page, "03-flow-all", info.project.name);
  });

  test("project, target and journey", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/project");
    await shoot(page, "04-project", info.project.name);
  });

  test("agents, one shape each", async ({ page }, info) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/agents");
    await shoot(page, "05-agents", info.project.name);
  });
});
