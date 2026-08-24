import { expect, test, type Page } from "@playwright/test";

/**
 * The checks that keep M2.1's corrections from regressing.
 *
 * Typography, the session boundary, and the ten-second shape of the first
 * screen. Each of these was wrong once; each is now a test.
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

test.describe("typography", () => {
  test("actually renders in Manrope, not the system fallback", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.evaluate(() => document.fonts.ready);

    // Approving visual fidelity while the page renders in Segoe UI would be
    // approving a different design from the one that ships.
    const loaded = await page.evaluate(() =>
      [...document.fonts].some((f) => f.family.includes("Manrope") && f.status === "loaded"),
    );
    expect(loaded, "no Manrope face reported as loaded").toBe(true);

    const applied = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily.split(",")[0]?.replace(/["']/g, "") ?? "",
    );
    expect(applied).toContain("Manrope");
  });

  test("serves the font from this origin, never a third party", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (/fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny/.test(url)) {
        external.push(url);
      }
    });
    await signInAs(page, "Petra Novák");
    await page.evaluate(() => document.fonts.ready);
    expect(external).toEqual([]);
  });

  test("does not let the font swap reflow the metric grid", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    const before = await page.locator(".obs-metric").first().boundingBox();
    await page.evaluate(() => document.fonts.ready);
    const after = await page.locator(".obs-metric").first().boundingBox();
    // Metric cards carry a min-height precisely so a font arriving mid-render
    // cannot move the figures under the reader's eye.
    expect(after?.height).toBe(before?.height);
  });
});

test.describe("session boundary", () => {
  test("a forged cookie grants nothing", async ({ page, context }) => {
    // The earlier implementation stored the role in the cookie. Setting it to
    // "madspace" was a privilege escalation; now it is just an unknown id.
    await context.addCookies([
      { name: "observer_session", value: "madspace", url: "http://localhost:3210" },
    ]);
    await page.goto("/alpha/northgate/overview");
    await page.waitForURL(/\/sign-in/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("signing out invalidates the session, not only the cookie", async ({ page, context }) => {
    await signInAs(page, "Petra Novák");
    const cookie = (await context.cookies()).find((c) => c.name === "observer_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/sign-in/);

    // Replaying the captured cookie must fail: the server record is gone.
    await context.addCookies([
      { name: "observer_session", value: cookie?.value ?? "", url: "http://localhost:3210" },
    ]);
    await page.goto("/alpha/northgate/overview");
    await page.waitForURL(/\/sign-in/);
  });

  test("calls itself a scenario selector, not authentication", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText(/not production authentication/i)).toBeVisible();
  });
});

test.describe("the ten-second test", () => {
  test("answers all four questions above the fold", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "the fold test is a desktop claim");
    await signInAs(page, "Petra Novák");
    await page.evaluate(() => document.fonts.ready);

    const fold = page.viewportSize()?.height ?? 0;
    const within = async (selector: string) => {
      const box = await page.locator(selector).first().boundingBox();
      return box !== null && box.y < fold;
    };

    // 1. Is it good, bad or inconclusive?  2. What changed?
    expect(await within(".obs-verdict"), "verdict below the fold").toBe(true);
    expect(await within(".obs-headline-change"), "headline change below the fold").toBe(true);
    // 3. Why does it matter — the four figures.  4. What to do — the actions.
    expect(await within(".obs-metric"), "figures below the fold").toBe(true);
    expect(await within(".obs-verdict .obs-action"), "actions below the fold").toBe(true);
  });

  test("keeps the first screen to at most six figures", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    // The registry holds eighty-two metrics. Rendering the registry would be
    // the exact failure Stano described in the legacy dashboard.
    await expect(page.locator(".obs-metric")).toHaveCount(4);
    await expect(page.locator(".obs-verdict .obs-action")).toHaveCount(2);
  });

  test("shows the rules behind the verdict rather than asserting it", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    const rules = page.locator(".obs-rules");
    await expect(rules).toBeVisible();
    await rules.getByRole("group").or(rules.locator("summary")).first().click();
    await expect(page.locator(".obs-rule-list li")).toHaveCount(4);
    await expect(page.getByText(/verdict-\d+\.\d+\.\d+/)).toBeVisible();
  });

  test("says insufficient data rather than showing a green light", async ({ page }) => {
    await signInAs(page, "Tomáš Varga");
    await page.goto("/beta/kingsford/overview");
    await expect(page.getByText("Not enough data", { exact: true })).toBeVisible();
  });
});
