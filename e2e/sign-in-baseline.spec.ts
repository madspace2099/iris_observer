import { expect, test } from "@playwright/test";

/**
 * THE FROZEN SIGN-IN SURFACE.
 *
 * M0 froze the Observer appearance, and this is the part of it a reviewer meets
 * first. The properties below are the ones the user is being asked to accept,
 * so they are asserted rather than described: if a later milestone changes any
 * of them, it fails here and has to say why.
 *
 * ## What this file used to freeze
 *
 * A profile picker: four cards, no credential, and choosing one minted a
 * session. That was never authentication, and it is no longer a product screen
 * — the way in is `ACCOUNT → PROJECTS → OBSERVER`. The cases below were rewritten
 * rather than deleted, because the checks that mattered were never about the
 * picker: nothing clipped, every keyboard stop visible, the demonstration
 * stated before anybody signs in, and no form posting anywhere but here.
 *
 * It runs under all three viewport projects, which is where the responsive
 * coverage comes from — no viewport is set by hand.
 *
 * What this does NOT do is pin the layout to a pixel. The baseline is the
 * behaviour and the guarantees, not a screenshot: a screenshot test on a
 * photograph and a variable font is a test that fails for the weather.
 */

test.describe("sign-in, as frozen", () => {
  test("is the Client Portal composition, with its own assets", async ({ page }) => {
    await page.goto("/sign-in");

    /* The photograph and the mark, served by this application. */
    const hero = await page.evaluate(() => {
      const panel = document.querySelector(".mp-hero");
      const scrim = document.querySelector(".mp-hero-scrim");
      return {
        image: panel === null ? "" : getComputedStyle(panel).backgroundImage,
        scrim: scrim === null ? "" : getComputedStyle(scrim).backgroundImage,
        logo: document.querySelector(".mp-hero-logo")?.getAttribute("src") ?? null,
        people: [...document.querySelectorAll(".mp-hero-person-name")].map((el) =>
          (el.textContent ?? "").trim(),
        ),
      };
    });

    expect(hero.image).toContain("madspace-founders-1100.jpg");
    expect(hero.logo).toBe("/portal/madspace-logo-white-900.png");

    /* Four stages, on its own element, so the image can be replaced alone. */
    expect(hero.scrim).toContain("linear-gradient");
    expect((hero.scrim.match(/rgba?\(/g) ?? []).length).toBeGreaterThanOrEqual(4);

    /* The caption area the reference carries. */
    expect(hero.people).toHaveLength(2);
    await expect(page.locator(".mp-hero-caption")).toHaveText(/meet our founders/i);
  });

  test("asks for a credential, and is not a list of people to pick from", async ({ page }) => {
    await page.goto("/sign-in");

    /*
     * The inverse of what this test used to assert, and deliberately so. A
     * front door has to ask who you are; the screen that asked which
     * perspective you would like to see is gone. If the picker ever returns to
     * this route, this fails.
     */
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.locator("input[type='email']")).toHaveCount(1);
    await expect(page.locator("input[type='password']")).toHaveCount(1);

    const body = await page.evaluate(() => document.body.innerText);
    for (const gone of ["Continue as", "Each profile sees a different Observer"]) {
      expect(body, gone).not.toContain(gone);
    }

    /* Submission is a server action; there is no third-party endpoint. */
    const actions = await page.evaluate(() =>
      [...document.querySelectorAll("form")].map((f) => f.getAttribute("action") ?? ""),
    );
    for (const action of actions) {
      expect(action).not.toMatch(/^https?:\/\//);
    }
  });

  test("says it is a demonstration before anyone signs in", async ({ page }) => {
    await page.goto("/sign-in");
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).toMatch(/demonstration accounts/i);
    expect(body).toMatch(/synthetic data/i);
    expect(body).toMatch(/not credentials for anything real/i);
  });

  test("is honest about what is not connected", async ({ page }) => {
    await page.goto("/sign-in");
    /*
     * The reference offers single sign-on and invitations. Observer keeps both
     * on the screen because the anatomy is the reference's, and says plainly
     * that neither works yet — an action that silently does nothing is worse
     * than one that explains itself.
     */
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).toMatch(/no identity provider is connected/i);
    await expect(
      page.getByRole("button", { name: "Continue with company single sign-on" }),
    ).toBeVisible();
  });

  test("can be driven from the keyboard, with the focus always visible", async ({ page }) => {
    await page.goto("/sign-in");

    const stops: { visible: boolean; tag: string }[] = [];
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement;
        if (el === null || el === document.body) return null;
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName,
          /* A ring, or a shadow standing in for one. Never nothing. */
          visible:
            (cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) > 0) ||
            cs.boxShadow !== "none",
        };
      });
      if (stop !== null) stops.push(stop);
    }

    expect(stops.length, "the page must be reachable by keyboard").toBeGreaterThan(3);
    expect(
      stops.filter((s) => !s.visible),
      "every keyboard stop must show where it is",
    ).toEqual([]);
  });

  test("signing in from the keyboard opens the projects, not a project", async ({ page }) => {
    await page.goto("/sign-in");

    /*
     * Enter in a text field submits through the form's FIRST submit button, and
     * the first visible one here is company single sign-on — so a reader who
     * typed a password and pressed Enter used to be told single sign-on is not
     * connected. A hidden default submit puts the keyboard back on the password
     * path, and this is what holds it there.
     *
     * Note the tab order, which is the reference's and is left alone: from the
     * email field the next stop is the single sign-on button, not the password.
     * That is the composition saying single sign-on is the primary path. The
     * fields are therefore addressed by their labels rather than by tabbing,
     * and what is under test is the Enter key, not the tab order.
     */
    await page.getByLabel("Work email address").fill("petra.novak@alpha-estates.example");
    await page.getByLabel("Password").fill("observer-demo");
    await page.getByLabel("Password").press("Enter");
    await page.waitForURL(/projects/);

    expect(new URL(page.url()).pathname).toBe("/projects");

    /* And the projects, not one of them chosen on her behalf. */
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).toContain("Northgate Residences");
    expect(body).toContain("Riverside Walk");
  });

  test("fits its viewport, with nothing clipped away", async ({ page }) => {
    await page.goto("/sign-in");

    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll, "the page must not scroll sideways").toBeLessThanOrEqual(
      overflow.client + 1,
    );

    /*
     * Clipped, not merely wrapped. An element whose overflow is visible is
     * taller than its box on purpose; one that hides its own content is not.
     */
    const clipped = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        if (el.children.length > 0) continue;
        /*
         * Text hidden from sight on purpose is not text cut off by accident.
         * A visually-hidden element is a 1px clipped box BY CONSTRUCTION —
         * that is the technique — so measuring one catches the pattern rather
         * than a defect. Both kinds are skipped: the ones that exist for a
         * screen reader, and the one hidden from everybody.
         */
        if (el.closest(".obs-sr") !== null) continue;
        if (el.closest("[aria-hidden='true']") !== null) continue;
        const text = (el.textContent ?? "").trim();
        if (text.length < 3) continue;
        const cs = getComputedStyle(el);
        if (cs.overflow === "visible") continue;
        if (cs.textOverflow === "ellipsis") continue;
        if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
          out.push(text.slice(0, 40));
        }
      }
      return out;
    });
    expect(clipped, "no text may be cut off").toEqual([]);
  });
});
