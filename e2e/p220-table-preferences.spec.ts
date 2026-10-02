import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * P2-20: A REGISTER REMEMBERS ITS COLUMNS AND DENSITY, IN THIS BROWSER (ZARAS1, 2026-10-02).
 *
 * The reader hides a column and chooses compact rows on the unit register,
 * reloads, and finds both as they left them; the page says the choice is
 * kept in this browser only. The register's own column cannot be hidden.
 * With nothing stored the register renders as it always did — that half is
 * held by `apps/web/test/table-preferences.test.ts`, storage that throws
 * included.
 */

test.beforeEach(({ isMobile }, testInfo) => {
  test.skip(isMobile || testInfo.project.name !== "desktop", "a reading of the page, not of its width");
});

test("P2-20 · the unit register keeps a hidden column and compact rows across a reload", async ({
  page,
}) => {
  await signInAs(page, "Tomáš Varga");
  await page.goto("/alpha/northgate/units", { waitUntil: "networkidle" });

  const table = page.locator('main [data-prefs-scope="units"]');
  const headers = table.locator("thead th[data-col]");
  expect(await headers.count()).toBeGreaterThan(3);
  /* The second column: the first is the unit itself, which stays. */
  const second = headers.nth(1);
  const key = (await second.getAttribute("data-col")) ?? "";
  const label = ((await second.textContent()) ?? "").replace(/[▲▼]/g, "").trim();
  expect(key).not.toBe("");
  await expect(second).toBeVisible();

  await table.getByText("Columns", { exact: true }).click();
  await expect(table.getByRole("checkbox").first(), "the unit's own column stays").toBeDisabled();
  await table.getByRole("checkbox", { name: label }).uncheck();
  await table.getByRole("button", { name: "Compact" }).click();
  await expect(table.locator(`thead th[data-col="${key}"]`)).toBeHidden();
  await expect(table.getByText("Kept in this browser only.")).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(table.locator(`thead th[data-col="${key}"]`), "still hidden after a reload").toBeHidden();
  await expect(table.locator(`tbody td[data-col="${key}"]`).first()).toBeHidden();
  await expect(table.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
});

test("P2-20 · the meetings register offers the same choice", async ({ page }) => {
  await signInAs(page, "Tomáš Varga");
  await page.goto("/alpha/northgate/meetings", { waitUntil: "networkidle" });
  const table = page.locator('main [data-prefs-scope="meetings"]');
  await expect(table.getByText("Columns", { exact: true })).toBeVisible();
  await expect(table.getByRole("button", { name: "Comfortable" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
