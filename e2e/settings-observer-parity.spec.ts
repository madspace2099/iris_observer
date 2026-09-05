import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./sign-in";

/**
 * ACCOUNT SETTINGS, WEARING THE PRODUCT'S CHROME.
 *
 * `/settings/ai` was a light MADSPACE portal page behind a link in a dark
 * product: different ground, different header, different type scale, different
 * buttons. It read as a second product, and the brief asked for it to stop.
 *
 * Two things are checked here and they are different questions.
 *
 * **Does it look like Observer?** Not by screenshot — by measuring the header
 * on `/settings/ai` and on `/alpha/northgate/flow` and requiring the same
 * computed values. A capture would prove the two look similar on the day it was
 * taken; comparing the live pages proves they are built from the same rules and
 * fails the day one of them drifts.
 *
 * **Does it lead back?** The page is not a project route and takes no tenant,
 * so once a reader is there the server has no idea where they came from. The
 * answer is one validated `from` parameter, and the tests below follow it in
 * from three entrances, through a form submit, and past two hostile values.
 */

const FLOW = "/alpha/northgate/flow";
const PROJECT = "/alpha/northgate/project";
const AGENTS = "/alpha/northgate/agents";
const SETTINGS = "/settings/ai";

async function asPetra(page: Page): Promise<void> {
  await signInAs(page, "Petra Novák");
}

/**
 * Below 1199px, Settings moves behind the mobile menu trigger instead of
 * sitting directly in the header — see `Shell.tsx`'s "THE MOBILE MENU"
 * docblock. Opening it first is a no-op wherever the wide header renders.
 */
async function openMobileMenuIfPresent(page: Page): Promise<void> {
  const trigger = page.locator(".irs-mobile-menu-trigger");
  if ((await trigger.count()) > 0 && (await trigger.isVisible())) {
    await trigger.click();
  }
}

/** Opens settings the way a reader does: by pressing the link on a surface. */
async function openSettingsFrom(page: Page, surface: string): Promise<void> {
  await page.goto(surface);
  await openMobileMenuIfPresent(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL(/\/settings\/ai/);
}

async function overflowOf(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("account settings looks like the product it belongs to", () => {
  test("wears the same header as a project surface", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await asPetra(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    /** The values that make a header THIS header rather than a generic one. */
    const chromeOf = async (url: string) => {
      await page.goto(url);
      await expect(page.locator(".irs-header")).toBeVisible();
      return page.evaluate(() => {
        const header = document.querySelector(".irs-header") as Element;
        const shell = document.querySelector(".irs-shell") as Element;
        const hs = getComputedStyle(header);
        const ss = getComputedStyle(shell);
        return {
          height: hs.height,
          background: hs.backgroundColor,
          borderBottom: hs.borderBottomWidth + " " + hs.borderBottomColor,
          position: hs.position,
          ground: ss.backgroundColor,
          ink: ss.color,
          font: ss.fontFamily,
          brandHeight: getComputedStyle(
            document.querySelector(".irs-brand-mark") as Element,
          ).height,
        };
      });
    };

    const product = await chromeOf(FLOW);
    const settings = await chromeOf(SETTINGS);

    expect(settings, "settings must be built from the same header rules as Sales Flow").toEqual(
      product,
    );

    /* And the ground is the dark one, not paper. */
    expect(product.ground, "the shell ground must be dark").not.toBe("rgb(255, 255, 255)");
    expect(settings.font.toLowerCase()).toContain("manrope");
  });

  test("uses the product's own accent and nothing else", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await asPetra(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SETTINGS);

    /*
     * ADR-0020 locks the accent to #00A3FF. The primary control on this page
     * is the one place it appears, and it must be that value — a settings page
     * quietly drifting to a different blue is exactly how two products end up
     * looking related rather than identical.
     */
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--iris-accent").trim(),
    );
    expect(accent.toLowerCase()).toBe("#00a3ff");

    const save = page.getByRole("button", { name: "Save budget" });
    await expect(save).toBeVisible();
    await expect(save).toHaveCSS("background-color", "rgb(0, 163, 255)");
  });

  test("carries no portal class, so the portal pages are untouched", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await asPetra(page);
    await page.goto(SETTINGS);

    /*
     * THE POINT OF THE WHOLE APPROACH, ASSERTED.
     *
     * `.mp-*` is shared with `/sign-in`. The settings page was moved OFF those
     * names rather than having them restyled, precisely so that screen could
     * not change. If a `.mp-` class reappears here, somebody has started
     * restyling the shared system again.
     */
    const portalClasses = await page.evaluate(() =>
      [...document.querySelectorAll("[class]")]
        .flatMap((el) => [...el.classList])
        .filter((name) => name === "mp" || name.startsWith("mp-")),
    );
    expect([...new Set(portalClasses)], "settings must not use the portal namespace").toEqual([]);

    /*
     * `/projects` was moved onto this same chrome — see
     * `e2e/projects-observer-parity.spec.ts` — so `/sign-in` is the only
     * surface `portal.css` still governs, and it cannot be checked from this
     * authenticated session: an authenticated reader who opens `/sign-in`
     * is redirected away from it, same as `/`. `portal-quality.spec.ts`'s own
     * "sign in" suite (unauthenticated by construction) proves `.mp-login`
     * still renders there.
     */
  });

  test("has no axe violations", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await asPetra(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SETTINGS);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("does not overflow at any width", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await asPetra(page);

    for (const width of [1920, 1440, 1024, 768, 390] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`${SETTINGS}?from=%2Falpha%2Fnorthgate%2Fflow`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await overflowOf(page);
      expect(overflow, `settings overflows by ${String(overflow)}px at ${String(width)}`).toBeLessThanOrEqual(1);
    }
  });
});

/*
 * DOES NOT NAVIGATE AWAY ON ITS OWN.
 *
 * A prior audit pass reported the page auto-navigating away 1-3 seconds after
 * every load. Investigated directly: it does not reproduce from a clean
 * session (two independent tabs, both held stable well past the reported
 * window with no console error and no unexplained network activity), and the
 * audit's own account of it — landing on a different destination each time
 * (once on Project, otherwise on Ask IRIS) — is the signature of another
 * concurrently-running browser automation renavigating the SAME shared tab,
 * not of this page redirecting itself. These tests exist to catch a real
 * regression of that shape in the future, from a clean, single session.
 */
test.describe("does not redirect away on its own", () => {
  test("stays put after a direct visit", async ({ page }) => {
    await asPetra(page);
    await page.goto(SETTINGS);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI and usage");
    await page.waitForTimeout(4000);
    expect(new URL(page.url()).pathname).toBe("/settings/ai");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI and usage");
  });

  for (const [label, surface] of [
    ["Sales Flow", FLOW],
    ["Project", PROJECT],
    ["Sales Agents", AGENTS],
  ] as const) {
    test(`stays put after opening from ${label}`, async ({ page }) => {
      await asPetra(page);
      await openSettingsFrom(page, surface);
      await page.waitForTimeout(4000);
      expect(new URL(page.url()).pathname).toBe("/settings/ai");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI and usage");
    });
  }
});

test.describe("account settings leads back where the reader came from", () => {
  test("returns to Sales Flow when opened from Sales Flow", async ({ page }) => {
    await asPetra(page);
    await openSettingsFrom(page, FLOW);

    /*
     * The control NAMES its destination. "← Back" would be true and useless;
     * the page was told where the reader came from and checked it, so saying
     * it costs nothing and is the difference between a control a reader trusts
     * and one they have to try.
     */
    const back = page.getByRole("link", { name: "Sales Flow" }).first();
    await expect(back).toBeVisible();
    await back.click();
    await page.waitForURL(/\/alpha\/northgate\/flow/);
  });

  test("returns to Project when opened from Project", async ({ page }) => {
    await asPetra(page);
    await openSettingsFrom(page, PROJECT);

    const back = page.getByRole("link", { name: "Back to Project", exact: true }).first();
    await expect(back).toBeVisible();
    await back.click();
    await page.waitForURL(/\/alpha\/northgate\/project/);
  });

  test("falls back to Projects on direct navigation", async ({ page }) => {
    await asPetra(page);
    await page.goto(SETTINGS);

    /*
     * Nothing was supplied, so nothing is guessed. "Projects" is the account
     * index and it is TRUE — a reader who typed the URL is not owed a
     * fabricated claim about which project they were last looking at.
     */
    const back = page.getByRole("link", { name: "Back to Projects" });
    await expect(back).toBeVisible();
    await back.click();
    await page.waitForURL(/\/projects/);
  });

  test("refuses a destination off this origin, and one the account cannot open", async ({
    page,
  }) => {
    await asPetra(page);

    /*
     * TWO DIFFERENT REFUSALS, AND BOTH MATTER.
     *
     * The first is the open redirect: a value the browser controls, handed to a
     * link. `safeReturnTo`'s allow-list refuses anything with a scheme.
     *
     * The second is subtler and the allow-list cannot catch it — `/rival/tower/
     * flow` is a perfectly well-SHAPED path. Only the repository knows whether
     * this account may open it, so the page asks, and a refusal falls back to
     * Projects rather than drawing a link into a wall.
     */
    for (const hostile of [
      "https://evil.example/steal",
      "//evil.example",
      "/rival/tower/flow",
      "/sign-in",
    ]) {
      await page.goto(`${SETTINGS}?from=${encodeURIComponent(hostile)}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI and usage");

      const hrefs = await page.evaluate(() =>
        [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? ""),
      );
      expect(hrefs.some((h) => h.includes("evil.example")), `${hostile} reached a link`).toBe(false);
      expect(hrefs.some((h) => h.startsWith("/rival/")), `${hostile} reached a link`).toBe(false);

      /* And the reader still has a way out. */
      await expect(page.getByRole("link", { name: "Back to Projects" })).toBeVisible();
    }
  });

  test("keeps the way back across a save", async ({ page }) => {
    await asPetra(page);
    await openSettingsFrom(page, FLOW);

    /*
     * THE PART MOST LIKELY TO HAVE BEEN HALF-DONE.
     *
     * Every action redirects to `/settings/ai?done=…`, and that redirect used
     * to drop `from` — so the context survived exactly until the reader used
     * the page. Saving the budget back at its current value proves the round
     * trip without changing anything.
     */
    const field = page.locator("#budget-input");
    const current = await field.inputValue();
    await field.fill(current);
    await page.getByRole("button", { name: "Save budget" }).click();

    await page.waitForURL(/done=budget|failed=/);
    expect(new URL(page.url()).searchParams.get("from")).toBe("/alpha/northgate/flow");
    await expect(page.getByRole("link", { name: "Sales Flow" }).first()).toBeVisible();
  });
});

test.describe("the wordmark leads into the reader's own project", () => {
  test("goes to Ask IRIS for the project it was opened from", async ({ page }) => {
    await asPetra(page);
    await openSettingsFrom(page, FLOW);

    const brand = page.locator("a.irs-brand");
    await expect(brand).toHaveCount(1);
    await expect(brand).toHaveAttribute("href", "/alpha/northgate/ask");

    await brand.click();
    await page.waitForURL(/\/alpha\/northgate\/ask$/);
    await expect(page.locator(".ask-page")).toBeVisible();
  });

  test("is not hard-coded: it follows the project in context", async ({ page }) => {
    await asPetra(page);

    /*
     * The brief said not to hard-code Northgate, so this opens settings from a
     * DIFFERENT project and requires the wordmark to follow. Northgate passing
     * alone would prove nothing — it is the fallback as well as the first
     * project, so a hard-coded link would pass that test.
     */
    await openSettingsFrom(page, "/alpha/ister-tower/flow");
    await expect(page.locator("a.irs-brand")).toHaveAttribute("href", "/alpha/ister-tower/ask");
  });

  test("announces where it goes, not merely what it is", async ({ page }) => {
    await asPetra(page);
    await openSettingsFrom(page, FLOW);

    /*
     * A link whose only content is a logo announces as "IRIS" — what it IS,
     * not where it GOES. Anybody navigating by link list would have to guess.
     */
    const name = await page.locator("a.irs-brand").getAttribute("aria-label");
    expect(name).toContain("Ask IRIS");
    expect(name).toContain("Northgate");
  });
});

test.describe("it stays usable on a phone", () => {
  test.skip(() => test.info().project.name !== "mobile", "this is the mobile behaviour");

  test("keeps every control reachable and nothing off the side", async ({ page }) => {
    await asPetra(page);
    await page.goto(`${SETTINGS}?from=%2Falpha%2Fnorthgate%2Fflow`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI and usage");

    const overflow = await overflowOf(page);
    expect(overflow, `settings overflows by ${String(overflow)}px on a phone`).toBeLessThanOrEqual(
      1,
    );

    /*
     * Nothing that NAVIGATES may be hidden at this width. The label in the
     * middle of the header is the one thing that yields, because it repeats
     * what the page's own heading already says.
     */
    await expect(page.locator("a.irs-brand")).toBeVisible();
    /* The header's own link, `exact` so it cannot be satisfied by the Back control. */
    await expect(page.getByRole("link", { name: "Projects", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    /* This page was opened from Sales Flow, so that is what Back says. */
    await expect(page.getByRole("link", { name: "Back to Sales Flow" })).toBeVisible();

    /* The key field is still operable, which is what the page is for. */
    const key = page.locator("input#key-openai");
    if ((await key.count()) > 0) {
      await key.scrollIntoViewIfNeeded();
      await expect(key).toBeEnabled();
    }
  });

  test("still leads back", async ({ page }) => {
    await asPetra(page);
    await openSettingsFrom(page, FLOW);
    await page.getByRole("link", { name: "Sales Flow" }).first().click();
    await page.waitForURL(/\/alpha\/northgate\/flow/);
  });
});
