import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * The dock's question travels with the period the page is read in.
 *
 * "Why did demand fall" is a different question over 28 days than over a
 * quarter, and a prompt that dropped the period would answer the wrong one
 * without saying so — the dock's own docblock said that while the layout
 * passed it an empty period, because a layout cannot see the query. The field
 * is read off the URL by a client component now (`PeriodField`), as the shell
 * reads its own period. Measured on the rendered form, one assertion each.
 */

const DOCK_PERIOD = ".ask-dock form input[name='period']";

test("the dock's form carries the period the page is read in", async ({ page }) => {
  await signIn(page, "MADSPACE Operations");
  await page.goto("/alpha/northgate/agents?period=last_28_days");
  await expect(
    page.locator(DOCK_PERIOD),
    "a question asked over 28 days would be answered over the default quarter",
  ).toHaveValue("last_28_days");
});

test("and carries nothing for the default span, as every other link does", async ({ page }) => {
  await signIn(page, "MADSPACE Operations");
  await page.goto("/alpha/northgate/agents");
  await expect(page.locator(DOCK_PERIOD)).toHaveCount(0);
});
