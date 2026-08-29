import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * The two M2 slices, end to end.
 *
 * These assert what the screens promise rather than how they look: that a
 * verdict is present and carries its number, that every generated claim links
 * to its records, that a disconnected source says so instead of showing a
 * zero, and that a figure below its minimum sample shows no trend.
 */


/**
 * Signs in and opens the executive overview.
 *
 * That surface is no longer the product's front door — the Showroom is — but it
 * is still a surface, and every promise asserted below still has to hold on it.
 */
async function openExecutiveOverview(page: Page, name: string, project = "alpha/northgate") {
  await signInAs(page, name);
  await page.goto(`/${project}/overview`);
  await page.evaluate(() => document.fonts.ready);
}

test.describe("executive overview", () => {
  test("opens on a verdict with a number in it", async ({ page }) => {
    await openExecutiveOverview(page, "Petra Novák");

    const verdict = page.getByRole("heading", { level: 1 });
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText("7 units");
    await expect(page.getByText("Attention needed", { exact: true })).toBeVisible();
  });

  test("shows the four approved headline figures", async ({ page }) => {
    await openExecutiveOverview(page, "Petra Novák");
    for (const label of ["Units Sold", "Revenue", "Average Days to Close", "Active Buyers"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("links every generated sentence to its records", async ({ page }) => {
    await openExecutiveOverview(page, "Petra Novák");
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
    await openExecutiveOverview(page, "Petra Novák");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("renders at a fixed viewport", async ({ page }, testInfo) => {
    await openExecutiveOverview(page, "Petra Novák");
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
    await openExecutiveOverview(page, "Monika Kováčová");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Two meetings this week");
    // No agency-wide figures on the agent's screen.
    await expect(page.getByText("Units Sold", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Revenue", { exact: true })).toHaveCount(0);
  });

  test("sees no section they cannot open", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    const nav = page.getByRole("navigation", { name: "Sections" });

    /*
     * The opening screen and its three doors.
     *
     * Presentation DNA, Unit Attention and Storytelling are still reachable but
     * are no longer top-level tabs: a tab is a claim that the reader should
     * choose between things, and those are drill-downs behind the three views.
     * All four are open to a sales agent — the doors are the product, not a
     * management report.
     */
    for (const section of ["Briefing", "Sales Flow", "Project"]) {
      await expect(nav.getByRole("link", { name: section })).toBeVisible();
    }

    /*
     * Sales Agents is among them now (ADR-0029).
     *
     * It names colleagues beside one another, and the people it names are the
     * team on the project the agent is looking at. What is still enforced on
     * the server is the project: another developer's Sales Agents surface is a
     * refusal, not a redirect to a thinner version of it.
     */
    await expect(nav.getByRole("link", { name: "Sales Agents" })).toBeVisible();

    // A nav item the role cannot open is not rendered at all: a disabled one
    // advertises something they will never be given. Administration is the
    // remaining one for this role, and peer visibility did not open it.
    await expect(nav.getByRole("link", { name: "Administration" })).toHaveCount(0);
    await expect(nav.getByRole("link")).toHaveCount(4);
  });

  test("reads the brief and learns the shortlisted unit has sold", async ({ page }) => {
    await openExecutiveOverview(page, "Monika Kováčová");
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
    /* The account sign-in: a credential form, not a list of people. */
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Work email address")).toBeVisible();
  });
});
