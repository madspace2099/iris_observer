import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * NOTHING FIXED COVERS ANYTHING A READER CAN REACH.
 *
 * The rule has been stated twice about the docked Ask IRIS composer — "it
 * covers no claim", then "no focusable element sits under it" — and twice it
 * rotted, because a bar fixed to the foot of the viewport over a scrolling
 * document covers something at some scroll position whatever its size. The
 * last measurement of the roster, twenty-four positions with `elementFromPoint`,
 * found a focusable link under the bar in nine of them: "Agent detail →" at
 * the top of the page at 1440×900 and 1440×810, the workload list's names in
 * the middle at 1440×900, 1440×810 and 1366×768.
 *
 * The dock now stands in the flow of the document, at the end of `<main>`, so
 * the rule is true by construction — and this is its guard, which it never
 * had. The claim is the general one, not the dock's: on the roster, at four
 * sizes and three scroll positions, for two viewers, the box of no
 * `position: fixed` element intersects the box of a focusable element outside
 * it. Not the dock by name, so a second fixed thing cannot arrive unmeasured.
 *
 * One measured assertion per viewer, so a red run names the position, the
 * fixed element and what it covered.
 */

const ROSTER = "/alpha/northgate/agents";
const SIZES = [
  [1920, 1080],
  [1440, 900],
  [1440, 810],
  [1366, 768],
] as const;

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"]';

/** Every focusable element whose box a fixed element's box intersects, at the current scroll. */
async function covered(page: Page): Promise<string[]> {
  return page.evaluate((focusable) => {
    const box = (el: Element) => el.getBoundingClientRect();
    const label = (el: Element) => {
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
      const cls = typeof el.className === "string" ? el.className.split(" ")[0] : "";
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} «${text}»`;
    };
    const fixed = [...document.querySelectorAll<HTMLElement>("*")].filter((el) => {
      const s = getComputedStyle(el);
      if (s.position !== "fixed" || s.display === "none") return false;
      const b = box(el);
      return b.width > 0 && b.height > 0;
    });
    const targets = [...document.querySelectorAll<HTMLElement>(focusable)].filter((el) => {
      const b = box(el);
      return b.width > 0 && b.height > 0;
    });
    const hits: string[] = [];
    for (const f of fixed) {
      const a = box(f);
      for (const t of targets) {
        if (f.contains(t)) continue;
        const b = box(t);
        if (b.bottom > a.top && b.top < a.bottom && b.right > a.left && b.left < a.right) {
          hits.push(`${label(f)} over ${label(t)}`);
        }
      }
    }
    return hits;
  }, FOCUSABLE);
}

for (const viewer of ["Petra Novák", "MADSPACE Operations"] as const) {
  test(`no fixed element covers a focusable one on the roster, for ${viewer}`, async ({ page }) => {
    await signIn(page, viewer);
    const hits: string[] = [];

    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.goto(ROSTER, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);

      const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const positions = [
        ["top", 0],
        ["middle", Math.max(0, Math.round((docHeight - height) / 2))],
        ["bottom", Math.max(0, docHeight - height)],
      ] as const;

      for (const [name, y] of positions) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(150);
        for (const hit of await covered(page)) hits.push(`${width}×${height} ${name}: ${hit}`);
      }
    }

    expect(hits, "a fixed element's box intersects a focusable element's").toEqual([]);
  });
}
