import { expect, test } from "@playwright/test";

/**
 * THE FROZEN SIGN-IN SURFACE.
 *
 * M0 froze the Observer appearance, and this is the part of it a reviewer meets
 * first. The properties below are the ones the user is being asked to accept,
 * so they are asserted rather than described: if a later milestone changes any
 * of them, it fails here and has to say why.
 *
 * It runs under all three viewport projects, which is where the responsive
 * coverage comes from — no viewport is set by hand.
 *
 * What this does NOT do is pin the layout to a pixel. The baseline is the
 * behaviour and the guarantees, not a screenshot: a screenshot test on a
 * gradient and a variable font is a test that fails for the weather.
 */

test.describe("sign-in, as frozen", () => {
  test("offers the four demonstration profiles, each described", async ({ page }) => {
    await page.goto("/sign-in");

    const profiles = page.locator("button[value]");
    await expect(profiles).toHaveCount(4);

    for (const key of ["developer", "agencyManager", "salesAgent", "madspace"]) {
      await expect(page.locator(`button[value="${key}"]`)).toHaveCount(1);
    }

    /*
     * A profile a reader cannot tell apart from another is not a choice. The
     * card carries a name, a role and a sentence about what that person sees;
     * the organisation is in the data but deliberately not on the card.
     */
    const body = await page.evaluate(() => document.body.innerText);
    for (const fragment of [
      "Petra Novák",
      "Tomáš Varga",
      "Monika Kováčová",
      "MADSPACE Operations",
      "Developer",
      "Agency manager",
      "Sales agent",
      "Administrator",
      "Buys Observer",
      "Runs the meetings",
    ]) {
      expect(body, fragment).toContain(fragment);
    }
  });

  test("asks for no credential, and hides no production sign-in behind the picker", async ({
    page,
  }) => {
    /*
     * The surface promises a scenario selector, not authentication. If it ever
     * grows a password field, an e-mail field or a third-party button, that is
     * a product decision that must be made deliberately — not something that
     * appears in a refactor.
     */
    await page.goto("/sign-in");

    await expect(
      page.locator(
        "input[type='password'], input[type='email'], input[name*='pass' i], input[name*='user' i]",
      ),
    ).toHaveCount(0);

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
    expect(body).toMatch(/demonstration running on synthetic data/i);
    expect(body).toMatch(/Demo data/i);
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

  test("selecting Petra Novák from the keyboard opens the Northgate Briefing", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator("button[value='developer']").first().focus();
    await Promise.all([page.waitForURL(/showroom/), page.keyboard.press("Enter")]);

    expect(new URL(page.url()).pathname).toBe("/alpha/northgate/showroom");

    /*
     * The Briefing greets the viewer by name. The project name is on the
     * context switcher, which is a select — its option is not a visible node,
     * so the greeting is what proves the right person arrived at the right
     * place.
     */
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).toMatch(/PETRA/i);
    expect(body).toMatch(/showroom presentations/i);
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
