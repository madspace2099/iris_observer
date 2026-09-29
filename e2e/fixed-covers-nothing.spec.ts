import { expect, test, type Page } from "@playwright/test";
import { signIn, signInAs } from "./sign-in";

/**
 * NOTHING FIXED COVERS ANYTHING A READER CAN REACH OR READ.
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
 * had. The claim is the general one, not the dock's: the box of no
 * `position: fixed` element intersects the box of a focusable element, or of
 * a leaf element with text, outside it. Not the dock by name, so a second
 * fixed thing cannot arrive unmeasured.
 *
 * Two shapes of the same claim. The roster, at four sizes and three scroll
 * positions for two viewers, against focusable elements: the measurement that
 * found the nine. And every surface, at three scroll positions, against
 * focusable elements and text: the claim that moved here from
 * `layout-integrity.spec.ts`, whose "the Ask dock covers nothing" measured the
 * dock's own box against the text at the end of eight surfaces and, with the
 * dock in flow, could no longer fail. What it claimed that the roster does not
 * is the other seven surfaces; that stands here, at three positions rather
 * than one, against any fixed element rather than the dock by name.
 *
 * One measured assertion per test, so a red run names the position, the
 * fixed element and what it covered.
 */

const ROSTER = "/alpha/northgate/agents";
const SIZES = [
  [1920, 1080],
  [1440, 900],
  [1440, 810],
  [1366, 768],
] as const;

/* The same list the moved guard kept: `storytelling` is a redirect to `features`. */
const SURFACES = [
  "project",
  "agents",
  "presentation",
  "units",
  "features",
  "meetings",
  "flow",
  "report",
] as const;

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"]';
/* Where the pages' claims are printed; a leaf with text inside one is a claim. */
const TEXT_ROOTS = ".iris-plane *, .iris-doors *, .ox-plane *";

/**
 * Every element whose box a fixed element's box intersects, at the current
 * scroll: focusable elements always, leaf text elements when asked.
 */
async function covered(page: Page, withText: boolean): Promise<string[]> {
  return page.evaluate(
    ({ focusable, textRoots, withText }) => {
      const box = (el: Element) => el.getBoundingClientRect();
      const label = (el: Element) => {
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
        const cls = typeof el.className === "string" ? el.className.split(" ")[0] : "";
        return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} «${text}»`;
      };
      const drawn = (el: Element) => {
        const b = box(el);
        return b.width > 0 && b.height > 0;
      };
      const fixed = [...document.querySelectorAll<HTMLElement>("*")].filter((el) => {
        const s = getComputedStyle(el);
        return s.position === "fixed" && s.display !== "none" && drawn(el);
      });
      const targets = new Set<Element>(
        [...document.querySelectorAll<HTMLElement>(focusable)].filter(drawn),
      );
      if (withText) {
        for (const el of document.querySelectorAll<HTMLElement>(textRoots)) {
          if (el.children.length > 0) continue;
          if ((el.textContent ?? "").trim().length === 0) continue;
          if (drawn(el)) targets.add(el);
        }
      }
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
    },
    { focusable: FOCUSABLE, textRoots: TEXT_ROOTS, withText },
  );
}

/** Top, middle and bottom of the document, at the current viewport height. */
async function positions(page: Page, height: number): Promise<readonly (readonly [string, number])[]> {
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  return [
    ["top", 0],
    ["middle", Math.max(0, Math.round((docHeight - height) / 2))],
    ["bottom", Math.max(0, docHeight - height)],
  ];
}

async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(150);
}

for (const viewer of ["Petra Novák", "MADSPACE Operations"] as const) {
  test(`no fixed element covers a focusable one on the roster, for ${viewer}`, async ({ page }) => {
    await signIn(page, viewer);
    const hits: string[] = [];

    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.goto(ROSTER, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);

      for (const [name, y] of await positions(page, height)) {
        await scrollTo(page, y);
        for (const hit of await covered(page, false)) hits.push(`${width}×${height} ${name}: ${hit}`);
      }
    }

    expect(hits, "a fixed element's box intersects a focusable element's").toEqual([]);
  });
}

test.describe("on every surface, nothing fixed covers a claim or a control", () => {
  for (const surface of SURFACES) {
    test(`clears the content on ${surface}`, async ({ page }) => {
      await signInAs(page, "Petra Novák");
      await page.goto(`/alpha/northgate/${surface}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const height = page.viewportSize()?.height ?? 900;
      const hits: string[] = [];

      for (const [name, y] of await positions(page, height)) {
        await scrollTo(page, y);
        for (const hit of await covered(page, true)) hits.push(`${name}: ${hit}`);
      }

      expect(hits, `a fixed element covers text or a control on ${surface}`).toEqual([]);
    });
  }
});
