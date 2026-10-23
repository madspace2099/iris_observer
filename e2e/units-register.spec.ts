import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * THE UNIT DEMAND REGISTER — real-path coverage for what a reader can learn
 * about each column, moved out of `lab.spec.ts` (2026-09-08).
 *
 * `lab.spec.ts:68`, "every figure on the unit list can explain itself", used
 * to live here and asserted a per-column info BUTTON that opened a popover
 * with four labelled facts ("What it measures", "How it is computed", "What
 * it does not say", "IRIS observed"), against column names ("Attention",
 * "Typical look", "Trend") that do not exist on the register today.
 *
 * That interaction was deliberately superseded, not merely renamed away.
 * `UnitRegister.tsx`'s own docblock records the decision directly: "The
 * surface this replaces put an info control beside each heading, and that
 * property is worth keeping … `DataColumn.label` is a string and cannot hold
 * a control, so the definitions are stated once beneath the table instead —
 * reported as a gap in the shared layer rather than worked around by
 * hand-rolling a second table." The current register has twelve real
 * columns (Unit, Status, Rooms, Floor, Area m², Price, Meetings, Views,
 * Shortlisted, Plans opened, Comparisons, Demand signal · derived) and one
 * list that defines every measured one.
 *
 * That list stood beneath the table, always open, until the owner asked for
 * the text around the figures to move behind an `i` before recording the
 * video (2026-10-23, as ADR-0058 did for the answer sheets): it is now the
 * panel of the one `i` beside the register's title ("About how to read this
 * register"). The panel is in the server's HTML, so a reader without script
 * still has it, and a definition may stand behind an `i` where a figure may
 * not.
 *
 * This file protects the actual current requirement — every measured column
 * has its definition stated, one press away, contained on a phone — rather
 * than the retired per-column popover. Moved to its own file because
 * the register is a real product surface, not a `/lab/*` composition: it
 * does not belong under `lab.spec.ts`'s file-level `test.skip` for mobile
 * (lab concepts are desktop-only by design; the shipping register is not).
 */

/** The columns the register carries a written definition for, in order. */
const DEFINED_COLUMNS = [
  "Order",
  "Status",
  "Meetings",
  "Views",
  "Shortlisted",
  "Plans opened",
  "Comparisons",
  "Demand signal · derived",
] as const;

/** The full set of column headers the table itself renders. */
const HEADERS = [
  "Unit",
  "Status",
  "Rooms",
  "Floor",
  "Area m²",
  "Price",
  "Meetings",
  "Views",
  "Shortlisted",
  "Plans opened",
  "Comparisons",
  "Demand signal · derived",
] as const;

test("every measured column on the unit register states what it measures", async ({ page }) => {
  await signInAs(page, "Petra Novák");
  await page.goto("/alpha/northgate/units");

  // Every real column header is drawn, in the order a flat is described in.
  for (const label of HEADERS) {
    await expect(
      page.getByRole("columnheader", { name: label, exact: true }).first(),
    ).toBeVisible();
  }

  /*
   * The definitions, in the panel of the `i` beside the register's title.
   * One button opens them; the panel is the register's own (`#info-register`).
   */
  await page.getByRole("button", { name: "About how to read this register" }).click();
  const scope = page.locator("#info-register .ox-scope");
  await expect(scope).toBeVisible();

  /*
   * Exactly the fixed set of column definitions. "Not opened" was a ninth
   * item when the list stood beneath the table; it is a count of the period,
   * so it stays in view under the register and is not part of the panel.
   */
  const items = scope.locator("li.ox-scope-item");
  expect(await items.count()).toBe(DEFINED_COLUMNS.length);

  for (const term of DEFINED_COLUMNS) {
    const item = items.filter({ has: page.locator("span", { hasText: term }) });
    await expect(item).toBeVisible();
    // A term with no definition sentence beside it is a heading, not an answer.
    await expect(item.locator("p")).not.toHaveText("");
  }

  // The one column whose definition names what it is not: an ordering aid,
  // never a verdict, and explicit about the minimum-sample floor beneath it.
  await expect(
    items.filter({ has: page.locator("span", { hasText: "Demand signal · derived" }) }),
  ).toContainText(/ordering aid and not a verdict/);

  // One control, not one per column: the retired per-column popovers stay retired.
  await expect(page.getByRole("button", { name: /What .* measures/ })).toHaveCount(0);
});

test("the column definitions are contained on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, "Petra Novák");
  await page.goto("/alpha/northgate/units");

  const button = page.getByRole("button", { name: "About how to read this register" });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const scope = page.locator("#info-register .ox-scope");
  await expect(scope).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow, "the register's definitions list overflows the 390px viewport").toBe(false);

  const results = await new AxeBuilder({ page })
    .include("#info-register .ox-scope")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

/*
 * R07-2 (FEJEZET1): the derived column prints a real time beside its named
 * reference. The time is the share's own numerator: the first row, the busiest
 * unit under the default sort, reads 100% beside the largest time, and every
 * other share is its printed time over that one, within a point of rounding.
 */
test("R07-2 · the derived column prints each unit's own looking time beside its share of the busiest unit", async ({
  page,
}) => {
  await signInAs(page, "Petra Novák");
  await page.goto("/alpha/northgate/units", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("columnheader", { name: "Demand signal · derived", exact: true }).first(),
  ).toBeVisible();
  const texts = await page.locator('main td[data-col="demand"] .ox-of').allTextContents();
  expect(texts.length, "the register has rows").toBeGreaterThan(0);
  const read = texts.map((text) => {
    const m = /^(?:(\d+)m (\d{2})s|(\d+)s) · (\d{1,3})% of the busiest unit$/.exec(text.trim());
    expect(m, `"${text}" prints a time and names its reference`).not.toBeNull();
    const seconds = m![3] !== undefined ? Number(m![3]) : Number(m![1]) * 60 + Number(m![2]);
    return { seconds, share: Number(m![4]) };
  });
  const peak = Math.max(...read.map((r) => r.seconds));
  expect(peak, "the busiest unit has measured time").toBeGreaterThan(0);
  expect(read[0], "row one is the reference: the busiest unit, at 100%").toEqual({ seconds: peak, share: 100 });
  for (const r of read) {
    expect(
      Math.abs(Math.round((r.seconds / peak) * 100) - r.share),
      "the share is taken from the printed time",
    ).toBeLessThanOrEqual(1);
  }
});
