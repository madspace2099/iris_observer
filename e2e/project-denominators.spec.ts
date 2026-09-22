import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * EVERY FIGURE ON THE PROJECT PAGE SAYS, ON SCREEN, WHAT IT IS A SHARE OF.
 *
 * The repository's first-page rule — no metric without a denominator — is
 * about what the reader sees. This guard used to stand on a file: it read
 * `components/project/SegmentDetail.tsx` from disk and asserted the rule on a
 * component nothing renders, and stayed green while the live page carried an
 * index whose two shares lived in a tooltip on an empty element, five rates
 * whose set was a tooltip, and two counts with no set at all. A denominator
 * that lives only in a `title` attribute is not stated.
 *
 * So the guard stands where the reader stands: on the rendered page, reading
 * `innerText`, which carries what is visible — the register's head is
 * uppercase on screen, so it is uppercase here — and never an attribute. One
 * measured assertion per test, so a red run names the figure.
 */

const PROJECT = "/alpha/northgate/project?segment=rooms-2";
const SHARE = "(?:<1%|\\d+%)";

async function open(page: Page): Promise<void> {
  await signInAs(page, "Petra Novák");
  await page.goto(PROJECT, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
}

test("the parity scale prints, beside each index, the two shares it is a quotient of", async ({
  page,
}) => {
  await open(page);
  const rows = await page.locator(".iris-parity-row").allInnerTexts();
  const bare = rows.filter(
    (text) => !new RegExp(`${SHARE} of looking time on ${SHARE} of stock`).test(text),
  );
  expect(bare, "an index with its shares in a tooltip, or nowhere").toEqual([]);
});

test("the paired rates print what set the rates are of", async ({ page }) => {
  await open(page);
  await expect(
    page.locator(".iris-band .iris-paired").first(),
    "five rates with their set in a tooltip",
  ).toContainText(
    /of the unit openings in these meetings: \d+ openings of .+ units on the left, \d+ of other units on the right/,
    { useInnerText: true },
  );
});

test("the search register says what a count of applications is of", async ({ page }) => {
  await open(page);
  await expect(
    page.locator('.iris-matrix[data-columns="demand"] .iris-matrix-head'),
    "a bare count of times applied",
  ).toContainText(/times applied, of \d+ presentations/i, { useInnerText: true });
});

test("the search register says what a count of matching units is of", async ({ page }) => {
  await open(page);
  await expect(
    page.locator('.iris-matrix[data-columns="demand"] .iris-matrix-head'),
    "a bare count of units matching",
  ).toContainText(/units matching, of \d+ available/i, { useInnerText: true });
});

test("the attention index says what it is a multiple of, everywhere it is drawn", async ({
  page,
}) => {
  /*
   * The claim that moved here from the file-reading guard, which matched a
   * regex against `charts.tsx`'s source. Read off the rendered matrix instead:
   * every placed segment, and every withheld one.
   */
  await open(page);
  const rows = await page.locator(".iris-quad-segments li, .iris-quad-withheld li").allInnerTexts();
  const bare = rows.filter((text) => !/× attention for its share of\s+stock/.test(text));
  expect(bare, "an index drawn as a bare multiple").toEqual([]);
});
