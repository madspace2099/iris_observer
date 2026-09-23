import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * ONE AGENT'S PRINTED SUMMARY CARRIES WHAT THE SCREEN WITHHOLDS.
 *
 * The report page draws an agent's summary from the read model their own
 * screen draws, with the same components. What that has to mean on paper,
 * measured rather than read from source:
 *
 *   - below the floor, no rate stands without its shortfall beside it —
 *     Lucia Horváth holds fourteen of ISTER TOWER's meetings against a floor
 *     of twenty, and every percentage, median and mean of hers is printed
 *     with "14 of 20 meetings needed" in the same figure;
 *   - above the floor, every share names its denominator in words — Martin
 *     Kováč holds thirty-eight, and every percentage of his has an "of …"
 *     beside it, never a title attribute;
 *   - the agent's own screen offers the export, and the shareable page it
 *     links to is that agent's summary, not the project's report.
 *
 * A count is a count and stands alone with its denominator; what these
 * tests hold to the floor are the figures that would read as a verdict: a
 * percentage, a duration, a one-decimal mean.
 */

const ISTER = "/alpha/ister-tower";

/** A figure that would read as a verdict. Counts are integers and are not this. */
const RATE = /%$|^\d+m \d+s$|^\d+\.\d$/;

async function rates(page: Page): Promise<
  readonly { readonly text: string; readonly withShortfall: boolean; readonly qualified: boolean }[]
> {
  return page.evaluate((source) => {
    const rate = new RegExp(source);
    return [...document.querySelectorAll(".ox-figure")]
      .map((el) => ({
        text: el.textContent?.trim() ?? "",
        withShortfall: el.closest(".ox-insufficient") !== null,
        qualified: el.parentElement?.querySelector(":scope > .ox-of") !== null,
      }))
      .filter((figure) => rate.test(figure.text));
  }, RATE.source);
}

test("below the floor, no rate on the printed page stands without its shortfall", async ({
  page,
}) => {
  await signIn(page, "Petra Novák");
  await page.goto(`${ISTER}/report?agent=agt_luciahorvath`);
  const figures = await rates(page);
  const bare = figures.filter((f) => !f.withShortfall).map((f) => f.text);
  expect({ withShortfall: figures.length - bare.length > 0, bare }).toEqual({
    withShortfall: true,
    bare: [],
  });
});

test("above the floor, every share on the printed page names its denominator", async ({
  page,
}) => {
  await signIn(page, "Petra Novák");
  await page.goto(`${ISTER}/report?agent=agt_martinkovac`);
  const shares = (await rates(page)).filter((f) => /%$/.test(f.text));
  const unqualified = shares.filter((f) => !f.qualified).map((f) => f.text);
  expect({ shares: shares.length > 0, unqualified }).toEqual({ shares: true, unqualified: [] });
});

test("the agent's screen offers the export, and its shareable page is their own summary", async ({
  page,
}) => {
  await signIn(page, "Petra Novák");
  await page.goto(`${ISTER}/agents/agt_luciahorvath`);
  await page.getByRole("button", { name: "Export agent summary" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Format").selectOption("page");
  await expect(dialog.getByRole("link", { name: "Open the report page" })).toHaveAttribute(
    "href",
    `${ISTER}/report?agent=agt_luciahorvath`,
  );
});
