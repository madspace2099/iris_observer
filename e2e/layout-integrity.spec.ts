import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

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

/*
 * Every surface a reader can open under a project today, by the segment the
 * shell navigates to. `storytelling` is gone from the list because it is a
 * permanent redirect to `features` (ADR-0033): navigating to it mid-check
 * destroyed the evaluation context and failed every viewport for the wrong
 * reason. The report and the meeting summary joined the product on the
 * night of 2026-09-07 and are checked like the rest.
 */
const SURFACES = [
  "ask",
  "showroom",
  "flow",
  "project",
  "agents",
  "presentation",
  "units",
  "features",
  "meetings",
  "audience",
  "attention",
  "report",
] as const;


/**
 * Elements whose own box is narrower than their content.
 *
 * The visually-hidden pattern (a 1px box with `overflow: hidden`) is excluded
 * by design: it reports as clipped and is doing exactly what it should.
 * `.iris-sr`/`.obs-sr` are the legacy namespace's own name for it; `.ox-sr`
 * (`observer-product.css`) and `.ask-sr` (`ask-iris.css`) are the same
 * technique under the two current namespaces and were missing here, which is
 * why this check found "clipped" text on every ox-/ask- surface that uses
 * one — a gap in this test, not a defect in those surfaces. Anything that
 * scrolls on purpose is excluded too — a contained scroller is a decision,
 * not a defect.
 */
async function clippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const SR_ONLY = ["iris-sr", "obs-sr", "ox-sr", "ask-sr"];
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      if (el.closest(SR_ONLY.map((c) => `.${c}`).join(", "))) continue;
      if (SR_ONLY.some((c) => el.classList.contains(c))) continue;
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
        await page.goto(`/alpha/northgate/${surface}`, { waitUntil: "networkidle" });
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

      const row = page.locator(".ox-table tbody tr").first();
      await expect(row).toBeVisible();

      /*
       * Every column, always.
       *
       * The register is a real table now (`DataTable`), and the rule it
       * replaced a matrix to keep is the same: a narrow width may stack the
       * cells or scroll the table inside its own wrapper, but it never drops
       * a measurement. Nothing in the row may be `display: none`, and the
       * header's column count is the row's.
       */
      const header = await page.locator(".ox-table thead th").count();
      const cells = await row.evaluate((el) =>
        Array.from(el.children).filter((c) => getComputedStyle(c).display !== "none").length,
      );
      expect(header).toBeGreaterThanOrEqual(6);
      expect(cells, `only ${cells} of ${header} cells visible at ${vp.name}`).toBe(header);
    });
  }

  test("labels every figure once the header row is gone", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await signInAs(page, "Petra Novák");
    await page.goto("/alpha/northgate/units");
    // A stack of bare numbers is unreadable without the header it lost.
    for (const label of ["Meetings", "Views", "Shortlisted", "Unit"]) {
      await expect(page.locator(`.ox-table tbody td[data-label="${label}"]`).first()).toBeAttached();
    }
  });
});

test.describe("the Ask dock covers nothing", () => {
  /*
   * The Observer rail became the docked Ask IRIS composer (`.ask-dock`,
   * ADR-0033), fixed at the bottom of every project page but Ask IRIS
   * itself. The claim is the one the rail had: at the true end of the page
   * it covers no text. `storytelling` is a redirect to `features` and is
   * checked under that name; the report joined the list tonight.
   */
  for (const surface of ["project", "agents", "presentation", "units", "features", "meetings", "flow", "report"]) {
    test(`clears the content on ${surface}`, async ({ page }) => {
      await signInAs(page, "Petra Novák");
      await page.goto(`/alpha/northgate/${surface}`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(250);

      const overlaps = await page.evaluate(() => {
        const rail = document.querySelector(".ask-dock");
        if (rail === null) return 0;
        const r = rail.getBoundingClientRect();
        let hits = 0;
        for (const el of Array.from(
          document.querySelectorAll<HTMLElement>(".iris-plane *, .iris-doors *, .ox-plane *"),
        )) {
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

/*
 * "Observer holds still while it answers" measured the briefing's orb and
 * prompt (`.obs-console-orb`, `.obs-prompt`). ADR-0033 made Ask IRIS the
 * landing surface and the briefing a link on it; that composition and its
 * class names are gone, so the two tests could only wait out their budget.
 * The answer sheet's own layout is exercised by `ask-iris-compare.spec.ts`.
 */
