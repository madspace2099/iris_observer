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
 *     links to is that agent's summary, not the project's report;
 *   - its Generate document works: the PDF opens that page to print, and the
 *     CSV downloads that summary's figures (ADR-0045).
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

/*
 * "The Generate document button is locked" (the owner, 2026-10-20, ADR-0045).
 * It is a link in both formats that lacked one: the PDF opens the composed
 * page in a new tab asking for the print dialog, and the CSV downloads from
 * the route beside the page, named for the agent, in the language chosen.
 */
test("Generate document opens the PDF to print and downloads the figures as CSV", async ({
  page,
}) => {
  await signIn(page, "Petra Novák");
  await page.goto(`${ISTER}/agents/agt_luciahorvath`);
  await page.getByRole("button", { name: "Export agent summary" }).click();
  const dialog = page.getByRole("dialog");
  const generate = dialog.getByRole("link", { name: "Generate document" });

  await dialog.getByLabel("Format").selectOption("pdf");
  await expect(generate).toHaveAttribute("href", `${ISTER}/report?agent=agt_luciahorvath&print=1`);
  await expect(generate).toHaveAttribute("target", "_blank");
  await expect(generate).not.toHaveAttribute("aria-disabled", "true");
  await expect(dialog).toContainText("Save as PDF");

  await dialog.getByRole("button", { name: "Magyar" }).click();
  await dialog.getByLabel("Format").selectOption("csv");
  const href = `${ISTER}/report/csv?agent=agt_luciahorvath&lang=hu`;
  await expect(generate).toHaveAttribute("href", href);
  await expect(generate).toHaveAttribute("download", "");

  const response = await page.request.get(href);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("text/csv; charset=utf-8");
  expect(response.headers()["content-disposition"]).toBe(
    'attachment; filename="ister-tower_lucia-horvath_quarter-to-date_hu.csv"',
  );
  expect((await response.body()).subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
});

/*
 * `?print=1` asks for the print dialog once. The router keeps a page's tree
 * for back and forward, so `PrintPage` reads the request from the address,
 * which has lost the parameter by the time the reader comes back.
 */
test("the PDF's print request is asked once, and not again on a return to the page", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const counted = window as unknown as { printed: number };
    counted.printed = 0;
    window.print = () => {
      counted.printed += 1;
    };
  });
  const printed = () => page.evaluate(() => (window as unknown as { printed: number }).printed);
  /* The page's effect waits for the fonts, then a task: so must the check that it did not fire. */
  const settled = () =>
    page.evaluate(() =>
      document.fonts.ready.then(() => new Promise((resolve) => setTimeout(resolve, 0))),
    );

  await signIn(page, "Petra Novák");
  await page.goto(`${ISTER}/report?agent=agt_luciahorvath&print=1`);
  await expect.poll(printed).toBe(1);
  await expect(page).not.toHaveURL(/print=1/);

  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Sales Agents" }).click();
  await page.waitForURL(/\/agents(\?|$)/);
  await page.goBack();
  await page.waitForURL(/\/report\?agent=agt_luciahorvath$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await settled();
  expect(await printed()).toBe(1);
});
