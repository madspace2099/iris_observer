import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The context switchers, as a reader operates them.
 *
 * They were native `<select>` elements until 2026-09-18, and every case here
 * used to drive them with `selectOption` — which sets a value, fires a change
 * event, and touches none of the machinery a person does. They are menus of
 * links now (`ContextSwitcher.tsx`), so the cases press the control, read the
 * list, and follow a row: the same three gestures, and all three now real.
 *
 * `summary[aria-label=…]` rather than a role query, because the same switcher
 * is rendered twice in the shell — once in the analytical band and once inside
 * the phone sheet — and a role query matches both at every width. Callers that
 * care which one they have pass a scope.
 */
export function switcherButton(page: Page, label: string, scope = ""): Locator {
  return page.locator(`${scope} summary[aria-label="${label}"]`.trim());
}

/** Press the control and hand back its open panel. */
export async function openSwitcher(page: Page, label: string, scope = ""): Promise<Locator> {
  await switcherButton(page, label, scope).click();
  const panel = page.locator(".ox-menu[open] .ox-menu-panel");
  await expect(panel).toBeVisible();
  return panel;
}

/** Press the control and follow one of its rows. */
export async function chooseInSwitcher(
  page: Page,
  label: string,
  row: string | RegExp,
  scope = "",
): Promise<void> {
  const panel = await openSwitcher(page, label, scope);
  await panel.locator(".ox-menu-row", { hasText: row }).click();
}

/**
 * What the closed control says it is showing.
 *
 * The period cases assert against the preset in the URL, and the button shows
 * the preset's LABEL — so the two are mapped here, once, rather than in five
 * places. A label renamed in the product without this list following it breaks
 * these cases loudly, which is the point.
 */
export const PERIOD_LABEL: Readonly<Record<string, string>> = {
  quarter_to_date: "Quarter to date",
  last_28_days: "Last 28 days",
  last_quarter: "Last completed quarter",
  year_to_date: "Year to date",
};

export async function expectPeriod(page: Page, preset: string): Promise<void> {
  await expect(switcherButton(page, "Period", ".ox-context")).toHaveText(PERIOD_LABEL[preset] ?? preset);
}
