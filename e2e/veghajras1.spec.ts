import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * P2-21: THE WORK-ONLY ITEMS, ON THE PAGE A READER OPENS (VEGHAJRAS1, 2026-10-04).
 *
 * Each test names its item by route and position and asserts only what the
 * requirement claims, on the rendered screen, in the words the screen prints.
 */

async function open(page: Page, who: string, path: string): Promise<string> {
  await signInAs(page, who);
  await page.goto(path, { waitUntil: "networkidle" });
  return page.locator("main").innerText();
}

test.beforeEach(({ isMobile }, testInfo) => {
  test.skip(isMobile || testInfo.project.name !== "desktop", "a reading of the page, not of its width");
});

test("R10-1 · Features keeps reach, opens and stay apart, states clicks as unavailable, and prints the screenshot total", async ({
  page,
}) => {
  const text = await open(page, "Tomáš Varga", "/alpha/northgate/features");
  const main = page.locator("main");

  expect(text).toContain("Opened in counts the presentations that reached a feature at all.");
  expect(text).toContain("Opens counts entries into it, returns included");
  expect(text).toContain("Median stay is the middle stop, not the average one.");

  const clicks = main.locator(".ox-unavailable", { hasText: "Clicks inside a feature" });
  await expect(clicks, "the click count is stated as unavailable, once").toHaveCount(1);
  await expect(clicks).toContainText("holds no click count");
  await expect(clicks, "and kept apart from opens").toContainText("Opens counts entries into a feature, not clicks");
  await expect(
    main
      .getByRole("table", { name: /features? of the IRIS presentation/ })
      .getByRole("columnheader", { name: /click/i }),
    "no column claims to count clicks",
  ).toHaveCount(0);
  await expect(main.locator(".ox-tally-item dt", { hasText: /click/i })).toHaveCount(0);

  const cell = main.locator(".ox-tally-item", { hasText: "Screenshots taken in the presentations recorded" });
  await expect(cell, "the screenshot total has a place").toHaveCount(1);
  const n = Number((await cell.locator(".ox-figure").innerText()).replace(/\D/g, ""));
  expect(Number.isInteger(n) && n > 0, `screenshots ${n}`).toBe(true);
});
