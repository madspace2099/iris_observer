import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * THE REGISTER A READER BUILT SURVIVES LEAVING IT — measured in a browser,
 * because the two halves of that sentence are not the same kind of claim.
 *
 * `apps/web/test/register-filter-survives.test.ts` proves the round trip:
 * every axis the register holds serialises into a link and parses back. That
 * is a source question and a unit test settles it.
 *
 * These are the halves it cannot settle, and which P2-08 explicitly refused to
 * assert from source:
 *
 *   A1  What the BROWSER restores. The filter lives in the query string, which
 *       is a reason to expect Back to work and not evidence that it does —
 *       history entries, the App Router's client cache and bfcache all sit
 *       between the URL and what the reader sees.
 *
 *   A1b What the CRUMB restores. This is the only Back the unit page draws,
 *       it is not the browser's history, and until P2-08 it returned the
 *       reader to an unfiltered register. It is the half that was broken.
 *
 *   A2  What the FILTER BAR submits. The fields are readable in source; that
 *       submitting them lands every axis in the address is not.
 *
 * Northgate is the fixture with a mixed catalogue, so a narrowed register here
 * is genuinely narrower than the whole.
 */

const BASE = "/alpha/northgate/units";

/**
 * A register narrowed on four axes at once.
 *
 * Every value is off its default on purpose: the serialiser omits defaults, so
 * a query left alone would travel as an empty string and prove nothing.
 * `shown=all` widens the row set first, which keeps the assertion about
 * *carrying the filter* rather than about how many units the period happened
 * to touch.
 */
const NARROWED = `${BASE}?status=reserved&shown=all&sort=views&dir=asc`;

const PARAMS = ["status=reserved", "shown=all", "sort=views", "dir=asc"] as const;

test.describe("the register survives leaving it", () => {
  test("A1 — the browser's Back returns the reader to the register they narrowed", async ({
    page,
  }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(NARROWED);

    const narrowedRows = await page.locator(".ox-plate.ox-paper tbody tr").count();
    expect(narrowedRows, "the fixture must narrow to something, or this proves nothing").toBeGreaterThan(0);

    /* The first unit code in the register is a link to that flat's own page. */
    const firstUnit = page.locator(".ox-plate.ox-paper tbody tr a").first();
    const code = (await firstUnit.textContent())?.trim() ?? "";
    expect(code, "no unit code to open").not.toBe("");
    await firstUnit.click();

    await expect(page.getByRole("heading", { level: 1, name: code })).toBeVisible();

    await page.goBack();

    /*
     * The address first, then the rendering. A URL that kept its parameters
     * while the table came back unfiltered would be a different defect, and
     * asserting only one of the two would miss it.
     */
    for (const param of PARAMS) {
      expect(page.url(), `Back dropped ${param}`).toContain(param);
    }
    await expect(page.locator(".ox-plate.ox-paper tbody tr")).toHaveCount(narrowedRows);
  });

  test("A1b — the Units crumb returns the reader to the same register, not to a register", async ({
    page,
  }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(NARROWED);

    const narrowedRows = await page.locator(".ox-plate.ox-paper tbody tr").count();
    const firstUnit = page.locator(".ox-plate.ox-paper tbody tr a").first();
    const code = (await firstUnit.textContent())?.trim() ?? "";
    await firstUnit.click();
    await expect(page.getByRole("heading", { level: 1, name: code })).toBeVisible();

    /*
     * The crumb, not `goBack`. This is a fresh navigation to a URL the unit
     * page had to build for itself out of what the row link carried — which
     * is why it can be wrong while the browser's own Back is right.
     */
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Units" }).click();

    /*
     * Wait for the register before reading the address, and read it with an
     * assertion that retries.
     *
     * `click()` resolves on the click, not on the navigation, so a bare
     * `page.url()` here can still be the unit page's — and the unit page's
     * address carries these very parameters, because the row link put them
     * there. The first version of this test did exactly that, and against a
     * crumb that had dropped everything its URL assertions still passed: only
     * the row count caught the defect. An assertion that cannot fail is not a
     * weaker assertion, it is a decoration.
     */
    await page.waitForURL(/\/units(\?|$)/);
    for (const param of PARAMS) {
      await expect(page, `the Units crumb dropped ${param}`).toHaveURL(new RegExp(param));
    }
    await expect(page.locator(".ox-plate.ox-paper tbody tr")).toHaveCount(narrowedRows);
  });

  test("A2 — submitting the filter bar puts every axis it changed in the address", async ({
    page,
  }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(BASE);

    /*
     * "B" and not "A". Northgate's four reserved flats are B-601, B-602,
     * C-701 and C-702, so `q=A` with `status=reserved` is a combination with
     * no rows in it — the first version of this test asserted rows for exactly
     * that pair and failed against a register that was behaving correctly.
     * `filterRows` matches the needle against the unit code or the aspect
     * (`register.ts:237-240`), and no orientation contains a "b".
     */
    await page.getByLabel("Unit or aspect").fill("B");
    await page.getByLabel("Status", { exact: true }).selectOption("reserved");
    await page.getByLabel("Register", { exact: true }).selectOption("all");

    /*
     * Submitted the way a reader submits it. The bar is a form, so pressing
     * Return in its text field is the path most people take and the one least
     * likely to be accidentally satisfied by a button that does something else.
     */
    await page.getByLabel("Unit or aspect").press("Enter");

    await expect(page).toHaveURL(/status=reserved/);
    await expect(page).toHaveURL(/shown=all/);
    await expect(page).toHaveURL(/q=B/);

    /*
     * And the rows re-ran through the filter, rather than the address alone
     * changing. Every code drawn must satisfy both axes, which is a stronger
     * claim than "some row is visible" and is the one that would catch a
     * filter that updated the URL and nothing else.
     */
    const codes = page.locator(".ox-plate.ox-paper tbody tr a");
    await expect(codes.first()).toBeVisible();
    for (const text of await codes.allTextContents()) {
      expect(text.trim(), "a row survived the filter that should not have").toMatch(/^B-/);
    }
  });
});
