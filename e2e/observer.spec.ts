import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The two M2 slices, end to end.
 *
 * These assert what the screens promise rather than how they look: that a
 * verdict is present and carries its number, that every generated claim links
 * to its records, that a disconnected source says so instead of showing a
 * zero, and that a figure below its minimum sample shows no trend.
 */

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("button", { name: "Continue" })
    .click();
  await page.waitForURL(/\/overview/);
}

test.describe("executive overview", () => {
  test("opens on a verdict with a number in it", async ({ page }) => {
    await signInAs(page, "Petra Novák");

    const verdict = page.getByRole("heading", { level: 1 });
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText("7 units");
    await expect(page.getByText("Attention needed", { exact: true })).toBeVisible();
  });

  test("shows the four approved headline figures", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    for (const label of ["Units Sold", "Revenue", "Average Days to Close", "Active Buyers"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("links every generated sentence to its records", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    const briefing = page.getByRole("region", { name: /What changed this quarter/i });
    const statements = briefing.getByRole("listitem");
    const count = await statements.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(statements.nth(i).getByRole("link")).toHaveAttribute("data-evidence-id", /^evd_/);
    }
  });

  test("says a source is missing rather than showing a zero", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/riverside/overview");
    await expect(page.getByText("Not enough data", { exact: true })).toBeVisible();
    await expect(page.getByText(/The CRM is not connected/).first()).toBeVisible();
    await expect(page.getByText("0", { exact: true })).toHaveCount(0);
  });

  test("has no detectable accessibility violations", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("renders at a fixed viewport", async ({ page }, testInfo) => {
    await signInAs(page, "Petra Novák");
    await page.waitForLoadState("load");
    await testInfo.attach("executive-overview", {
      body: await page.screenshot({
        fullPage: true,
        path: `screenshots/executive-overview-${testInfo.project.name}.png`,
      }),
      contentType: "image/png",
    });
  });
});

test.describe("sales agent", () => {
  test("gets their own overview, not the executive one", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Two meetings this week");
    // No agency-wide figures on the agent's screen.
    await expect(page.getByText("Units Sold", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Revenue", { exact: true })).toHaveCount(0);
  });

  test("sees no section they cannot open", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    const nav = page.getByRole("navigation", { name: "Sections" });
    await expect(nav.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "People" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Sales Flow" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Project" })).toHaveCount(0);
  });

  test("reads the brief and learns the shortlisted unit has sold", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    await page.getByRole("link", { name: "Open the brief" }).click();
    await page.waitForURL(/\/meetings\//);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Viktória Halász");
    await expect(page.getByText("Changed since her last visit")).toBeVisible();
    await expect(page.getByText(/A-505/).first()).toBeVisible();
    // The three sections stay apart.
    await expect(page.getByText("What is recorded")).toBeVisible();
    await expect(page.getByText("What it suggests")).toBeVisible();
    await expect(page.getByText("What to do")).toBeVisible();
    // No price range is claimed, because she never set one.
    await expect(page.getByText(/Never stated/)).toBeVisible();
  });

  test("the brief has no accessibility violations", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    await page.goto("/alpha/northgate/meetings/mtg_viktoria0827");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("renders the brief at a fixed viewport", async ({ page }, testInfo) => {
    await signInAs(page, "Monika Kováčová");
    await page.goto("/alpha/northgate/meetings/mtg_viktoria0827");
    await page.waitForLoadState("load");
    await testInfo.attach("pre-meeting-brief", {
      body: await page.screenshot({
        fullPage: true,
        path: `screenshots/pre-meeting-brief-${testInfo.project.name}.png`,
      }),
      contentType: "image/png",
    });
  });
});

test.describe("isolation", () => {
  test("refuses a project the account does not hold", async ({ page }) => {
    await signInAs(page, "Tomáš Varga");
    await page.goto("/alpha/riverside/overview");
    await expect(page.getByText(/not available to your account/i)).toBeVisible();
  });

  test("sends an unauthenticated visitor to sign in", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/alpha/northgate/overview");
    await page.waitForURL(/\/sign-in/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
