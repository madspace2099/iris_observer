import { expect, test, type Page } from "@playwright/test";

/**
 * The role matrix, and the period, exercised through the browser.
 *
 * Both defects these cover were reachable by typing a URL: `SURFACES` declared
 * which roles may open which screen and nothing except the navigation builder
 * read it, and the period selector rendered a constant while the page beneath
 * it computed something else. Neither is catchable by an accessibility check or
 * by a test that only clicks the links it is offered.
 */

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(`Continue as ${name}`) }).click();
  await page.waitForURL(/\/(showroom|overview)/);
}

test.describe("a sales agent gets no league table", () => {
  test("is not offered the team comparison", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    const nav = page.getByRole("navigation", { name: "Sections" });
    await expect(nav.getByRole("link", { name: "Sales Agents" })).toHaveCount(0);
  });

  test("cannot reach it by typing the URL", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    await page.goto("/alpha/northgate/agents");

    /*
     * Sent back to their briefing, and the comparison never rendered.
     *
     * Hiding a nav item is a layout decision. The route was open to anyone who
     * typed it, and the page showed every colleague's outcome mix side by side.
     */
    await page.waitForURL(/\/showroom/);
    await expect(page.locator(".iris-rings")).toHaveCount(0);
    await expect(page.getByText("Lucia Bartošová")).toHaveCount(0);
  });

  test("is not offered a question it may not have answered", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    // Suggesting a comparison and then refusing it reads as a broken product
    // rather than as a policy.
    await expect(page.getByRole("button", { name: "Compare the sales agents" })).toHaveCount(0);
  });

  test("still gets their own patterns", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    // The promise is "no league table", not "no analysis".
    const nav = page.getByRole("navigation", { name: "Sections" });
    await expect(nav.getByRole("link", { name: "Briefing" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Detail surfaces" })).toBeVisible();
  });
});

test.describe("an agency manager can reach both developers", () => {
  test("is offered a developer switch", async ({ page }) => {
    await signInAs(page, "Tomáš Varga");
    // The grant existed and the navigation did not; the only route was a URL.
    await expect(page.getByRole("combobox", { name: "Developer" })).toBeVisible();
  });

  test("switching developer opens that developer's project", async ({ page }) => {
    await signInAs(page, "Tomáš Varga");
    await page.getByRole("combobox", { name: "Developer" }).selectOption("beta");
    await page.waitForURL(/\/beta\//);
    await expect(page.locator(".obs-lede")).toContainText(/presentation/i);
  });

  test("never sees the two developers aggregated", async ({ page }) => {
    await signInAs(page, "Tomáš Varga");
    await page.goto("/beta/kingsford/showroom");
    // Kingsford's own figures, not a portfolio total.
    await expect(page.getByText("Northgate Residences")).toHaveCount(0);
  });
});

test.describe("a developer cannot reach another developer's project", () => {
  test("refuses a project outside their grants", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/beta/kingsford/showroom");
    // Refused, and told so — never another developer's figures, and never a
    // generic "something went wrong" for a working access control.
    await expect(page.getByText(/not available to your account/i).first()).toBeVisible();
    await expect(page.getByText("Kingsford Yard")).toHaveCount(0);
  });
});

test.describe("the period selector tells the truth", () => {
  const PERIODS = ["last_28_days", "last_quarter", "year_to_date"] as const;

  for (const preset of PERIODS) {
    test(`matches the URL on direct entry: ${preset}`, async ({ page }) => {
      await signInAs(page, "Petra Novák");
      await page.goto(`/alpha/northgate/showroom?period=${preset}`);
      // The control rendered a constant while the page computed something else.
      await expect(page.getByRole("combobox", { name: "Period" })).toHaveValue(preset);
    });
  }

  test("changing it stays on the current surface", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/units");
    await page.getByRole("combobox", { name: "Period" }).selectOption("last_28_days");
    await page.waitForURL(/period=last_28_days/);
    // It used to return to the briefing, discarding the surface the reader chose.
    expect(page.url()).toContain("/units");
  });

  test("navigation carries it", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/showroom?period=last_28_days");
    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Project" }).click();
    await page.waitForURL(/\/project/);
    expect(page.url()).toContain("period=last_28_days");
    await expect(page.getByRole("combobox", { name: "Period" })).toHaveValue("last_28_days");
  });

  test("survives a reload and the back button", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/showroom?period=last_quarter");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Period" })).toHaveValue("last_quarter");

    await page.getByRole("combobox", { name: "Period" }).selectOption("year_to_date");
    await page.waitForURL(/year_to_date/);
    await page.goBack();
    await expect(page.getByRole("combobox", { name: "Period" })).toHaveValue("last_quarter");
  });

  test("falls back explicitly on a value it does not know", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/showroom?period=not_a_period");
    // The control must not claim a period the page is not showing.
    await expect(page.getByRole("combobox", { name: "Period" })).toHaveValue("quarter_to_date");
  });
});

test.describe("projects do not share figures", () => {
  test("two projects under one developer read differently", async ({ page }) => {
    await signInAs(page, "Petra Novák");

    await page.goto("/alpha/northgate/showroom?period=last_28_days");
    const northgate = await page.locator(".obs-lede").innerText();

    await page.goto("/alpha/riverside/showroom?period=last_28_days");
    const riverside = await page.locator(".obs-lede").innerText();

    expect(northgate).not.toBe(riverside);
  });

  test("a project with no CRM says so instead of showing nil", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/riverside/showroom");
    // "0% progressing" reads as "nobody progressed" when the truth is that
    // nothing recorded whether they did.
    await expect(page.getByText(/no progression rate can be computed/i)).toBeVisible();
  });
});
