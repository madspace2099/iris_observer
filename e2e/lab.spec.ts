import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.skip(
  ({ isMobile }) => isMobile === true,
  "the concepts are desktop compositions; a phone layout follows the choice",
);

/**
 * The laboratory's own gate.
 *
 * These concepts are isolated from production, but "isolated" is not a licence
 * to ship an inaccessible surface — whichever one is chosen becomes the
 * product. Contrast and semantics are checked here, not after the choice.
 */
const ROUTES = [
  ["profile picker", "/lab/sign-in"],
  ["concept A", "/lab/overview-a"],
  ["concept B", "/lab/overview-b"],
] as const;

for (const [name, route] of ROUTES) {
  test(`${name} has no detectable accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("the Pulse drives the page rather than decorating it", async ({ page }) => {
  await page.goto("/lab/overview-b");
  const before = await page.locator("h1").first().innerText();

  await page.locator(".iris-cell").nth(11).click();
  const after = await page.locator("h1").first().innerText();

  // A Pulse that changes nothing when you select a unit is a picture, and the
  // design system says to delete it.
  expect(after).not.toBe(before);
  // The selection is stated as a dismissible mode chip, so the reader can see
  // — and undo — what the rest of the page is now answering about.
  await expect(page.locator(".iris-mode").filter({ hasText: /^Unit: / })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear selection" })).toBeVisible();
});

test("Ask Observer answers against the current selection", async ({ page }) => {
  await page.goto("/lab/overview-a");
  const ask = page.getByPlaceholder("Ask Observer…");
  await ask.fill("Which units are people actually looking at?");
  await ask.press("Enter");

  const sheet = page.getByRole("dialog", { name: "Ask Observer" });
  await expect(sheet).toBeVisible();
  // Every answer carries its evidence. An assistant that asserts without one
  // is the thing this product exists to replace.
  await expect(sheet.getByText(/records/).first()).toBeVisible();
});

test("every figure on the unit list can explain itself", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("listitem").filter({ hasText: "Petra Novák" }).getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/showroom/);
  await page.goto("/alpha/northgate/units");

  // No abbreviated headers. A reader should not have to guess what a column is.
  for (const label of ["Attention", "Meetings", "Typical look", "Shortlisted", "Trend"]) {
    await expect(page.getByRole("columnheader").or(page.locator(".iris-measure-label")).filter({ hasText: label }).first()).toBeVisible();
  }

  const info = page.getByRole("button", { name: /What Typical look measures/ });
  await expect(info).toBeVisible();
  await info.click();

  const panel = page.getByRole("note");
  await expect(panel).toBeVisible();
  // The four things a number has to be able to say about itself.
  await expect(panel).toContainText("What it measures");
  await expect(panel).toContainText("How it is computed");
  await expect(panel).toContainText("What it does not say");
  await expect(panel).toContainText("IRIS observed");
});
