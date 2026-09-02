import { test, expect, type Page } from "@playwright/test";

test.skip(
  ({ isMobile }) => isMobile === true,
  "the concepts are desktop compositions; a phone layout follows the choice",
);

/**
 * Laboratory review artefacts.
 *
 * The two isolated Executive Overview concepts and the superseded profile
 * picker — a laboratory record, not a product screen — each in
 * repose and mid-interaction, at the two desktop viewports the concepts are to
 * be judged at. Not assertions — these produce the images a human looks at.
 *
 * Mobile is deliberately not shot here: the concepts are being judged as
 * desktop compositions first, and a phone layout invented before the direction
 * is chosen would be thrown away.
 */
const OUT =
  process.env["OBSERVER_LAB_SHOTS"] ??
  "C:/Users/42191/AppData/Local/Temp/claude/C--Users-42191-Documents-IRIS-OBSERVER/fca1dc8c-8691-435c-b958-dd07be3e192c/scratchpad/lab";

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // The one page-load orchestration has to finish before it is photographed.
  await page.waitForTimeout(700);
}

async function shoot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `${OUT}/${name}-${project}.png` });
}

test.describe("laboratory", () => {
  test("profile picker", async ({ page }, testInfo) => {
    await page.goto("/lab/sign-in");
    await settle(page);
    await shoot(page, "00-picker", testInfo.project.name);

    await page.getByRole("tab", { name: "Management" }).click();
    await settle(page);
    await shoot(page, "00-picker-management", testInfo.project.name);
  });

  for (const [concept, route] of [
    ["a-narrative", "/lab/overview-a"],
    ["b-spatial", "/lab/overview-b"],
  ] as const) {
    test(`concept ${concept}`, async ({ page }, testInfo) => {
      await page.goto(route);
      await settle(page);
      await shoot(page, `${concept}-1-repose`, testInfo.project.name);

      // Project Pulse: select a unit and prove the whole page answers to it.
      const cell = page.locator(".iris-cell").nth(11);
      await expect(cell).toBeVisible();
      await cell.click();
      await settle(page);
      await shoot(page, `${concept}-2-unit-selected`, testInfo.project.name);

      // Ask Observer: a real question, a real answer sheet.
      const ask = page.getByPlaceholder("Ask Observer…");
      await ask.click();
      await ask.fill("Which units are people actually looking at?");
      await ask.press("Enter");
      await settle(page);
      await shoot(page, `${concept}-3-ask-answer`, testInfo.project.name);
    });
  }
});
