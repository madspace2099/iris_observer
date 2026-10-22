import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * SALES FLOW, ONE SCREEN AT A TIME (the owner, 2026-10-22, ADR-0059).
 *
 * "I should not see the next charts under it." Each block is a screen as tall
 * as the viewport under the sticky chrome, the document snaps from one to the
 * next, Page Down moves a screen, and a screen taller than the viewport (a
 * phone's, nearly all of them) is read through to its end, never held at its
 * top. Under reduced motion, which the suite runs in, the page does not snap:
 * Chrome animates every snap. One measured assertion per test.
 */

const FLOW = "/shark/shark-residence/flow";

async function open(page: Page): Promise<void> {
  await signInAs(page, "Clara Weiss");
  await page.goto(FLOW, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
}

/** The bottom of the sticky chrome: the scroller's padding, which the page sets to it. */
const chromeBottom = (page: Page) =>
  page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));

/** A screen's distance from the bottom of the chrome, once the page has come to rest. */
const offset = (page: Page, id: string, top: number) =>
  page
    .locator(`#${id}`)
    .evaluate((el, chrome) => Math.abs(el.getBoundingClientRect().top - chrome), top);

test("every screen fills the viewport under the header, so the next one starts below it", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "measured once, at the desktop width");
  await open(page);
  const top = await chromeBottom(page);
  const short = await page.evaluate((chrome) => {
    const room = window.innerHeight - chrome;
    return [...document.querySelectorAll<HTMLElement>(".flow-screen")]
      .filter((s) => s.getBoundingClientRect().height < room - 1)
      .map((s) => `${s.id} ${Math.round(s.getBoundingClientRect().height)} < ${Math.round(room)}`);
  }, top);
  expect(top, "the scroller's padding is the sticky chrome").toBeGreaterThan(100);
  expect(short, "a screen shorter than the room under the header").toEqual([]);
});

test("under reduced motion the page does not snap", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "measured once, at the desktop width");
  await open(page);
  const snap = await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType);
  expect(snap).toBe("none");
});

test.describe("where motion is wanted", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  /* A snap glides for about half a second; the screen is read where it comes to rest. */
  test("Page Down moves one screen and lands it under the header", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "measured once, at the desktop width");
    await open(page);
    const top = await chromeBottom(page);
    const ids = await page.locator(".flow-screen").evaluateAll((els) => els.map((e) => e.id));
    await page.locator("body").click({ position: { x: 4, y: 300 } });
    for (const id of ids.slice(1, 4)) {
      await page.keyboard.press("PageDown");
      await expect
        .poll(() => offset(page, id, top), { message: `${id} under the header` })
        .toBeLessThanOrEqual(2);
    }
  });

  test("on a phone a screen taller than the viewport is read to its end", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "mobile", "a phone is where screens outgrow the viewport");
    await open(page);
    const tallest = await page.locator(".flow-screen").evaluateAll((els) => {
      const best = els.reduce((a, b) =>
        b.getBoundingClientRect().height > a.getBoundingClientRect().height ? b : a,
      );
      return { id: best.id, height: best.getBoundingClientRect().height };
    });
    expect(tallest.height, "no screen is taller than the viewport here").toBeGreaterThan(
      page.viewportSize()?.height ?? 0,
    );
    await page.locator(`#${tallest.id}`).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    const from = await page.evaluate(() => window.scrollY);
    /* The arrow key, 40px a press: a wheel is not a phone's, and a press is the smallest step there is. */
    for (let i = 0; i < 15; i += 1) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(120);
    }
    const to = await page.evaluate(() => window.scrollY);
    expect(to - from, `${tallest.id} held its reader at its top`).toBeGreaterThan(400);
  });
});

/*
 * A dot replaces the address rather than pushing a fragment entry: the App
 * Router ignores a popped entry it did not write, so Back after a dot and a
 * window pick showed one window's figures under another's address.
 */
test("the rail names every screen and goes to it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the rail is drawn from a tablet's width up");
  await open(page);
  const rail = page.getByRole("navigation", { name: "Sales Flow screens" });
  const links = rail.getByRole("link");
  const screens = await page.locator(".flow-screen").count();
  await expect(links).toHaveCount(screens);
  const last = links.last();
  const target = ((await last.getAttribute("href")) ?? "").slice(1);
  const entries = await page.evaluate(() => history.length);
  await last.click();
  await expect(last).toHaveAttribute("aria-current", "location");
  const top = await chromeBottom(page);
  expect(await offset(page, target, top), `${target} under the header`).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => history.length), "a history entry").toBe(entries);
  expect(page.url()).toContain(`#${target}`);
});
