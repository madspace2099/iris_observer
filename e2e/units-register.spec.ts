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
 * hand-rolling a second table." The current register has thirteen real
 * columns (Unit, Status, Rooms, Floor, Area m², Price, Meetings, Views,
 * Shortlisted, Plans opened, Comparisons, Demand · derived, Verified
 * outcome) and a static "How to read this register" list beneath the table
 * that defines every measured one — always present, so a reader (and a
 * screen reader) never has to find and activate a control to read it, which
 * is a stronger claim than the popover it replaced, not a weaker one.
 *
 * This file protects the actual current requirement — every measured column
 * has its definition stated, reachable without any interaction, contained on
 * a phone — rather than the retired popover. Moved to its own file because
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
  "Demand · derived",
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
  "Demand · derived",
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
   * The definitions list beneath the table. The page carries a second,
   * unrelated `.ox-scope` list above the seam (the "high interest, no
   * follow-up recorded" finding), so scoped to the one paper plate the page
   * has — the register's own ground (ADR-0034) — rather than by text, which
   * a plain CSS engine (axe's `.include()`, used below) cannot match.
   */
  const scope = page.locator(".ox-plate.ox-paper .ox-scope");
  await expect(scope).toBeVisible();

  /*
   * At least the fixed set of column definitions, never fewer. The list can
   * carry one more: "Not opened", present only when `neverOpened > 0` for the
   * period (Northgate has it in the reference period; a project where every
   * unit was opened, like Ister Tower today, does not) — a real data-driven
   * item, not a fixed column, so it is not asserted by name here.
   */
  const items = scope.locator("li.ox-scope-item");
  expect(await items.count()).toBeGreaterThanOrEqual(DEFINED_COLUMNS.length);

  for (const term of DEFINED_COLUMNS) {
    const item = items.filter({ has: page.locator("span", { hasText: term }) });
    await expect(item).toBeVisible();
    // A term with no definition sentence beside it is a heading, not an answer.
    await expect(item.locator("p")).not.toHaveText("");
  }

  // The one column whose definition names what it is not: an ordering aid,
  // never a verdict, and explicit about the minimum-sample floor beneath it.
  await expect(
    items.filter({ has: page.locator("span", { hasText: "Demand · derived" }) }),
  ).toContainText(/ordering aid and not a verdict/);

  // Reachable with no interaction at all: no button, no expanded/collapsed
  // state — the definitions are always in the document, which a screen
  // reader reaches by reading order rather than by finding a control first.
  await expect(page.getByRole("button", { name: /What .* measures/ })).toHaveCount(0);
});

test("the column definitions are contained on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, "Petra Novák");
  await page.goto("/alpha/northgate/units");

  const scope = page.locator(".ox-plate.ox-paper .ox-scope");
  await scope.scrollIntoViewIfNeeded();
  await expect(scope).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow, "the register's definitions list overflows the 390px viewport").toBe(false);

  const results = await new AxeBuilder({ page })
    .include(".ox-plate.ox-paper .ox-scope")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
