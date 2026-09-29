import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * The comparison leads when the planes stack.
 *
 * Under the 90rem breakpoint Presentation DNA is one column, and the order of
 * the two planes is the narrative: the comparison — two lanes, what differs,
 * the sample — before the material it is read against. Measured live before
 * this: the first "What differs" row sat 1,715px into the document, 950px of
 * scroll at 1440×900. Side by side the order is not a narrative and the lanes
 * keep the left.
 *
 * These assert the ORDER, not pixels: where each plane stands in the
 * document, and which comes first on the page. One measured assertion per
 * test, so a mutation is read by which one fails.
 */

const ROUTE = "/alpha/northgate/presentation?mode=cohorts";

test.describe("the comparison leads when the planes stack", () => {
  test("in one column, the comparison stands before the lanes in the document", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, "Petra Novák");
    await page.goto(ROUTE);
    await expect(page.locator("aside.iris-plane")).toBeVisible();

    const asideFirst = await page.evaluate(() => {
      const aside = document.querySelector("aside.iris-plane");
      const lanes = document.querySelector("section.iris-plane .iris-dna");
      if (!aside || !lanes) return null;
      /* FOLLOWING: the lanes come after the aside in document order. */
      return (aside.compareDocumentPosition(lanes) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(asideFirst, "in one column the lanes come before the comparison").toBe(true);
  });

  test("in one column, the comparison is drawn before the lanes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, "Petra Novák");
    await page.goto(ROUTE);
    const aside = await page.locator("aside.iris-plane").boundingBox();
    const lanes = await page.locator("section.iris-plane .iris-dna").first().boundingBox();
    expect(
      aside !== null && lanes !== null && aside.y + aside.height <= lanes.y,
      "the comparison is drawn under the lanes, whatever the document says",
    ).toBe(true);
  });

  test("in two columns, the lanes keep the left and the comparison the right", async ({
    page,
  }) => {
    /* Not a requirement of order: side by side, the composition stays as it was. */
    await page.setViewportSize({ width: 1920, height: 1080 });
    await signInAs(page, "Petra Novák");
    await page.goto(ROUTE);
    const plane = await page.locator("section.iris-plane").boundingBox();
    const aside = await page.locator("aside.iris-plane").boundingBox();
    expect(
      plane !== null && aside !== null && plane.x < aside.x && Math.abs(plane.y - aside.y) < 2,
      "the two planes are not side by side with the lanes on the left",
    ).toBe(true);
  });
});
