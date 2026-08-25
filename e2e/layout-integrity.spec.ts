import { expect, test, type Page } from "@playwright/test";

/**
 * Layout integrity, measured rather than looked at.
 *
 * Every assertion here corresponds to a defect that shipped to production and
 * that the accessibility suite passed cleanly through: text clipped mid-word,
 * a table running under an adjacent panel, a floating rail covering the last
 * row of every surface, an orb that jumped half a screen when it answered, and
 * a header that gave the document a horizontal scrollbar.
 *
 * axe cannot see any of that. Geometry can.
 */

const VIEWPORTS = [
  { name: "1920", width: 1920, height: 1080 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1366", width: 1366, height: 768 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "393", width: 393, height: 852 },
] as const;

const SURFACES = [
  "showroom",
  "flow",
  "project",
  "agents",
  "presentation",
  "units",
  "storytelling",
  "meetings",
] as const;

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(`Continue as ${name}`) }).click();
  await page.waitForURL(/\/(showroom|overview)/);
}

/**
 * Elements whose own box is narrower than their content.
 *
 * `.iris-sr` is excluded by design: the visually-hidden pattern is a 1px box
 * with `overflow: hidden`, so it reports as clipped and is doing exactly what
 * it should. Anything that scrolls on purpose is excluded too — a contained
 * scroller is a decision, not a defect.
 */
async function clippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      if (el.closest(".iris-sr, .obs-sr")) continue;
      if (el.classList.contains("iris-sr") || el.classList.contains("obs-sr")) continue;
      /*
       * HTML only.
       *
       * SVG has its own overflow model and reports `scrollWidth` against the
       * viewBox rather than the rendered glyph, so a chart label inside a
       * `preserveAspectRatio` box looks clipped when it is not. SVG text is
       * checked by reading the review screenshots instead.
       */
      if (el.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
      if (el.clientWidth === 0) continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;

      const cs = getComputedStyle(el);

      /*
       * Only boxes that actually clip.
       *
       * `overflow: visible` cannot hide anything by definition — content
       * outside the box is still painted. Such an element reports
       * `scrollWidth > clientWidth` whenever it has an absolutely positioned
       * pseudo-element, which is how a 16px icon with a 44px hit area looks
       * exactly like clipped text to a naive check.
       */
      if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") continue;

      /*
       * An ellipsis is a designed truncation, not a defect — but only if the
       * full value stays reachable. Clipping mid-word with no ellipsis and no
       * title is the failure: the reader cannot tell there is more, and cannot
       * get to it.
       */
      if (cs.textOverflow === "ellipsis" && el.title.length > 0) continue;

      // Only leaves: a container reports its child's overflow as its own.
      if (el.children.length > 0) continue;
      const text = (el.textContent ?? "").trim();
      if (text.length > 0) {
        const why = cs.textOverflow === "ellipsis" ? "ellipsis without a title" : "hard clip";
        bad.push(`${el.className || el.tagName} (${why}): ${text.slice(0, 40)}`);
      }
    }
    return bad;
  });
}

test.describe("no surface clips its own text or widens the page", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signInAs(page, "Petra Novák");

      for (const surface of SURFACES) {
        await page.goto(`/alpha/northgate/${surface}`);
        await page.waitForTimeout(200);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${surface} at ${vp.name} widens the document by ${overflow}px`).toBeLessThanOrEqual(1);

        const clipped = await clippedText(page);
        expect(clipped, `${surface} at ${vp.name} clips: ${clipped.join(" | ")}`).toEqual([]);
      }
    });
  }
});

test.describe("every metric stays reachable", () => {
  for (const vp of VIEWPORTS) {
    test(`Unit Attention keeps all six columns at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signInAs(page, "Petra Novák");
      await page.goto("/alpha/northgate/units");

      const row = page.locator(".iris-matrix-row").first();
      await expect(row).toBeVisible();

      /*
       * Six cells, always.
       *
       * The narrow layout used to drop Shortlisted and Trend with an
       * `nth-child(n + 5) { display: none }`, taking two measurements away from
       * the reader most likely to be on a laptop and offering no way back to
       * them.
       */
      const cells = await row.evaluate((el) =>
        Array.from(el.children).filter((c) => getComputedStyle(c).display !== "none").length,
      );
      expect(cells, `only ${cells} cells visible at ${vp.name}`).toBe(6);
    });
  }

  test("labels every figure once the header row is gone", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/units");
    // A stack of bare numbers is unreadable without the header it lost.
    for (const label of ["Meetings", "Typical look", "Shortlisted", "Trend"]) {
      await expect(page.locator(`.iris-matrix-row [data-label="${label}"]`).first()).toBeAttached();
    }
  });
});

test.describe("the Observer rail covers nothing", () => {
  for (const surface of ["project", "agents", "presentation", "units", "storytelling", "meetings"]) {
    test(`clears the content on ${surface}`, async ({ page }) => {
      await signInAs(page, "Petra Novák");
      await page.goto(`/alpha/northgate/${surface}`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(250);

      const overlaps = await page.evaluate(() => {
        const rail = document.querySelector(".obs-rail");
        if (rail === null) return 0;
        const r = rail.getBoundingClientRect();
        let hits = 0;
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(".iris-plane *, .iris-doors *"))) {
          if (el.children.length > 0) continue;
          if ((el.textContent ?? "").trim().length === 0) continue;
          const b = el.getBoundingClientRect();
          if (b.height === 0) continue;
          if (b.bottom > r.top && b.top < r.bottom && b.right > r.left && b.left < r.right) hits += 1;
        }
        return hits;
      });

      expect(overlaps, `the rail covers ${overlaps} elements on ${surface}`).toBe(0);
    });
  }
});

test.describe("Observer holds still while it answers", () => {
  /*
   * Waits for an answer, and refuses to accept anything else.
   *
   * Both tests below used to fill the box, wait six seconds and measure. On a
   * deployment where every question was being refused, nothing rendered, the
   * orb sat perfectly still, and they passed — proving that a thing which never
   * happened did not move the layout.
   *
   * `.obs-answer-role` carrying "Observer's reading" exists only on a rendered
   * answer. A refusal renders one sentence and an "Ask again" control, and has
   * no such label, so waiting for it is waiting for the real thing.
   */
  async function askAndAwaitAnswer(page: Page, question: string) {
    await page.getByPlaceholder(/^Ask Observer about/).fill(question);
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    const reading = page.locator(".obs-answer-role", { hasText: /Observer.s reading/ }).first();
    // A cold lambda plus a reasoning model is not quick, and the point of this
    // test is what happens once the answer is actually there.
    await expect(reading, "no answer rendered — the layout assertion would be vacuous").toBeVisible({
      timeout: 90_000,
    });
    // Let the expansion settle before measuring where things ended up.
    await page.waitForTimeout(400);
  }

  test("the orb does not move when an answer arrives", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.waitForTimeout(700);

    const orb = page.locator(".obs-console-orb");
    const before = await orb.boundingBox();
    expect(before, "the orb was not on the page to begin with").not.toBeNull();

    await askAndAwaitAnswer(page, "What changed this month?");

    const after = await orb.boundingBox();
    const moved = Math.abs((after?.y ?? 0) - (before?.y ?? 0));

    /*
     * A few pixels, not half a screen.
     *
     * The console centred its two columns, so expanding the answer re-centred
     * the grid and slid the orb down the page — a presence that lurches when it
     * starts speaking does not read as one.
     */
    expect(
      moved,
      `the orb moved ${moved}px: y ${Math.round(before?.y ?? 0)} before, ${Math.round(after?.y ?? 0)} after a rendered answer`,
    ).toBeLessThanOrEqual(4);
  });

  test("the prompt does not move either", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.waitForTimeout(700);

    const prompt = page.locator(".obs-prompt");
    const before = await prompt.boundingBox();
    expect(before, "the prompt was not on the page to begin with").not.toBeNull();

    await askAndAwaitAnswer(page, "Compare the sales agents");

    const after = await prompt.boundingBox();
    const moved = Math.abs((after?.y ?? 0) - (before?.y ?? 0));

    expect(
      moved,
      `the prompt moved ${moved}px: y ${Math.round(before?.y ?? 0)} before, ${Math.round(after?.y ?? 0)} after a rendered answer`,
    ).toBeLessThanOrEqual(4);
  });
});
