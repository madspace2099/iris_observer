import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * THE SEARCH REGISTER'S SETS ARE ON THE PHONE TOO.
 *
 * Below 30rem the register's head is hidden and each row becomes a record:
 * every count cell prints its own `data-label` in front of the number. The
 * head had learnt to carry the sets - "Times applied, of 74 presentations",
 * "Units matching, of 36 available now" - and the cells' labels were still the
 * old short words, so on a phone a count stood without its set: the defect
 * the desktop had just lost, in the view nobody had photographed.
 *
 * One source, two views: the page builds each head's words once and the
 * cell's `data-label` is that same string. The label is painted by CSS
 * (`content: attr(data-label)` on `::before`), so it is not in `innerText`;
 * the assertion reads the pseudo-element's computed `content` on the rendered
 * page, which is what is on screen at this width. Only the mobile project
 * renders the record layout.
 */

test("a count on the phone's register carries its set", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the record layout exists only below 30rem");
  await signInAs(page, "Petra Novák");
  await page.goto("/alpha/northgate/project?segment=rooms-2", { waitUntil: "networkidle" });

  const painted = await page.evaluate(() => {
    const cell = document.querySelector(
      '.iris-matrix[data-columns="demand"] .iris-matrix-row > :nth-child(3)',
    );
    if (cell === null) return null;
    const label = getComputedStyle(cell, "::before").content;
    return { label, wide: cell.scrollWidth > cell.clientWidth + 1 };
  });

  expect(
    painted?.label,
    "the phone prints the count under the old short word, without its set",
  ).toMatch(/Times applied, of \d+ presentations/);
});
