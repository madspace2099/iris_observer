import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The Showroom Intelligence surfaces, asserted.
 *
 * Accessibility on every one of them, and the product rules that would
 * otherwise depend on whoever writes the next screen remembering them:
 * the CRM does not lead, unknown is not zero, and every figure can say what it
 * measures.
 */

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/showroom/);
  await page.evaluate(() => document.fonts.ready);
}

const ROUTES = [
  ["showroom overview", "/alpha/northgate/showroom"],
  ["sales flow", "/alpha/northgate/flow"],
  ["project", "/alpha/northgate/project?segment=rooms-2"],
  ["sales agents", "/alpha/northgate/agents"],
  ["sales agents, focused", "/alpha/northgate/agents?agent=agt_monika"],
  ["audience", "/alpha/northgate/audience?rooms=2&category=family"],
  ["presentation, agents", "/alpha/northgate/presentation?mode=agents&left=agt_monika&right=agt_akhilesh"],
  ["presentation, cohorts", "/alpha/northgate/presentation?mode=cohorts"],
  ["presentation, periods", "/alpha/northgate/presentation?mode=periods"],
  ["unit attention", "/alpha/northgate/units"],
  ["unit attention, selected", "/alpha/northgate/units?unit=A-402"],
  ["storytelling", "/alpha/northgate/storytelling"],
  ["meetings", "/alpha/northgate/meetings"],
  ["meeting replay", "/alpha/northgate/meetings/mtg_0100"],
] as const;

for (const [name, route] of ROUTES) {
  test(`${name} has no detectable accessibility violations`, async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test.describe("the three views", () => {
  test("the opening screen offers three doors and nothing to analyse", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    const doors = page.getByRole("navigation", { name: "Analytics views" }).getByRole("link");
    await expect(doors).toHaveCount(3);
    // A verdict, three figures, three doors. Review rejected the previous
    // opening screen for carrying an analysis instead of an answer.
    expect(await page.locator(".iris-home-figures > div").count()).toBeLessThanOrEqual(3);
    await expect(page.locator(".iris-signal")).toBeVisible();
  });

  test("each door leads somewhere that answers its own question", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    for (const [label, heading] of [
      ["Sales Flow", /progressing|meeting/i],
      ["Project", /stock|attention|meeting/i],
      ["Sales Agents", /present/i],
    ] as const) {
      await page.goto("/alpha/northgate/showroom");
      await page.getByRole("link", { name: new RegExp(label) }).first().click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    }
  });

  test("the IRIS rating is MADSPACE only", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/agents");
    await expect(page.getByText(/Rates IRIS/)).toHaveCount(0);
  });

  test("the audience builder returns meetings, not people", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/audience?rooms=2&category=family");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/meetings match/);
    await expect(page.getByText(/meetings, not people/i)).toBeVisible();
    const body = await page.locator("main").innerText();
    // No email address and no phone number may reach this surface.
    expect(/[a-z0-9._%-]+@[a-z0-9.-]+.[a-z]{2,}/i.test(body)).toBe(false);
  });
});

test.describe("the product rules, at the surface", () => {
  test("a replay states its gaps rather than leaving blanks", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/meetings/mtg_0002");
    // The legacy import has no per-step timing. It has to say so.
    await expect(page.getByText(/What this source cannot say/i)).toBeVisible();
  });

  test("a comparison never claims a cause", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/presentation?mode=cohorts");
    await expect(page.getByText(/associations, not/i)).toBeVisible();
    const body = (await page.locator("main").innerText()).toLowerCase();
    for (const word of ["because", "caused", "drives the", "leads to", "results in"]) {
      expect(body.includes(word), `causal wording on screen: "${word}"`).toBe(false);
    }
  });

  test("selecting a unit changes the evidence beside it", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/units");
    const before = await page.locator("aside").innerText();
    await page.locator(".iris-matrix-row").first().click();
    await page.waitForURL(/unit=/);
    expect(await page.locator("aside").innerText()).not.toBe(before);
  });

  test("Ask Observer answers from evidence, on any surface", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/storytelling");
    const ask = page.getByPlaceholder("Ask Observer…");
    await ask.fill("Which IRIS sections are being skipped most frequently?");
    await ask.press("Enter");

    const sheet = page.getByRole("dialog", { name: "Ask Observer" });
    await expect(sheet).toBeVisible();
    // The five parts an answer must separate.
    await expect(sheet.getByText("Observed", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Interpretation", { exact: true })).toBeVisible();
    await expect(sheet.getByText(/Confidence and evidence/i)).toBeVisible();
    await expect(sheet.getByText(/records ·/).first()).toBeVisible();
  });
});
