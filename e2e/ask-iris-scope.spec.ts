import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * ASK IRIS SCOPE: CURRENT / ALL / COMPARE.
 *
 * `ask-iris.css`/`AskScreen.tsx` carry the control; `ask-scope.test.ts` and
 * `landing.test.ts` cover its pure logic. What only a real browser can prove
 * is here: the control opens and operates from the keyboard alone, it never
 * offers a project this account was not granted, and adding it did not cost
 * the composer a horizontal scrollbar at any width.
 */

const OUT =
  process.env["OBSERVER_SCOPE_SHOTS"] ??
  "C:/Users/42191/AppData/Local/Temp/claude/C--Users-42191-Documents-IRIS-OBSERVER/8eba7212-1d04-4994-b6ca-c0d2830338c5/scratchpad/screenshots";

const ISTER = "/alpha/ister-tower/ask";

async function assertNoOverflow(page: Page, where: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where} overflows horizontally by ${String(overflow)}px`).toBeLessThanOrEqual(
    1,
  );
}

test.describe("Ask IRIS scope control", () => {
  test("a single-project account is never offered Compare at all", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    // Martin Kováč holds only ISTER TOWER — there is no second project to
    // compare against, so the tab must not exist rather than open onto an
    // empty checklist.
    await signInAs(page, "Martin Kováč");
    await page.goto(ISTER);
    await expect(page.locator(".ask-page").getByPlaceholder("Ask IRIS…")).toBeVisible();
    await expect(page.locator(".ask-scope-tab").filter({ hasText: "Compare" })).toHaveCount(0);
  });

  test("Compare lists only the projects this account actually holds", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák", "ISTER TOWER");
    await page.goto(ISTER);

    const scopeTrigger = page.locator(".ask-scope-wrap summary");
    await scopeTrigger.click();
    await page.getByRole("radio", { name: "Compare" }).check({ force: true });

    const names = await page.locator(".ask-scope-check span").allTextContents();
    // Petra holds ISTER TOWER, Northgate Residences and Riverside Walk —
    // never a project from another developer's tenant.
    expect(new Set(names)).toEqual(
      new Set(["ISTER TOWER", "Northgate Residences", "Riverside Walk"]),
    );
  });

  test("the scope control opens, selects and submits from the keyboard alone", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák", "ISTER TOWER");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ISTER);

    const trigger = page.locator(".ask-scope-wrap summary");
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");

    const allTab = page.getByRole("radio", { name: "All" });
    await expect(allTab).toBeVisible();
    await allTab.focus();
    await page.keyboard.press(" ");
    await expect(allTab).toBeChecked();

    const field = page.locator(".ask-page").getByPlaceholder("Ask IRIS…");
    await field.fill("How are two-bedroom apartments selling?");
    await field.press("Enter");

    await page.waitForURL(/[?&]scope=all\b/);
    await expect(page.locator(".ask-model-name").filter({ hasText: "All projects" })).toBeVisible();
  });

  test("no horizontal overflow with the scope menu open, at 1440 or 390", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once, both widths within the test");
    await signInAs(page, "Petra Novák", "ISTER TOWER");

    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(ISTER);
      await page.locator(".ask-scope-wrap summary").click();
      await page.getByRole("radio", { name: "Compare" }).check({ force: true });
      await expect(page.locator(".ask-scope-check").first()).toBeVisible();
      await assertNoOverflow(page, `Ask IRIS with Compare open at ${String(width)}`);
    }
  });

  /* --- the visual review package ---------------------------------------- */

  test("captures the review package", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "captured once");
    mkdirSync(OUT, { recursive: true });
    await signInAs(page, "Petra Novák", "ISTER TOWER");

    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(ISTER);
    await expect(page.locator(".ask-page").getByPlaceholder("Ask IRIS…")).toBeVisible();
    await page.screenshot({ path: `${OUT}/scope-current-1440.png` });

    /*
     * `.ask-scope-tab`'s checked/unchecked background is a 140ms transition
     * (`ask-iris.css`), so a screenshot taken in the same tick as `.check()`
     * can catch the PREVIOUS tab still fading out — both mid-fade at once,
     * neither a state that was ever actually selected. `waitForTimeout`
     * clears the transition before every capture below.
     */
    await page.locator(".ask-scope-wrap summary").click();
    await page.getByRole("radio", { name: "All" }).check({ force: true });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/scope-all-open-1440.png` });

    await page.getByRole("radio", { name: "Compare" }).check({ force: true });
    await expect(page.locator(".ask-scope-check").first()).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/scope-compare-open-1440.png` });

    await page.getByRole("checkbox", { name: "Northgate Residences" }).check({ force: true });
    await page.screenshot({ path: `${OUT}/scope-compare-two-selected-1440.png` });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ISTER);
    await expect(page.locator(".ask-page").getByPlaceholder("Ask IRIS…")).toBeVisible();
    await page.screenshot({ path: `${OUT}/scope-current-390.png` });

    await page.locator(".ask-scope-wrap summary").click();
    await page.getByRole("radio", { name: "Compare" }).check({ force: true });
    await expect(page.locator(".ask-scope-check").first()).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/scope-compare-390.png` });
  });
});
