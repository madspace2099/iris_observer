import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./sign-in";

/**
 * IRIS-LED SALES AND CONNECT YOUR CRM (ADR-0049), ON THE RENDERED PAGES.
 *
 * The owner asked which sales the showroom stood behind, and for a place to
 * add a CRM. The page must say a sequence and never a cause, carry every
 * figure over its denominator, draw a row per sale, and hold a phone's width;
 * the settings page must show the demonstration CRM as connected with no form
 * that would do nothing, and refuse a member any form at all.
 */

const ROOT = "/shark/shark-residence";
const CAUSAL = /\b(because|caused|thanks to|due to|drove|led to the sale|resulted in|proves)\b/i;

async function open(page: Page, who: string, path: string): Promise<void> {
  await signInAs(page, who);
  await page.goto(path, { waitUntil: "networkidle" });
}

test("Sales Flow's IRIS-assisted card opens IRIS-led sales, period kept", async ({ page }) => {
  await open(page, "Daniel Hart", `${ROOT}/flow?period=year_to_date`);
  await page.getByRole("link", { name: "Open IRIS-led sales" }).click();
  await expect(page).toHaveURL(/\/flow\/iris-led\?period=year_to_date$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /\d+ of \d+ sales in this period (was|were) shown in IRIS before/,
  );
});

test("the page states a rule about order, with denominators, and no cause", async ({ page }) => {
  await open(page, "Daniel Hart", `${ROOT}/flow/iris-led`);
  const main = page.locator("main");
  await expect(main).toContainText("It is a rule about order.");
  for (const label of [
    "Shown in IRIS before the change",
    "Shown within 72 hours of the change",
    "Showings before a sale, median",
    "Last showing to the change, median",
  ]) {
    await expect(main).toContainText(label);
  }
  await expect(main.getByText(/^\d+ of \d+$/).first()).toBeVisible();
  /* Beside the figures: the card above counts another frame, and the demonstration CRM's 100% is made. */
  await expect(main).toContainText("applies the same 72-hour rule to every dated deal");
  await expect(main).toContainText("was shown in IRIS by construction");

  const info = page.locator("details.ir-led-info");
  await info.locator("summary").click();
  await expect(info).toContainText("Sequence, not cause.");
  await expect(info).toContainText("not linked to the visitor in the room");

  expect(await main.innerText()).not.toMatch(CAUSAL);
});

test("one timeline row per shown sale, its last showing a named link to the replay", async ({
  page,
}) => {
  await open(page, "Daniel Hart", `${ROOT}/flow/iris-led`);
  const rows = page.locator(".ir-led-row:not(.ir-led-axis-row)");
  expect(await rows.count()).toBeGreaterThan(0);
  const last = rows.first().locator('a.ir-led-dot[data-last="true"]');
  await expect(last).toHaveAttribute("aria-label", /shown .* by .*before the .*Open the meeting\./);
  await expect(last).toHaveAttribute("href", /\/meetings\//);
  /* Every other dot is out of the tab order. */
  for (const dot of await rows.first().locator("a.ir-led-dot:not([data-last])").all()) {
    await expect(dot).toHaveAttribute("tabindex", "-1");
  }
  await last.hover();
  await expect(rows.first().locator('a.ir-led-dot[data-last="true"] .ir-led-tip')).toBeVisible();
});

test("a developer reads the rows and is given no replay link", async ({ page }) => {
  await open(page, "Clara Weiss", `${ROOT}/flow/iris-led`);
  await expect(page.locator("main a.ir-led-dot")).toHaveCount(0);
  await expect(page.locator("main a[href*='/meetings/']")).toHaveCount(0);
});

test("IRIS-led sales passes axe, and holds a phone's width", async ({ page }) => {
  await open(page, "Daniel Hart", `${ROOT}/flow/iris-led`);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "no sideways scroll").toBeLessThanOrEqual(0);
});

test("Connect your CRM: the demonstration CRM is connected and offers no form", async ({
  page,
}) => {
  await open(page, "Clara Weiss", `/settings/crm?from=${encodeURIComponent(`${ROOT}/flow/iris-led`)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connect your CRM");
  await expect(page.getByRole("link", { name: "Back to IRIS-led sales" })).toBeVisible();
  const main = page.locator("main");
  await expect(main).toContainText("Demonstration CRM, connected");
  for (const provider of ["Realpad", "Monday.com", "Google Sheets", "CSV upload"]) {
    await expect(main.getByRole("heading", { name: provider })).toBeVisible();
  }
  await expect(main).toContainText("does not read a live sheet");
  await expect(main.locator('input[type="password"], input[type="file"]')).toHaveCount(0);
  await expect(main.getByRole("link", { name: "Open IRIS-led sales for Shark Residence" })).toBeVisible();
});

test("Connect your CRM: an agency's admin reads the developer's CRM and gets no form", async ({
  page,
}) => {
  await open(page, "Tomáš Varga", "/settings/crm");
  const main = page.locator("main");
  await expect(main).toContainText("This project's CRM belongs to Alpha Estates");
  await expect(main.locator('input[type="password"], input[type="file"]')).toHaveCount(0);
});

test("Connect your CRM sits beside AI and usage, and a member is told who connects it", async ({
  page,
}) => {
  await open(page, "Nora Lind", "/settings/ai");
  await page.getByRole("navigation", { name: "Account settings" }).getByRole("link", { name: "CRM" }).click();
  await expect(page).toHaveURL(/\/settings\/crm/);
  await expect(page.locator("main")).toContainText("Clara Weiss, your company's admin, connects it");
  await expect(page.locator('main input[type="password"]')).toHaveCount(0);
});
