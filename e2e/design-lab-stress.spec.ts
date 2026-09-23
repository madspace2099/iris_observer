import { expect, test, type Page } from "@playwright/test";
/*
 * `signIn`, not `signInAs`.
 *
 * The richer helper signs in AND opens a project, waiting for /showroom. These
 * specs navigate straight to a /design-lab route afterwards, so opening a
 * project buys nothing and costs a navigation that can — and did — land
 * somewhere else and time the test out. Signing in is the whole requirement.
 */
import { signIn } from "./sign-in";

/**
 * DOES THE DIRECTION STILL WORK AT FIFTY INSTALLATIONS?
 *
 * The review estate is four projects and ten sources. That is the truth, it is
 * what every founder screenshot shows, and it cannot answer the question a
 * portfolio raises: whether a grouped list still groups, whether a column still
 * holds a name nobody shortened, whether a phone still stacks in the right
 * order when there are fifty rows to stack.
 *
 * So this runs the same eighteen screens against `/design-lab/stress/...`,
 * which renders a fixture built in memory for the length of one request. It
 * writes nothing, seeds nothing, and is never captured — the package a founder
 * looks at contains no image from this route.
 *
 * ## Assertions, not pictures
 *
 * The brief asks for layout checks rather than another eighteen screenshots,
 * and it is right: a reviewer cannot tell from an image whether a state word
 * was clipped by two pixels or whether the DOM order matches the painted one.
 * Those are the two failures that actually happen at scale, so those are what
 * is measured.
 *
 * The clipped-word check is not hypothetical. Variant C's register set the
 * three readings as chips three across, and at ten rows "Awaiting first
 * heartbeat" rendered as "Awaiting first heartbe" — a truncated state on a
 * surface whose entire argument is that a state is a word rather than a colour.
 * It was caught by eye that time. This is so it is not caught by eye next time.
 *
 * ## It needs a development server
 *
 *   OBSERVER_BASE_URL=http://localhost:3310 pnpm exec playwright test design-lab-stress
 */

const VARIANTS = ["a", "b", "c"] as const;

const SCREENS = [
  "projects",
  "sources",
  "project-detail",
  "source-detail",
  "activation",
  "diagnostics",
] as const;

/** The two list screens are where fifty rows actually land. */
const LIST_SCREENS = ["projects", "sources"] as const;

type Variant = (typeof VARIANTS)[number];

const WIDTHS = [
  { width: 1440, height: 900, name: "1440" },
  { width: 1024, height: 900, name: "1024" },
  { width: 390, height: 844, name: "390" },
] as const;

async function open(page: Page, variant: Variant, screen: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`/design-lab/stress/${screen}/${variant}`);
  await expect(page.locator(`.dl${variant}-root`)).toBeVisible();
}

/**
 * Anything whose painted box is narrower than its own content.
 *
 * The first version of this flagged `scrollWidth > clientWidth` on anything
 * that did not scroll, and reported fifty findings on a screen that had been
 * reviewed and shipped. It was wrong: with `overflow: visible` — the default —
 * content that exceeds its box is PAINTED, not cut, and the only real symptom
 * is a page that scrolls sideways, which the check above already catches.
 *
 * What actually loses a reader a word is a box that clips: `overflow: hidden`
 * or `clip`, with or without an ellipsis. So that is what is measured, and a
 * check that reports what a person can see is worth more than one that reports
 * everything and is ignored.
 */
async function clipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const style = window.getComputedStyle(element);
      const clips = style.overflowX === "hidden" || style.overflowX === "clip";
      if (!clips) continue;
      /*
       * Visually hidden text is clipped ON PURPOSE.
       *
       * The in-cell labels that let a screen reader hear "Connected, 1 of 7"
       * are the standard 1px box with `clip-path: inset(50%)`, so they trip
       * every clipping heuristic ever written. Skipping them is not loosening
       * the check: their whole job is to be unreadable by eye.
       */
      if (style.clipPath !== "none" || element.clientWidth <= 24) continue;
      if (element.scrollWidth - element.clientWidth > 1) {
        const text = (element.textContent ?? "").trim().slice(0, 40);
        found.push(`${element.className || element.tagName.toLowerCase()}: "${text}"`);
      }
    }
    return found;
  });
}

test.describe("design lab under a portfolio-sized estate", () => {
  test("the fixture is the size the brief asks for", async ({ page }) => {
    test.skip(test.info().project.name !== "lab", "checked once");
    await signIn(page, "MADSPACE Operations");
    await open(page, "a", "projects", 1440, 900);

    const projects = await page.locator(".dla-row[data-shape='project']").count();
    expect(projects, "twelve projects").toBe(12);

    await open(page, "a", "sources", 1440, 900);
    const sources = await page.locator(".dla-row[data-shape='installation']").count();
    expect(sources, "fifty installations").toBe(50);
  });

  for (const variant of VARIANTS) {
    for (const screen of SCREENS) {
      test(`${variant}/${screen} holds together at every width`, async ({ page }) => {
        test.skip(test.info().project.name !== "lab", "checked once");
        await signIn(page, "MADSPACE Operations");

        for (const size of WIDTHS) {
          await open(page, variant, screen, size.width, size.height);

          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(
            overflow,
            `${variant}/${screen} at ${size.name}: page overflows by ${String(overflow)}px`,
          ).toBeLessThanOrEqual(1);

          /*
           * EVERY STATE WORD, WHOLE.
           *
           * The three readings are the product's central claim, so none of them
           * may be abbreviated at any width by any direction. Measured on the
           * element that holds the word rather than on its container, because a
           * container can be wide while the span inside it is clipped.
           */
          const truncated = await page.evaluate(() => {
            const words = [
              ...document.querySelectorAll<HTMLElement>(
                ".dla-triad-word span, .dlb-stateword, .dlc-readings dd span, .om-chip, .dlc-states dd",
              ),
            ];
            return words
              .filter((word) => {
                const style = window.getComputedStyle(word);
                /* Painted outside its box is not the same as cut off. */
                if (style.overflowX !== "hidden" && style.overflowX !== "clip") return false;
                return word.scrollWidth - word.clientWidth > 1 && word.clientWidth > 0;
              })
              .map((word) => (word.textContent ?? "").trim())
              .slice(0, 8);
          });
          expect(
            truncated,
            `${variant}/${screen} at ${size.name}: a state word is clipped`,
          ).toEqual([]);
        }
      });
    }

    test(`${variant}: a long name does not break either list`, async ({ page }) => {
      test.skip(test.info().project.name !== "lab", "checked once");
      await signIn(page, "MADSPACE Operations");

      for (const screen of LIST_SCREENS) {
        for (const size of WIDTHS) {
          await open(page, variant, screen, size.width, size.height);

          const overflowing = await clipped(page);
          expect(
            overflowing,
            `${variant}/${screen} at ${size.name}: content wider than its box`,
          ).toEqual([]);
        }
      }
    });

    /*
     * The two absences, side by side.
     *
     * The fixture holds one installation whose counters are null and one whose
     * counters are zero, which is the distinction this surface exists to keep:
     * a machine that has not told us its outbox is empty is not a machine with
     * an empty outbox. A direction that printed both as "0" would pass every
     * other check in this file.
     */
    test(`${variant}/sources: a missing measurement never renders as a zero`, async ({ page }) => {
      test.skip(test.info().project.name !== "lab", "checked once");
      await signIn(page, "MADSPACE Operations");
      await open(page, variant, "sources", 1440, 900);

      const body = (await page.locator("body").textContent()) ?? "";
      expect(body, `${variant}/sources: no absence is named`).toMatch(/Not reported|No heartbeat/);
      expect(body, `${variant}/sources: the fixture's zero row is missing`).toContain(
        "Zero measurement",
      );
    });

    /*
     * A project holding nothing still has to appear. The commonest way an
     * estate list lies is by listing only what has data in it.
     */
    test(`${variant}/projects: a project with no sources is still listed`, async ({ page }) => {
      test.skip(test.info().project.name !== "lab", "checked once");
      await signIn(page, "MADSPACE Operations");
      await open(page, variant, "projects", 1440, 900);

      const body = (await page.locator("body").textContent()) ?? "";
      expect(body, `${variant}/projects: the empty project is absent`).toContain("NORTHGATE YARD");
    });
  }
});
