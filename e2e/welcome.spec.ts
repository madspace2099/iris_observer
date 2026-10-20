import { expect, test, type Page } from "@playwright/test";
import { PASSWORD } from "./sign-in";

/**
 * THE WELCOME BETWEEN SIGN-IN AND ASK IRIS.
 *
 * A password sign-in with no destination of its own lands on `/welcome`, which
 * states what the repository holds for the project it opens and hands the
 * reader on to that project's Ask IRIS. Played in full under no motion
 * preference, and finished at once under reduced motion — the posture the rest
 * of the suite signs in under.
 *
 * Clara Weiss holds one project, Shark Residence, so her landing is its Ask
 * IRIS. The figures are not pinned here: the unit suite holds them to the
 * repository (`apps/web/test/welcome.test.ts`); this holds the sequence to
 * the page.
 */

const CLARA = "clara.weiss@shark-developments.example";
const LANDING = /\/shark\/shark-residence\/ask$/;

async function signInAsClara(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Work email address").fill(CLARA);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with password" }).click();
}

test.describe("the welcome, played", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("states the account, the project and its presentations, then opens Ask IRIS", async ({
    page,
  }) => {
    await signInAsClara(page);
    await page.waitForURL((url) => url.pathname === "/welcome");

    const lines = page.locator(".welcome-lines");
    await expect(lines).toContainText("Signed in · Clara Weiss, Shark Developments");
    await expect(lines).toContainText("Shark Residence");
    await expect(lines).toContainText(/Reading [\d,]+ presentations? · quarter to date/);
    await expect(lines).toContainText("Briefing ready");
    await expect(page.getByRole("link", { name: /Skip/ })).toBeVisible();

    await page.waitForURL(LANDING, { timeout: 15_000 });
    await expect(page.locator(".ask-hero").first()).toBeVisible();
  });

  test("hands over at once when Skip is pressed", async ({ page }) => {
    await signInAsClara(page);
    await page.waitForURL((url) => url.pathname === "/welcome");
    /*
     * Before the sequence's own hand-over at 4.2s could explain an arrival:
     * Skip is pressed at once and the landing must follow within a second.
     */
    const skip = page.getByRole("link", { name: /Skip/ });
    await skip.waitFor();
    const pressed = Date.now();
    await skip.click();
    await page.waitForURL(LANDING, { timeout: 4_000 });
    expect(Date.now() - pressed).toBeLessThan(1_000);
  });
});

test.describe("the welcome, under reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("holds the finished frame, then lands on Ask IRIS well before the full sequence", async ({
    page,
  }) => {
    await signInAsClara(page);
    await page.waitForURL((url) => url.pathname === "/welcome");
    const arrived = Date.now();
    /* The lines stand complete from the first frame: readable, not a flash. */
    await expect(page.locator(".welcome-lines")).toContainText("Briefing ready");
    await page.waitForURL(LANDING, { timeout: 8_000 });
    const held = Date.now() - arrived;
    expect(held).toBeGreaterThan(1_000);
    expect(held).toBeLessThan(2_500);
    await expect(page.locator(".ask-hero").first()).toBeVisible();
  });

  test("refuses a destination outside the application", async ({ page }) => {
    await signInAsClara(page);
    await page.waitForURL(LANDING, { timeout: 8_000 });

    for (const to of [
      "https://example.invalid/steal",
      "//example.invalid/shark/shark-residence/ask",
      "/beta/kingsford/ask",
    ]) {
      await page.goto(`/welcome?to=${encodeURIComponent(to)}`);
      await page.waitForURL(LANDING, { timeout: 8_000 });
      expect(new URL(page.url()).hostname, to).toBe("localhost");
    }
  });
});
