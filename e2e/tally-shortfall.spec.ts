import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * A shortfall sentence wraps where it stands.
 *
 * `Figure` prints a below-the-floor metric as its raw figure and a shortfall
 * sentence beside it. `.ox-shortfall` was `white-space: nowrap`, written for
 * the short form ("12 of 20 needed") on a sheet row; inside a tally cell the
 * read model's sentence — "Fewer than 20 meetings for this agent — shown as a
 * raw figure, not as a verdict" — could not wrap, and on the agent page three
 * of them ran across their cells into one unreadable line. A withholding the
 * reader cannot read was never made: the same defect as the workload list's
 * truncated sub line.
 *
 * Measured on the rendered page, not on the stylesheet: every shortfall inside
 * a tally cell ends inside that cell. Dropping the wrapping rule turns this
 * red; a test on the CSS text would not know whether the rule took.
 */
test("a shortfall sentence ends inside its tally cell", async ({ page }) => {
  await signIn(page, "MADSPACE Operations");
  /* Monika holds 19 meetings on this fixture: every rate on the page is under the floor. */
  await page.goto("/alpha/northgate/agents/agt_monika");
  await page.evaluate(() => document.fonts.ready);

  const measured = await page.evaluate(() => {
    const cells = [...document.querySelectorAll(".ox-tally-item")];
    const shortfalls = cells.flatMap((cell) =>
      [...cell.querySelectorAll(".ox-shortfall")].map((s) => ({ cell, s })),
    );
    if (shortfalls.length === 0) {
      throw new Error("no shortfall sentence inside any tally cell: the page measures nothing");
    }
    return shortfalls
      .map(({ cell, s }) => {
        const past = s.getBoundingClientRect().right - cell.getBoundingClientRect().right;
        return { text: (s.textContent ?? "").trim(), past: Math.round(past) };
      })
      .filter((m) => m.past > 0);
  });

  expect(measured, "a shortfall sentence runs past its cell, into the next").toEqual([]);
});
