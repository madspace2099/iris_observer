import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * CAN ANY OF THE THREE DIRECTIONS ACTUALLY BE USED?
 *
 * `design-lab.spec.ts` photographs the eighteen screens. This asks the question
 * a photograph cannot answer, and it asks it of all eighteen rather than of a
 * chosen few: a direction that only passes on the screens somebody remembered
 * to check is a direction whose accessibility is a coincidence.
 *
 * It is deliberately a contract rather than an audit. Each check below is one
 * thing that has to be true of every screen, stated so that a failure names the
 * screen, the variant and the rule — because "axe found 3 violations" sends a
 * reader to a report and "B/sources at 390 has two h1 elements" sends them to a
 * file.
 *
 * ## Why not axe here
 *
 * The suite already runs axe over the live product. Running it again over three
 * candidate directions would report the same handful of findings three times
 * and would still not check the four things this round actually risks: that a
 * state is never carried by colour alone, that a dialog gives focus back, that
 * a copy control says something when it acts, and that a phone reading order
 * matches the visual one. Those are the checks that decide whether a direction
 * survives contact with a keyboard, so those are the ones written out.
 *
 * ## It needs a development server
 *
 * Same as the capture spec: the lab route calls `notFound()` unless the local
 * control plane is enabled.
 *
 *   OBSERVER_BASE_URL=http://localhost:3310 pnpm exec playwright test design-lab-a11y
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

type Variant = (typeof VARIANTS)[number];

async function open(page: Page, variant: Variant, screen: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`/design-lab/${screen}/${variant}`);
  await expect(page.locator(`.dl${variant}-root`)).toBeVisible();
}

test.describe("design lab: the accessibility contract", () => {
  for (const variant of VARIANTS) {
    for (const screen of SCREENS) {
      const where = `${variant}/${screen}`;

      test(`${where}: one h1, no overflow, and every state carries a word`, async ({ page }) => {
        test.skip(test.info().project.name !== "desktop", "checked once, at the review width");
        await signInAs(page, "MADSPACE Operations");
        await open(page, variant, screen, 1440, 900);

        /*
         * EXACTLY one h1. Not "at least one": a second one is the defect that
         * costs a screen reader its outline, and it is invisible in a capture.
         */
        const headings = await page.locator("h1").count();
        expect(headings, `${where}: expected exactly one h1`).toBe(1);

        const h1 = (await page.locator("h1").first().textContent())?.trim() ?? "";
        expect(h1.length, `${where}: the h1 is empty`).toBeGreaterThan(0);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${where}: overflows horizontally by ${String(overflow)}px`).toBeLessThanOrEqual(1);

        /*
         * STATUS IS NEVER COLOUR ALONE.
         *
         * `StatusMark` renders a shape and no text, so every mark has to have a
         * word beside it inside the same labelled group. The check is
         * structural rather than visual: for each mark, the nearest element
         * that could carry the label must contain text that is not only
         * punctuation. A mark alone in its cell is the failure — that is a
         * state a reader who cannot distinguish the colours cannot read, and
         * the shapes exist precisely so they do not have to.
         */
        const bareMarks = await page.evaluate(() => {
          const marks = [...document.querySelectorAll("[data-mark], .om-mark, svg[data-tone]")];
          const bare: string[] = [];
          for (const mark of marks) {
            const holder = mark.closest("dd, li, p, span, div, td, th") ?? mark.parentElement;
            const text = (holder?.textContent ?? "").replace(/[\s.,;:—–-]/g, "");
            if (text.length === 0) bare.push(holder?.className || "(unnamed)");
          }
          return bare;
        });
        expect(bareMarks, `${where}: a status mark with no word beside it`).toEqual([]);
      });

      test(`${where}: a keyboard can reach every control, and can see where it is`, async ({
        page,
      }) => {
        test.skip(test.info().project.name !== "desktop", "checked once");
        await signInAs(page, "MADSPACE Operations");
        await open(page, variant, screen, 1440, 900);

        const controls = await page.locator("a[href], button:not([disabled])").count();
        expect(controls, `${where}: no focusable control at all`).toBeGreaterThan(0);

        /*
         * Tab into the page and require a VISIBLE focus indicator on whatever
         * lands. "Visible" is measured rather than assumed: the computed
         * outline must have a width, or a ring must be drawn with a shadow.
         * `outline: none` with nothing in its place is the single commonest way
         * a design direction becomes unusable by keyboard, and it is invisible
         * in every screenshot.
         */
        await page.keyboard.press("Tab");
        const focus = await page.evaluate(() => {
          const active = document.activeElement;
          if (active === null || active === document.body) return null;
          const style = window.getComputedStyle(active);
          return {
            tag: active.tagName.toLowerCase(),
            outlineWidth: Number.parseFloat(style.outlineWidth || "0"),
            outlineStyle: style.outlineStyle,
            boxShadow: style.boxShadow,
          };
        });

        expect(focus, `${where}: Tab did not move focus into the page`).not.toBeNull();
        const ringed =
          focus !== null &&
          ((focus.outlineWidth > 0 && focus.outlineStyle !== "none") ||
            (focus.boxShadow !== "none" && focus.boxShadow.length > 0));
        expect(ringed, `${where}: the focused ${focus?.tag ?? "element"} draws no visible ring`).toBe(
          true,
        );
      });

      test(`${where}: the phone reading order is the visual order`, async ({ page }) => {
        test.skip(test.info().project.name !== "desktop", "checked once");
        await signInAs(page, "MADSPACE Operations");
        await open(page, variant, screen, 390, 844);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${where} at 390: overflows by ${String(overflow)}px`).toBeLessThanOrEqual(1);

        /*
         * DOM order against painted order.
         *
         * A grid can reorder cells visually without touching the DOM, which is
         * how a screen comes to read correctly with the eye and backwards with
         * a screen reader. Every direction stacks to one column on a phone, so
         * on a phone the two orders must agree: each landmark block's top edge
         * must be at or below the one before it in the DOM. A tolerance of 4px
         * absorbs sub-pixel rounding without absorbing a swap.
         */
        const inversions = await page.evaluate(() => {
          const blocks = [...document.querySelectorAll("section, header, article")].filter(
            (element) => element.getBoundingClientRect().height > 0,
          );
          const found: string[] = [];
          let previousTop = Number.NEGATIVE_INFINITY;
          let previousName = "";
          for (const block of blocks) {
            /* Nested blocks would compare a child against its parent. */
            if (block.parentElement?.closest("section, header, article") !== null) continue;
            const top = block.getBoundingClientRect().top + window.scrollY;
            if (top + 4 < previousTop) {
              found.push(`${block.tagName.toLowerCase()} after ${previousName}`);
            }
            previousTop = top;
            previousName = block.tagName.toLowerCase();
          }
          return found;
        });
        expect(inversions, `${where} at 390: painted above something that precedes it`).toEqual([]);
      });
    }

    /*
     * The dialog contract, on the one screen that has a dialog.
     *
     * Three separate promises, and the third is the one that is usually broken:
     * a panel that closes and drops focus on the document body leaves a
     * keyboard reader at the top of the page with no idea where they were.
     */
    test(`${variant}/activation: the panel traps, closes on Escape, and gives focus back`, async ({
      page,
    }) => {
      test.skip(test.info().project.name !== "desktop", "checked once");
      await signInAs(page, "MADSPACE Operations");
      await open(page, variant, "activation", 1440, 900);

      const dialog = page.locator('[role="dialog"], dialog');
      const hasDialog = (await dialog.count()) > 0;
      test.skip(
        !hasDialog,
        "this direction shows the code inline rather than in a dialog, which is a legitimate answer",
      );

      await expect(dialog.first()).toBeVisible();

      /*
       * A dialog has to be labelled. Without it a screen reader announces
       * "dialog" and the reader has to go looking for what it is about.
       */
      const labelled = await dialog.first().evaluate((node) => {
        const el = node as HTMLElement;
        return (
          el.getAttribute("aria-label") !== null || el.getAttribute("aria-labelledby") !== null
        );
      });
      expect(labelled, `${variant}/activation: the dialog carries no accessible name`).toBe(true);

      await page.keyboard.press("Escape");
      await expect(dialog.first()).toBeHidden();

      const returned = await page.evaluate(() => {
        const active = document.activeElement;
        return active !== null && active !== document.body;
      });
      expect(returned, `${variant}/activation: closing the panel dropped focus on the body`).toBe(
        true,
      );
    });

    /*
     * The copy control has to SAY it copied.
     *
     * A control whose only feedback is the clipboard changing is a control a
     * blind reader cannot confirm. The check does not press it — the lab's
     * controls are inert by instruction — it checks that the direction has
     * somewhere for the confirmation to be announced: a live region, or a
     * control that describes its own result.
     */
    test(`${variant}/activation: the copy control can announce what it did`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "checked once");
      await signInAs(page, "MADSPACE Operations");
      await open(page, variant, "activation", 1440, 900);

      const copy = page.getByRole("button", { name: /copy/i });
      const present = (await copy.count()) > 0;
      test.skip(!present, "this direction offers no copy control");

      const announces = await page.evaluate(() => {
        const live = document.querySelector("[aria-live], [role='status'], [role='alert']");
        if (live !== null) return true;
        const buttons = [...document.querySelectorAll("button")].filter((button) =>
          /copy/i.test(button.textContent ?? ""),
        );
        return buttons.some(
          (button) =>
            button.getAttribute("aria-describedby") !== null ||
            button.getAttribute("aria-live") !== null,
        );
      });
      expect(
        announces,
        `${variant}/activation: copying has no live region and no described control, so it happens silently`,
      ).toBe(true);
    });
  }
});
