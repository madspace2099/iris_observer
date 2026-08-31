import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * ACCOUNT → PROJECTS → OBSERVER, THROUGH THE VISIBLE USER INTERFACE.
 *
 * Every case here signs in the way a person does: typing into the form on
 * `/sign-in` and pressing the button. None of them installs a cookie by hand.
 * That is deliberate — a suite that fabricates its own session proves the
 * guards downstream of authentication and nothing about authentication.
 *
 * The four accounts hold different, explicit, per-project grants, which is what
 * makes the authorisation cases meaningful:
 *
 *   Petra    Alpha Estates      Northgate + Riverside      (two, one developer)
 *   Tomáš    Meridian Sales     Northgate + Kingsford      (two, two developers)
 *   Monika   Meridian Sales     Northgate                  (one)
 *   MADSPACE MADSPACE           all three
 *
 * Tomáš is the interesting one: he holds one project belonging to Alpha and one
 * belonging to Beta, and does NOT hold Alpha's other project. A grant is per
 * project, never per developer, and adding a project to a developer grants
 * nobody anything.
 */

const PASSWORD = "observer-demo";

const ACCOUNTS = {
  petra: "petra.novak@alpha-estates.example",
  tomas: "tomas.varga@meridian-sales.example",
  monika: "monika.kovacova@meridian-sales.example",
  madspace: "operations@madspace.example",
} as const;

async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Work email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in with password" }).click();

  /*
   * Wait for an OUTCOME, not for the network to go quiet.
   *
   * A server action that redirects navigates on the client, and `networkidle`
   * can settle mid-transition: the Projects markup was in the document while
   * `page.url()` still read `/sign-in`, so three cases failed on a URL that
   * was about to be correct. Both terminal states have a marker of their own,
   * and waiting for one of them is a fact rather than a guess about timing.
   */
  await Promise.race([
    page.getByRole("heading", { level: 1, name: "Projects" }).waitFor({ state: "visible" }),
    page.locator(".mp-alert").waitFor({ state: "visible" }),
  ]);
  await page.waitForLoadState("networkidle");
}

/** The project names on the cards, in the order they are shown. */
async function projectCards(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".mp-project")].map((el) => (el.textContent ?? "").trim()),
  );
}

test.describe("the guards, before anything is signed in", () => {
  test("sends an anonymous reader to sign in, from everywhere", async ({ page }) => {
    for (const route of [
      "/",
      "/projects",
      "/alpha/northgate/showroom",
      "/alpha/northgate/units",
      "/madspace",
    ]) {
      await page.goto(route);
      expect(new URL(page.url()).pathname, route).toBe("/sign-in");
    }
  });

  test("shows the sign-in form itself, not a redirect loop", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Work email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });
});

test.describe("signing in", () => {
  test("takes a correct credential to the projects, never straight into one", async ({ page }) => {
    await signIn(page, ACCOUNTS.monika);
    expect(new URL(page.url()).pathname).toBe("/projects");

    /*
     * Monika holds exactly one project and still lands here. Opening it is a
     * decision she makes; a single-project account being thrown into its only
     * project never learns that the choice existed.
     */
    expect(await projectCards(page)).toEqual(["Northgate Residences"]);
  });

  test("refuses a wrong password without saying which half was wrong", async ({ page }) => {
    await signIn(page, ACCOUNTS.petra, "not-the-password");
    expect(new URL(page.url()).pathname).toBe("/sign-in");
    /* Scoped to the page own alert: Next route announcer is also role=alert. */
    const alert = page.locator(".mp-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("do not match an account");
  });

  test("answers an unknown address exactly as it answers a wrong password", async ({ page }) => {
    /*
     * A form that distinguishes them is a form that will tell anybody who asks
     * which addresses exist.
     */
    await signIn(page, "nobody@example.invalid");
    const unknown = await page.locator(".mp-alert").textContent();

    await signIn(page, ACCOUNTS.petra, "wrong");
    const wrong = await page.locator(".mp-alert").textContent();

    expect(unknown).toBe(wrong);
  });

  test("says plainly that single sign-on and invitations are not connected", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: /single sign-on/i }).click();
    await expect(page.locator(".mp-alert")).toContainText("not connected");

    await page.goto("/sign-in");
    await page.getByRole("button", { name: /invitation/i }).click();
    await expect(page.locator(".mp-alert")).toContainText("not connected");

    /* And neither claims to have signed anybody in. */
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("can be completed from the keyboard alone", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Work email address").focus();
    await page.keyboard.type(ACCOUNTS.petra);
    await page.getByLabel("Password").focus();
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press("Enter");

    /*
     * WAIT FOR THE NAVIGATION, NOT FOR THE NETWORK TO GO QUIET.
     *
     * Signing in is a server action that redirects: the POST completes, and
     * then the client router navigates. `networkidle` is a quiescence
     * heuristic — half a second with at most two connections open — and that
     * window can fall in the gap BETWEEN those two events. Measured on this
     * machine under load, it resolved before the navigation in one round out
     * of twelve, with the navigation arriving 368ms later; the test then read
     * `/sign-in` and failed, having asked the wrong question.
     *
     * `waitForURL` waits for the thing the action actually causes. The
     * assertion below is unchanged and still exact — this only stops it being
     * evaluated early.
     */
    await page.waitForURL(/\/projects/);
    expect(new URL(page.url()).pathname).toBe("/projects");
  });
});

test.describe("the projects a reader is shown are the projects they hold", () => {
  test("a developer sees their own company's projects", async ({ page }) => {
    await signIn(page, ACCOUNTS.petra);
    expect(await projectCards(page)).toEqual(["Northgate Residences", "Riverside Walk"]);
  });

  test("an agency manager sees one project from each developer they sell for", async ({ page }) => {
    await signIn(page, ACCOUNTS.tomas);
    const cards = await projectCards(page);
    expect(cards).toContain("Northgate Residences");
    expect(cards).toContain("Kingsford Yard");
    /* Alpha's other project is Alpha's. Holding one of a developer's projects
       does not grant the rest. */
    expect(cards).not.toContain("Riverside Walk");
  });

  test("a sales agent assigned to one project sees one card", async ({ page }) => {
    await signIn(page, ACCOUNTS.monika);
    expect(await projectCards(page)).toEqual(["Northgate Residences"]);
  });

  test("each card carries a cover, a developer, a project and one action", async ({ page }) => {
    await signIn(page, ACCOUNTS.monika);
    const card = page.locator(".mp-card").first();
    await expect(card.locator(".mp-cover")).toHaveCount(1);
    await expect(card.locator(".mp-developer")).toHaveText("Alpha Estates");
    await expect(card.locator(".mp-project")).toHaveText("Northgate Residences");
    await expect(card.getByRole("link", { name: /Open Observer/ })).toBeVisible();

    /* And nothing the selector is not for. */
    const text = await card.innerText();
    for (const banned of ["%", "milestone", "Milestone", "Next action", "Add cover image"]) {
      expect(text, banned).not.toContain(banned);
    }
  });

  test("opening a project reaches that project's Briefing", async ({ page }) => {
    await signIn(page, ACCOUNTS.monika);
    await Promise.all([
      page.waitForURL(/showroom/),
      page.getByRole("link", { name: /Open Observer/ }).first().click(),
    ]);
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/alpha/northgate/showroom");
    await expect(page.getByText(/showroom presentations/i).first()).toBeVisible();
  });
});

test.describe("a project nobody granted is refused by the server", () => {
  test("typing another developer's project shows a refusal, not the project", async ({ page }) => {
    await signIn(page, ACCOUNTS.monika);

    for (const route of [
      "/alpha/riverside/showroom",
      "/beta/kingsford/showroom",
      "/alpha/riverside/units",
      "/beta/kingsford/meetings",
    ]) {
      await page.goto(route);
      const text = await page.evaluate(() => document.body.innerText);
      expect(text, route).toMatch(/not available to your account/i);
      /* No figure, no name, nothing from the project that was asked for. */
      expect(text, route).not.toMatch(/Riverside Walk|Kingsford Yard/);
    }
  });

  test("Ask Observer refuses a project the account does not hold", async ({ page }) => {
    await signIn(page, ACCOUNTS.monika);

    const held = await page.request.post("/api/ask", {
      data: {
        tenantSlug: "alpha",
        projectSlug: "northgate",
        question: "What changed this month?",
        period: "quarter_to_date",
      },
    });
    expect(held.status(), "the project she holds").toBe(200);

    for (const [tenantSlug, projectSlug] of [
      ["alpha", "riverside"],
      ["beta", "kingsford"],
    ]) {
      const refused = await page.request.post("/api/ask", {
        data: {
          tenantSlug,
          projectSlug,
          question: "What changed this month?",
          period: "quarter_to_date",
        },
      });
      expect(refused.status(), `${tenantSlug}/${projectSlug}`).not.toBe(200);
      expect(await refused.text()).not.toMatch(/Riverside Walk|Kingsford Yard/);
    }
  });
});

test.describe("leaving", () => {
  test("signing out ends the session and locks every route again", async ({ page }) => {
    await signIn(page, ACCOUNTS.petra);
    await Promise.all([
      page.waitForURL(/sign-in/),
      page.getByRole("button", { name: "Sign out" }).click(),
    ]);
    expect(new URL(page.url()).pathname).toBe("/sign-in");

    for (const route of ["/projects", "/alpha/northgate/showroom"]) {
      await page.goto(route);
      expect(new URL(page.url()).pathname, route).toBe("/sign-in");
    }
  });

  test("going back after signing out does not show the previous account", async ({ page }) => {
    await signIn(page, ACCOUNTS.petra);
    await Promise.all([
      page.waitForURL(/showroom/),
      page.getByRole("link", { name: /Open Observer/ }).first().click(),
    ]);
    await page.waitForLoadState("networkidle");

    await page.goto("/projects");
    await Promise.all([
      page.waitForURL(/sign-in/),
      page.getByRole("button", { name: "Sign out" }).click(),
    ]);

    await page.goBack();

    /*
     * Back lands on the projects entry in history, and the server sends it
     * straight to the sign-in because there is no session any more. Waiting
     * for that redirect rather than for the network to go quiet: `networkidle`
     * can settle mid-transition, and the URL was read as `/projects` while the
     * redirect was still resolving.
     */
    await page.waitForURL(/\/sign-in/);
    await page.waitForLoadState("networkidle");

    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toContain("Riverside Walk");
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("the workspace offers a way back to the projects", async ({ page }) => {
    await signIn(page, ACCOUNTS.petra);
    await Promise.all([
      page.waitForURL(/showroom/),
      page.getByRole("link", { name: /Open Observer/ }).first().click(),
    ]);
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "Projects", exact: true }).click();
    /* The router navigation, not the network's quiet. See the keyboard case. */
    await page.waitForURL(/\/projects/);
    expect(new URL(page.url()).pathname).toBe("/projects");
    /* Still signed in: leaving a workspace is not signing out. */
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  });
});

test.describe("returnTo goes back inside, or nowhere", () => {
  test("carries a reader to the internal route they asked for", async ({ page }) => {
    await page.goto("/sign-in?returnTo=%2Falpha%2Fnorthgate%2Funits");
    await page.getByLabel("Work email address").fill(ACCOUNTS.petra);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in with password" }).click();
    /* The redirect the action performs. See the keyboard case. */
    await page.waitForURL(/\/alpha\/northgate\/units/);
    expect(new URL(page.url()).pathname).toBe("/alpha/northgate/units");
  });

  /*
   * Every shape of the open redirect, refused. Written as one test over a list
   * rather than six, because Playwright has no test.each and a loop that names
   * the case in each assertion reports just as precisely when it fails.
   */
  test("refuses an external or unknown destination and uses the projects", async ({ page }) => {
    const refused: readonly [string, string][] = [
      ["an absolute URL", "https://example.invalid/steal"],
      ["a protocol-relative URL", "//example.invalid"],
      ["a backslash host", "/\\example.invalid"],
      ["an encoded protocol-relative URL", "%2F%2Fexample.invalid"],
      ["a route that does not exist", "/not-a-route"],
      ["the sign-in page itself", "/sign-in"],
    ];

    for (const [name, value] of refused) {
      await page.context().clearCookies();
      await page.goto(`/sign-in?returnTo=${encodeURIComponent(value)}`);
      await page.getByLabel("Work email address").fill(ACCOUNTS.petra);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in with password" }).click();

      /*
       * WAIT FOR THE FORM TO BE LEFT, AND ASSERT WHERE IT WENT.
       *
       * Deliberately NOT `waitForURL(/projects/)`. If the open redirect ever
       * regressed, waiting for the destination this test expects would sit
       * there until it timed out and report "waiting for URL" — hiding the one
       * fact worth knowing. Waiting for the navigation to happen AT ALL lets
       * the assertions below fire on whatever it actually was, so a regression
       * to example.invalid fails with the attacker's hostname in the message.
       *
       * The assertions are untouched: hostname and pathname, both exact.
       */
      await page.waitForURL((u) => new URL(u).pathname !== "/sign-in");

      const url = new URL(page.url());
      expect(url.hostname, name).toBe("localhost");
      expect(url.pathname, name).toBe("/projects");
    }
  });
});
