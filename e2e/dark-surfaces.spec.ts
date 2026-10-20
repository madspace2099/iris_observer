import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./sign-in";

/**
 * EVERY SURFACE ON SCREEN IS DARK; THE PRINTED REPORT IS DARK INK ON WHITE.
 *
 * The owner, 2026-10-19: "Everything in the system must have a dark
 * background, not white", naming `/alpha/ister-tower/agents/agt_martinkovac`.
 * ADR-0042 moved the paper ground under `@media print`. Measured in the
 * rendered page: for each region, the first opaque background found walking
 * up from it is what a reader sees behind its text, and its luminance must be
 * that of a dark ground. In print the report's own text must resolve to dark
 * ink, which the earlier print block failed to give every child.
 */

/* A dark ground; the graphite page is about 0.003, and white is 1. */
const DARK = 0.05;

/*
 * Relative luminance of the first opaque background at or above each match.
 * A light opaque stop in a background image counts as a light ground, and a
 * walk that finds nothing opaque reports white: the browser's canvas, which
 * is what a reader would see behind the text.
 */
async function groundsOf(page: Page, selector: string): Promise<number[]> {
  return page.locator(selector).evaluateAll((elements, dark) => {
    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const lum = ([r = 0, g = 0, b = 0]: number[]) =>
      0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    return elements.map((start) => {
      for (let el: Element | null = start; el !== null; el = el.parentElement) {
        const style = getComputedStyle(el);
        for (const stop of style.backgroundImage.match(/rgba?\([^)]*\)/g) ?? []) {
          const [r = 0, g = 0, b = 0, a = 1] = parse(stop);
          if (a > 0.5 && lum([r, g, b]) >= dark) return lum([r, g, b]);
        }
        const [r = 0, g = 0, b = 0, a = 1] = parse(style.backgroundColor);
        if (a > 0.5) return lum([r, g, b]);
      }
      return 1;
    });
  }, DARK);
}

/** Relative luminance of each match's own text colour. */
async function inksOf(page: Page, selector: string): Promise<number[]> {
  return page.locator(selector).evaluateAll((elements) => {
    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return elements.map((el) => {
      const [r = 0, g = 0, b = 0] = (getComputedStyle(el).color.match(/[\d.]+/g) ?? []).map(
        Number,
      );
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    });
  });
}

test.describe("dark on screen", () => {
  test("the sign-in stands on a dark ground", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "a ground does not vary with width");
    await page.goto("/sign-in");
    const [form] = await groundsOf(page, ".mp-login-panel");
    expect(form, "the sign-in form's ground").toBeLessThan(DARK);
  });

  test("the root 404 stands on a dark ground", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "a ground does not vary with width");
    await page.goto("/no-such-page-anywhere");
    const grounds = await groundsOf(page, ".mp-empty");
    expect(grounds.length).toBe(1);
    expect(grounds[0], "the 404 panel's ground").toBeLessThan(DARK);
  });

  test("every plate on the agent page the owner named is dark", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "a ground does not vary with width");
    await signIn(page, "Petra Novák");
    await page.goto("/alpha/ister-tower/agents/agt_martinkovac");
    const plates = await groundsOf(page, ".ox-plate");
    expect(plates.length, "the page has plates to measure").toBeGreaterThan(0);
    expect(plates.filter((l) => l >= DARK), "plates on a light ground").toEqual([]);
    const cells = await groundsOf(page, ".ox-plate td, .ox-plate th");
    expect(cells.filter((l) => l >= DARK), "table cells on a light ground").toEqual([]);
  });
});

test("the printed report is dark ink, the period band included", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "print does not vary with width");
  await signIn(page, "Petra Novák");
  await page.goto("/alpha/ister-tower/report?agent=agt_martinkovac", { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  const inks = await inksOf(
    page,
    ".ox-report .ox-section-title, .ox-report .ox-section-note, .ox-context .ox-menu-value",
  );
  expect(inks.length, "the report has text to measure").toBeGreaterThan(0);
  expect(inks.filter((l) => l >= 0.2), "light ink on the printed page").toEqual([]);
});
