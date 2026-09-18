import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./sign-in";

/**
 * THE OPEN MOBILE SHEET IS THE ONLY THING A READER CAN REACH.
 *
 * Every assertion here was a measurement first. On the real page at 412×915
 * before the fix: eleven controls inside the sheet, then the eleventh Tab
 * landed on Sales Flow's own "Today" chip under the backdrop, 36 controls
 * outside the sheet were reachable in all (the docked Ask composer's textarea
 * among them), and `elementFromPoint` under the open backdrop returned the
 * page's `<h1>` — the backdrop is a `::after` on a `pointer-events: none`
 * host and inherited it, so a tap went straight through.
 *
 * A `<details>` is a disclosure, not a dialog; nothing native hides the rest
 * of the page when it opens. `Shell.tsx` now sets `inert` on `<main>`, the
 * docked composer and `<header>` while the sheet is open — the header joined
 * the other two once the wordmark's own link turned up reachable through an
 * open sheet on the real page, the same way the composer once did. These
 * cases prove the four things that follow from that, from the keyboard and
 * the pointer rather than from the attribute: focus stays in, taps stay out,
 * every way of closing clears it, and Ask IRIS — which renders no sheet — is
 * untouched.
 *
 * Mobile only. The sheet does not exist above 1199px, which the breakpoint
 * case proves rather than assumes.
 */

const FLOW = "/alpha/northgate/flow";
const ASK = "/alpha/northgate/ask";

const TRIGGER = ".irs-mobile-menu-trigger";
const PANEL = ".irs-mobile-menu-panel";
const CLOSE = ".irs-mobile-menu-close";
const DETAILS = ".irs-mobile-menu";

interface Focus {
  readonly tag: string;
  readonly className: string;
  readonly insidePanel: boolean;
  readonly isTrigger: boolean;
}

async function focused(page: Page): Promise<Focus> {
  return page.evaluate(
    ({ panel, trigger }) => {
      const el = document.activeElement as HTMLElement;
      return {
        tag: el.tagName,
        className: String(el.className),
        insidePanel: document.querySelector(panel)?.contains(el) ?? false,
        isTrigger: el === document.querySelector(trigger),
      };
    },
    { panel: PANEL, trigger: TRIGGER },
  );
}

/** The inert state of the two regions the sheet covers, read from the DOM. */
async function inertState(page: Page): Promise<{ main: boolean; dock: boolean; open: boolean }> {
  return page.evaluate((details) => ({
    main: document.getElementById("main")?.inert ?? false,
    dock: document.querySelector<HTMLElement>(".ask-dock")?.inert ?? false,
    open: document.querySelector<HTMLDetailsElement>(details)?.open ?? false,
  }), DETAILS);
}

async function openSheet(page: Page): Promise<void> {
  await page.locator(TRIGGER).click();
  await expect(page.locator(DETAILS)).toHaveAttribute("open", "");
}

test.describe("the open mobile menu contains focus and pointer", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "mobile", "the sheet exists only below 1200px");
  });

  test("covers <main> and the docked composer with inert, and only while open", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(FLOW);

    expect(await inertState(page)).toEqual({ main: false, dock: false, open: false });
    await openSheet(page);
    expect(await inertState(page)).toEqual({ main: true, dock: true, open: true });

    /*
     * Containment, proved by membership rather than by count: every
     * focusable element outside the panel must sit inside an inert subtree,
     * except the skip link, which precedes the sheet in DOM order and can
     * never be reached by Tab from inside it.
     */
    const leaks = await page.evaluate((panel) => {
      const sel =
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const p = document.querySelector(panel) as HTMLElement;
      return [...document.querySelectorAll<HTMLElement>(sel)]
        .filter((el) => !p.contains(el) && el.offsetParent !== null && !el.closest("[inert]"))
        .filter((el) => !el.classList.contains("obs-skip") && !el.classList.contains("irs-mobile-menu-trigger"))
        .map((el) => `${el.tagName}.${String(el.className).split(" ")[0]}`);
    }, PANEL);
    expect(leaks, `reachable outside the open sheet: ${leaks.join(", ")}`).toEqual([]);
  });

  test("Tab cannot leave the sheet, in either direction", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(FLOW);
    await openSheet(page);
    await page.locator(TRIGGER).focus();

    /*
     * Forward: more presses than there are controls.
     *
     * Past the last control, sequential navigation has nowhere in the
     * document to go — everything after the sheet is inert — so Chromium
     * hands focus to the browser's own UI and `activeElement` reads `<body>`.
     * That is what a native `<dialog>` does too; no wrap is hand-rolled here
     * (the Ask pickers this sheet mirrors do not wrap either). The contract
     * is narrower and it is the one that was broken: focus never lands on
     * the page beneath. After leaving, the next press re-enters at the top
     * of the document — the skip link or the trigger — and not in `<main>`.
     */
    for (let i = 0; i < 16; i += 1) {
      await page.keyboard.press("Tab");
      const f = await focused(page);
      const left = f.tag === "BODY";
      expect(
        f.insidePanel || f.isTrigger || left,
        `Tab ${i + 1} reached the page beneath: ${f.tag}.${f.className}`,
      ).toBe(true);
      if (left) {
        await page.keyboard.press("Tab");
        const back = await focused(page);
        const reentry =
          back.isTrigger || back.insidePanel || back.className.includes("obs-skip");
        expect(reentry, `re-entered below the sheet: ${back.tag}.${back.className}`).toBe(true);
        expect(
          await page.evaluate(() => document.activeElement?.closest("#main, .ask-dock") !== null),
          "re-entered inside an inert region",
        ).toBe(false);
      }
    }

    // Backward, from the first control in the sheet.
    await page.locator(CLOSE).focus();
    await page.keyboard.press("Shift+Tab");
    const back = await focused(page);
    expect(back.insidePanel || back.isTrigger, `Shift+Tab left the sheet: ${back.tag}.${back.className}`).toBe(true);
  });

  test("Escape closes it, returns focus to the trigger and clears inert", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(FLOW);
    await openSheet(page);
    await page.locator(CLOSE).focus();

    await page.keyboard.press("Escape");
    await expect(page.locator(DETAILS)).not.toHaveAttribute("open", "");
    expect(await inertState(page)).toEqual({ main: false, dock: false, open: false });
    expect((await focused(page)).isTrigger, "focus did not return to the trigger").toBe(true);
  });

  test("a tap on the backdrop closes it, clears inert, and cannot reach the page beneath", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(FLOW);
    await openSheet(page);

    // (200, 200) is under the backdrop and clear of the panel, which sits at the bottom.
    const beneath = await page.evaluate(() => {
      const el = document.elementFromPoint(200, 200) as HTMLElement;
      return { tag: el.tagName, inertAncestor: el.closest("[inert]") !== null, isMain: el.closest("#main") !== null };
    });
    expect(beneath.isMain && !beneath.inertAncestor, "the page beneath the backdrop is hit-testable").toBe(false);

    await page.mouse.click(200, 200);
    await expect(page.locator(DETAILS)).not.toHaveAttribute("open", "");
    expect(await inertState(page)).toEqual({ main: false, dock: false, open: false });
  });

  test("crossing the breakpoint closes it and leaves nothing inert behind", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(FLOW);
    await openSheet(page);
    expect(await inertState(page)).toEqual({ main: true, dock: true, open: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator(DETAILS)).not.toHaveAttribute("open", "");
    expect(await inertState(page)).toEqual({ main: false, dock: false, open: false });
    await expect(page.locator(".irs-nav--wide")).toBeVisible();

    await page.setViewportSize({ width: 412, height: 915 });
    expect(await inertState(page)).toEqual({ main: false, dock: false, open: false });
    // The page is interactive again: a control in <main> can take focus.
    await page.locator("#main a[href]").first().focus();
    expect((await focused(page)).insidePanel).toBe(false);
    expect(await page.evaluate(() => document.activeElement?.closest("#main") !== null)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("Ask IRIS renders no sheet and is never made inert", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(ASK);
    await expect(page.locator(".irs-shell")).toHaveAttribute("data-variant", "ask");
    await expect(page.locator(".irs-mobile-bar")).toHaveCount(0);
    expect(await inertState(page)).toEqual({ main: false, dock: false, open: false });
  });

  test("the open sheet has no detectable accessibility violations", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    await page.goto(FLOW);
    await openSheet(page);
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
