import { test, type Page } from "@playwright/test";

/**
 * The review set for this remediation milestone.
 *
 * Not assertions — these produce the images a human looks at before the work is
 * approved. Every surface named in the milestone appears, at the widths the
 * defects were reported at, plus the states that only exist at runtime.
 */
const OUT =
  process.env["OBSERVER_MILESTONE_SHOTS"] ??
  "C:/Users/42191/AppData/Local/Temp/claude/C--Users-42191-Documents-IRIS-OBSERVER/fca1dc8c-8691-435c-b958-dd07be3e192c/scratchpad/milestone";

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(`Continue as ${name}`) }).click();
  await page.waitForURL(/\/(showroom|overview)/);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
}

test.describe("milestone review", () => {
  // The conditional form of `test.skip` takes only the fixtures object; the
  // project is read from `test.info()` instead.
  test.skip(() => test.info().project.name !== "wide", "One viewport drives the set.");

  test("sign-in", async ({ page }) => {
    await page.goto("/sign-in");
    await page.evaluate(() => document.fonts.ready);
    await shoot(page, "01-sign-in");
  });

  test("developer briefing", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await shoot(page, "02-briefing-developer");
  });

  test("sales agent briefing", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    await shoot(page, "03-briefing-agent");
  });

  test("agency manager context switching", async ({ page }) => {
    await signInAs(page, "Tomáš Varga");
    await shoot(page, "04-manager-alpha");
    await page.getByRole("combobox", { name: "Developer" }).selectOption("beta");
    await page.waitForURL(/\/beta\//);
    await shoot(page, "05-manager-beta");
  });

  for (const [name, path] of [
    ["06-sales-flow", "/alpha/northgate/flow"],
    ["07-project", "/alpha/northgate/project"],
    ["08-sales-agents", "/alpha/northgate/agents"],
    ["09-presentation-dna", "/alpha/northgate/presentation"],
    ["10-unit-attention", "/alpha/northgate/units"],
    ["12-storytelling", "/alpha/northgate/storytelling"],
    ["13-meetings", "/alpha/northgate/meetings"],
  ] as const) {
    test(name, async ({ page }) => {
      await signInAs(page, "Petra Novák");
      await page.goto(path);
      await shoot(page, name);
    });
  }

  test("11-unit-attention-selected", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/units");
    await page.locator(".iris-matrix-row").first().click();
    await shoot(page, "11-unit-attention-selected");
  });

  test("14-meeting-detail", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/meetings");
    await page.locator(".iris-matrix-row").first().click();
    await page.waitForURL(/\/meetings\/mtg_/);
    await shoot(page, "14-meeting-detail");
  });

  test("15-viktoria-brief", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    await page.goto("/alpha/northgate/meetings/mtg_viktoria0827");
    await shoot(page, "15-viktoria-brief");
  });

  test("16-disconnected-crm", async ({ page }) => {
    // Riverside has no CRM connected: every outcome rate must render as
    // unavailable rather than as nil.
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/riverside/showroom");
    await shoot(page, "16-disconnected-crm");
  });

  test("17-insufficient-data", async ({ page }) => {
    // Kingsford has been selling three weeks. No previous period exists.
    await signInAs(page, "Tomáš Varga");
    await page.goto("/beta/kingsford/showroom");
    await shoot(page, "17-insufficient-data");
  });

  test("18-observer-states", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.waitForTimeout(600);

    await page.getByPlaceholder(/^Ask Observer about/).fill("Explain why Compare mode fell, and cite the evidence.");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.waitForTimeout(400);
    await shoot(page, "18-observer-thinking");

    await page.waitForTimeout(9000);
    await shoot(page, "19-observer-answered");
  });

  test("20-narrow-widths", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    for (const [label, width] of [
      ["1366", 1366],
      ["1280", 1280],
      ["1024", 1024],
    ] as const) {
      await page.setViewportSize({ width, height: 800 });
      for (const [name, path] of [
        ["units", "/alpha/northgate/units"],
        ["presentation", "/alpha/northgate/presentation"],
      ] as const) {
        await page.goto(path);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/20-${name}-${label}.png` });
      }
    }
  });
});
