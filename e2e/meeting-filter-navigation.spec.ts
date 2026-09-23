import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * THE MEETING REGISTER A READER NARROWED SURVIVES OPENING A MEETING — P2-16's
 * first clause, "lista→detail→Back megőrzi a scope-ot", for the meeting route.
 *
 * The units register already carried its state through a unit's page and back
 * (`register-filter-navigation.spec.ts`). The meeting register did not: its
 * rows opened a replay with the period and nothing else, and the replay's two
 * ways back — the "Meetings" crumb and the button beside the head — returned
 * to the whole period. Photographed on 2026-09-23 with `agent` and `outcome`
 * set: every link on the replay pointed at `/meetings?period=…`.
 *
 * Both axes are set, and together they narrow Northgate's last 28 days from
 * 39 meetings to 3 (the agent alone leaves 9), so a way back that drops either
 * one is caught by the row count as well as by the address.
 */

const NARROWED = "/alpha/northgate/meetings?agent=agt_lucia&outcome=follow_up_needed&period=last_28_days";
const PARAMS = ["agent=agt_lucia", "outcome=follow_up_needed", "period=last_28_days"] as const;

const rows = (page: Page) => page.locator(".ox-plate.ox-paper tbody tr");

/** Open the narrowed register and the first meeting in it; returns the register's row count. */
async function openFirstMeeting(page: Page): Promise<number> {
  await signIn(page, "Tomáš Varga");
  await page.goto(NARROWED);
  const narrowed = await rows(page).count();
  expect(narrowed, "the fixture must narrow to something, or this proves nothing").toBeGreaterThan(0);
  await page.getByRole("link", { name: /open this meeting/ }).first().click();
  await page.waitForURL(/\/meetings\/mtg_/);
  return narrowed;
}

test.describe("the meeting register survives opening a meeting", () => {
  test("M0 — the row that opens a meeting carries the register into the replay's address", async ({
    page,
  }) => {
    await openFirstMeeting(page);
    for (const param of PARAMS) {
      expect(page.url(), `the row link dropped ${param}`).toContain(param);
    }
  });

  test("M1 — the Meetings crumb returns the reader to the register they narrowed", async ({
    page,
  }) => {
    const narrowed = await openFirstMeeting(page);
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Meetings" })
      .click();
    /* Wait for the register, then read the address with retrying assertions:
     * `click()` resolves before the navigation does. */
    await page.waitForURL(/\/meetings(\?|$)/);
    for (const param of PARAMS) {
      await expect(page, `the Meetings crumb dropped ${param}`).toHaveURL(new RegExp(param));
    }
    await expect(rows(page)).toHaveCount(narrowed);
  });

  test("M2 — the replay's own way back returns to the same register, and says it is the narrowed one", async ({
    page,
  }) => {
    const narrowed = await openFirstMeeting(page);
    const back = page.getByRole("link", {
      name: /^(Back to the narrowed register|Every meeting in the period)$/,
    });
    /* A label that says "every meeting" over a link to three of them is the
     * slot's sentence and its destination disagreeing (rule 21). */
    await expect(back, "the way back does not say it returns to the narrowed register").toHaveText(
      "Back to the narrowed register",
    );
    await back.click();
    await page.waitForURL(/\/meetings(\?|$)/);
    for (const param of PARAMS) {
      await expect(page, `the replay's way back dropped ${param}`).toHaveURL(new RegExp(param));
    }
    await expect(rows(page)).toHaveCount(narrowed);
  });

  test("M3 — a replay reached without a narrowed register still offers every meeting in the period", async ({
    page,
  }) => {
    await signIn(page, "Tomáš Varga");
    await page.goto("/alpha/northgate/meetings?period=last_28_days");
    await page.getByRole("link", { name: /open this meeting/ }).first().click();
    await page.waitForURL(/\/meetings\/mtg_/);
    const back = page.getByRole("link", { name: "Every meeting in the period" });
    await expect(back).toBeVisible();
    await back.click();
    await page.waitForURL(/\/meetings(\?|$)/);
    await expect(page).toHaveURL(/period=last_28_days/);
    await expect(page).not.toHaveURL(/agent=|channel=|outcome=/);
  });
});
