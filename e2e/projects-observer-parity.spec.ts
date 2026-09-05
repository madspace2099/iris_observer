import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./sign-in";

/**
 * THE PROJECT CHOOSER, WEARING THE PRODUCT'S CHROME.
 *
 * `/projects` was a light MADSPACE portal page (`.mp-*`, `portal.css`) sitting
 * behind a dark product: different ground, different header, different type
 * scale, different buttons. A reader who switched projects from a project's
 * own header met a different application for one screen.
 *
 * Checked the same way `/settings/ai`'s own parity suite checks its page: not
 * by screenshot, but by requiring the SAME computed header values as a project
 * surface. A capture proves the two looked similar on the day it was taken; a
 * live comparison proves they are built from the same rules and fails the day
 * one of them drifts.
 */

const FLOW = "/alpha/northgate/flow";
const PROJECTS = "/projects";

async function asPetra(page: Page): Promise<void> {
  await signInAs(page, "Petra Novák");
}

async function overflowOf(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("the project chooser looks like the product it belongs to", () => {
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
    const chooser = await chromeOf(PROJECTS);

    expect(chooser, "the chooser must be built from the same header rules as Sales Flow").toEqual(
      product,
    );
    expect(product.ground, "the shell ground must be dark").not.toBe("rgb(255, 255, 255)");
    expect(chooser.font.toLowerCase()).toContain("manrope");
  });

  test("uses the product's own accent and nothing else", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await asPetra(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROJECTS);

    /*
     * ADR-0020 locks the accent to #00A3FF. The primary action on this page
     * — opening a project — is the one place it appears, and it must be that
     * value, not a portal blue that happens to look close.
     */
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--iris-accent").trim(),
    );
    expect(accent.toLowerCase()).toBe("#00a3ff");

    const open = page.getByRole("link", { name: /^Open / }).first();
    await expect(open).toBeVisible();
    await expect(open).toHaveCSS("background-color", "rgb(0, 163, 255)");
  });

  test("carries no portal class", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await asPetra(page);
    await page.goto(PROJECTS);

    /*
     * The point of the whole approach, asserted directly: if a `.mp-` class
     * reappears here, somebody has started restyling this page from the
     * portal system again rather than from Observer's own.
     */
    const portalClasses = await page.evaluate(() =>
      [...document.querySelectorAll("[class]")]
        .flatMap((el) => [...el.classList])
        .filter((name) => name === "mp" || name.startsWith("mp-")),
    );
    expect([...new Set(portalClasses)], "the chooser must not use the portal namespace").toEqual(
      [],
    );
  });

  test("has no axe violations", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await asPetra(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROJECTS);
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
      await page.goto(PROJECTS);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await overflowOf(page);
      expect(overflow, `the chooser overflows by ${String(overflow)}px at ${String(width)}`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("the project chooser opens the project it names", () => {
  test("Open leads to that project's Ask IRIS, not a fixed project", async ({ page }) => {
    await asPetra(page);
    await page.goto(PROJECTS);

    const row = page.locator(".ox-thread-row", { hasText: "ISTER TOWER" });
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: /^Open / }).click();
    await page.waitForURL(/\/alpha\/ister-tower\/ask$/);
  });

  test("every row names its project in the Open action's accessible name", async ({ page }) => {
    await asPetra(page);
    await page.goto(PROJECTS);

    const names = await page.evaluate(() =>
      [...document.querySelectorAll(".ox-thread-row")].map((row) => {
        const title = row.querySelector(".ox-thread-title")?.textContent?.trim() ?? "";
        const open = row.querySelector("a.ox-btn");
        return { title, accessible: open?.textContent?.trim() ?? "" };
      }),
    );
    expect(names.length).toBeGreaterThan(0);
    for (const { title, accessible } of names) {
      expect(accessible, `Open action for "${title}" must name the project it opens`).toContain(
        title,
      );
    }
  });
});

test.describe("it stays usable on a phone", () => {
  test.skip(() => test.info().project.name !== "mobile", "this is the mobile behaviour");

  test("keeps every control reachable and nothing off the side", async ({ page }) => {
    await asPetra(page);
    await page.goto(PROJECTS);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Projects");

    const overflow = await overflowOf(page);
    expect(overflow, `the chooser overflows by ${String(overflow)}px on a phone`).toBeLessThanOrEqual(
      1,
    );

    await expect(page.locator(".irs-brand")).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Open / }).first()).toBeVisible();
  });

  test("still opens a project", async ({ page }) => {
    await asPetra(page);
    await page.goto(PROJECTS);
    await page.getByRole("link", { name: /^Open / }).first().click();
    await page.waitForURL(/\/alpha\/[^/]+\/ask$/);
  });
});
