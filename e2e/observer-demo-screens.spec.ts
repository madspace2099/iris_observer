import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The demonstration surface, photographed and inspected.
 *
 * Screenshots are the deliverable here, but a screenshot nobody looks at proves
 * nothing — so each capture is preceded by the checks a person would make on
 * looking at it: does the page scroll sideways, does any panel overflow its
 * column, is any label too small to read, do two charts collide.
 *
 * Playwright is already a dev dependency of this repository and is used by the
 * existing suites; nothing new is installed to run these.
 */

/*
 * Against the production build the Playwright config starts, not the dev
 * server: the development overlay paints a floating indicator over the corner
 * of every page, and a screenshot of the demonstration surface should contain
 * the demonstration surface. Relative paths resolve against that baseURL.
 */
const SHOTS = "artifacts/observer-demo";

/** Nothing may push the document wider than the viewport. */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scroll: doc.scrollWidth, client: doc.clientWidth };
  });
  expect(overflow.scroll, "the document must not scroll sideways").toBeLessThanOrEqual(
    overflow.client + 1,
  );
}

/**
 * No element may spill out of the panel that contains it.
 *
 * Checked on the rendered boxes rather than by reading the CSS: a column that
 * overflows by four pixels is invisible in source and obvious in a screenshot.
 */
async function expectNoPanelOverflow(page: Page): Promise<void> {
  const spills = await page.evaluate(() => {
    const out: string[] = [];
    for (const panel of document.querySelectorAll<HTMLElement>(".od-panel")) {
      const box = panel.getBoundingClientRect();
      for (const child of panel.querySelectorAll<HTMLElement>(":scope > *")) {
        const c = child.getBoundingClientRect();
        /* A scroll container is allowed to be wider than its own viewport. */
        if (child.classList.contains("od-table-scroll")) continue;
        if (c.right > box.right + 1.5 || c.left < box.left - 1.5) {
          out.push(`${panel.className} > ${child.className || child.tagName}`);
        }
      }
    }
    return out;
  });
  expect(spills, "no child may spill out of its panel").toEqual([]);
}

/** Body text below 11px is not readable on a presentation screen. */
async function expectReadableText(page: Page): Promise<void> {
  const tiny = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(".od *")) {
      if (el.children.length > 0) continue;
      const text = (el.textContent ?? "").trim();
      if (text.length < 3) continue;
      const size = Number.parseFloat(getComputedStyle(el).fontSize);
      if (size < 10) out.push(`${size}px · ${text.slice(0, 40)}`);
    }
    return out;
  });
  expect(tiny, "no readable text may be under 10px").toEqual([]);
}

test.describe("IRIS Observer demonstration screens", () => {
  test("Overview at 1920x1080", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/observer/overview");
    await page.waitForSelector(".od-kpi-value");

    /* The presentation screen, and the numbers a partner would be shown. */
    await expect(page.locator(".od-kpi")).toHaveCount(6);
    await expect(page.locator(".od-demo-flag")).toContainText("Demo data");
    await expect(page.locator(".od-panel-title").first()).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectNoPanelOverflow(page);
    await expectReadableText(page);

    await page.screenshot({ path: `${SHOTS}/01-overview-1920.png`, fullPage: true });
  });

  test("Overview at 1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/observer/overview");
    await page.waitForSelector(".od-kpi-value");

    await expectNoHorizontalOverflow(page);
    await expectNoPanelOverflow(page);
    await page.screenshot({ path: `${SHOTS}/02-overview-1440.png`, fullPage: true });
  });

  test("Units with the detail panel open", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/observer/units");
    await page.waitForSelector(".od-table tbody tr");

    await page.locator(".od-table tbody tr").first().click();
    await page.waitForSelector(".od-drawer");

    await expect(page.locator(".od-drawer .od-panel-title").first()).toContainText("Unit");
    await expect(page.locator(".od-drawer .od-event")).not.toHaveCount(0);

    await expectNoHorizontalOverflow(page);
    await expectNoPanelOverflow(page);
    /*
     * The viewport, not the full page. The detail panel is sticky and scrolls
     * within the window; a full-page capture renders it at its natural
     * position and slices it, which shows a fault the screen does not have.
     */
    await page.screenshot({ path: `${SHOTS}/03-units-detail-1920.png` });
  });

  test("Units empty state", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/observer/units");
    await page.waitForSelector(".od-table tbody tr");

    /* Sold and rising at once: a combination the fixture deliberately has none of. */
    await page.selectOption(".od-filters select >> nth=0", "sold");
    await page.selectOption(".od-filters select >> nth=4", "rising");
    await page.waitForSelector(".od-state");
    await expect(page.locator(".od-state strong")).toContainText("No unit matches");

    await page.screenshot({ path: `${SHOTS}/04-units-empty-1920.png`, fullPage: true });
  });

  test("Insights", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/observer/insights");
    await page.waitForSelector(".od-insight");

    await expect(page.locator(".od-insight")).toHaveCount(6);
    /* The weakest evidence is visibly the weakest. */
    await expect(page.locator('.od-insight[data-evidence="association"]')).toHaveCount(1);

    await expectNoHorizontalOverflow(page);
    await expectNoPanelOverflow(page);
    await expectReadableText(page);

    await page.screenshot({ path: `${SHOTS}/05-insights-1920.png`, fullPage: true });
  });

  test("a window with nothing attributed in it", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    /* The Buda Terrace release on Web IRIS alone: activity, no attribution. */
    await page.goto("/observer/overview?project=buda-terrace&range=28d&channel=web");
    await page.waitForSelector(".od-kpi-value");

    await expect(page.locator(".od-notice")).toContainText("No attributed reservations");
    /* Stated, not implied by a zero — and the sessions are still counted. */
    await expect(page.locator(".od-channel-value").first()).not.toHaveText("0");

    await expectNoHorizontalOverflow(page);
    await expectNoPanelOverflow(page);
    await expectReadableText(page);

    await page.screenshot({ path: `${SHOTS}/07-no-attribution-1920.png`, fullPage: true });
  });

  test("mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/observer/overview");
    await page.waitForSelector(".od-kpi-value");

    /* The rail becomes a scrolling strip rather than eating half the screen. */
    const sideWidth = await page.locator(".od-side").evaluate((e) => e.getBoundingClientRect().width);
    expect(sideWidth).toBeGreaterThan(300);

    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/06-overview-mobile.png`, fullPage: true });
  });
});
