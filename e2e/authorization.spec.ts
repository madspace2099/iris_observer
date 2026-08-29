import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * The role matrix, and the period, exercised through the browser.
 *
 * Both defects these cover were reachable by typing a URL: `SURFACES` declared
 * which roles may open which screen and nothing except the navigation builder
 * read it, and the period selector rendered a constant while the page beneath
 * it computed something else. Neither is catchable by an accessibility check or
 * by a test that only clicks the links it is offered.
 */


test.describe("a sales agent sees the team on their own project", () => {
  /*
   * The rule this block asserts was reversed by ADR-0029. It used to read "a
   * sales agent gets no league table" and enforced a ROLE; the boundary is now
   * the PROJECT, so the cases changed shape rather than being deleted — the
   * half that still matters is the half about the project she does not hold.
   */

  test("is offered the team comparison for a project she holds", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    const nav = page.getByRole("navigation", { name: "Sections" });
    await expect(nav.getByRole("link", { name: "Sales Agents" })).toBeVisible();
  });

  test("reads every agent on that project, not only herself", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    await page.goto("/alpha/northgate/agents");

    /* The surface rendered, rather than redirecting to the briefing. */
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.locator(".iris-rings")).toHaveCount(1);

    const named = await page.locator(".iris-ring-card h3").allInnerTexts();
    expect(named.length, "more than one agent, or it is not a team view").toBeGreaterThan(1);
    expect(named, "her own results are among them").toContain("Monika Kováčová");
    expect(
      named.some((n) => n !== "Monika Kováčová"),
      "and so are somebody else's",
    ).toBe(true);
  });

  test("still sees nothing of a project she does not hold", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
    await page.goto("/beta/kingsford/agents");

    /*
     * The part of the old rule that did not change, and the one that was
     * always doing the work. Peer visibility is bounded by the project.
     */
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toMatch(/not available to your account/i);
    expect(text).not.toMatch(/Kingsford Yard/);
    await expect(page.locator(".iris-rings")).toHaveCount(0);
  });

  test("still gets their own patterns", async ({ page }) => {
    await signInAs(page, "Monika Kováčová");
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
