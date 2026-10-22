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
 *
 * Since ADR-0056 the room types stand side by side: the parity scale, the
 * scatter and the one-segment band are gone, and their sets are said by the
 * blocks that replaced them.
 */

const PROJECT = "/alpha/northgate/project";
const SHARE = "(?:<1%|\\d+%)";

async function open(page: Page): Promise<void> {
  await signInAs(page, "Petra Novák");
  await page.goto(PROJECT, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
}

test("each flat type prints its flats and its share of the stock", async ({ page }) => {
  await open(page);
  const rows = await page.locator(".pr-rows .pr-type").allInnerTexts();
  expect(rows.length, "no flat type drawn").toBeGreaterThan(0);
  const bare = rows.filter(
    (text) => !new RegExp(`\\d+ flats? · ${SHARE} of the stock`).test(text),
  );
  expect(bare, "a type without its flats or its share of the stock").toEqual([]);
});

test("the interest shares print the meetings they are of", async ({ page }) => {
  await open(page);
  await expect(
    page.locator(".pr-rooms-set"),
    "an interest share with no set of meetings",
  ).toContainText(/\d+ meetings? in (the last \d+ days|all time)/, { useInnerText: true });
});

test("the side-by-side columns print the openings every rate is of", async ({ page }) => {
  await open(page);
  const heads = await page
    .locator('.pr-grid-head [role="columnheader"]:not(.pr-grid-corner)')
    .allInnerTexts();
  expect(heads.length, "no room type column drawn").toBeGreaterThan(1);
  const bare = heads.filter((text) => !/\d+ openings?/.test(text));
  expect(bare, "a column of rates without its openings").toEqual([]);
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

test("the attention index says what it is a multiple of, and each reading its sample", async ({
  page,
}) => {
  /*
   * The index is read off the readings since ADR-0056: the column head says
   * what the multiple is against, and every type says how many meetings
   * opened it, the sample its reading stands on.
   */
  await open(page);
  await expect(page.locator(".pr-read-head"), "an index drawn as a bare multiple").toContainText(
    "against its share of the stock",
    { useInnerText: true },
  );
  const samples = await page.locator(".pr-read-type small").allInnerTexts();
  expect(samples.length, "no reading drawn").toBeGreaterThan(0);
  const bare = samples.filter((text) => !/\d+ meetings? opened one/.test(text));
  expect(bare, "a reading without its sample").toEqual([]);
});

test("the journey's title states the presentations every band is of", async ({ page }) => {
  await open(page);
  await expect(page.locator(".pr-path-card h2")).toHaveText(/^How far \d+ presentations? got$/);
  const bands = await page.locator(".pr-path-say").allInnerTexts();
  expect(bands.length, "no band drawn").toBeGreaterThan(1);
  const bare = bands.filter((text) => !/^\d+ \p{L}/u.test(text));
  expect(bare, "a band with a bare count").toEqual([]);
});
