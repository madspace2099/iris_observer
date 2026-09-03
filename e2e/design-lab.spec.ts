import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * The review set for the design lab.
 *
 * Five screens, three directions, three widths. Not assertions about
 * appearance: these produce the images a person looks at, and
 * `docs/12-visual-autopsy.md` is the record of what happens when nobody does.
 * What IS asserted is the handful of things a screenshot silently hides.
 *
 * ## It needs a development server
 *
 * The lab route calls `notFound()` unless the local control plane is enabled,
 * which requires a non-production `NODE_ENV`. The default Playwright
 * configuration builds and runs `next start`, so every capture would be a
 * picture of a 404. Run it against the dev server:
 *
 *   OBSERVER_BASE_URL=http://localhost:3310 pnpm exec playwright test design-lab
 *
 * with `pnpm --filter @observer/web dev --port 3310` running and
 * `OBSERVER_LOCAL_CONTROL_PLANE=1` in `apps/web/.env.local`.
 *
 * ## The estate has to be worth photographing
 *
 * Every variant reads one estate, so an empty one makes fifteen screenshots of
 * fifteen empty states. On the real Source detail screen, press the lifecycle
 * driver through "Add the review estate", then activate, heartbeat,
 * diagnostic.test and "Report a busy outbox". That produces four projects and
 * seven sources, one of them delivering and reporting a loaded outbox, which is
 * the contrast the list screens have to survive.
 */
const OUT =
  process.env["OBSERVER_LAB_SHOTS"] ??
  "C:/Users/42191/AppData/Local/Temp/claude/C--Users-42191-Documents-IRIS-OBSERVER/8eba7212-1d04-4994-b6ca-c0d2830338c5/scratchpad/design-lab";

/** Next's development overlay, hidden for the capture only. */
const HIDE_DEV_OVERLAY = `
  nextjs-portal,
  [data-nextjs-dev-tools-button],
  #__next-build-watcher { display: none !important; }
`;

const VARIANTS = ["a", "b", "c"] as const;

const SCREENS = [
  "projects",
  "project-detail",
  "source-detail",
  "activation",
  "diagnostics",
] as const;

/** The three the brief asks to see on a handset, and the ones most likely to break. */
const MOBILE_SCREENS = ["projects", "source-detail", "diagnostics"] as const;

type Variant = (typeof VARIANTS)[number];

const shot = (variant: Variant, screen: string, width: number): string =>
  `${variant.toUpperCase()}-${screen}-${String(width)}`;

async function open(page: Page, variant: Variant, screen: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`/design-lab/${screen}/${variant}`);

  /*
   * The variant's own root, not just a 200. A `notFound()` from the gate
   * renders a page that screenshots perfectly well and shows nothing being
   * reviewed, which is the failure this whole file exists to prevent.
   */
  await expect(page.locator(`.dl${variant}-root`)).toBeVisible();
}

/**
 * A horizontal scrollbar is a defect, and it is the one thing a full-page
 * capture hides: the image simply comes out wider and looks fine.
 */
async function assertNoOverflow(page: Page, where: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where} overflows horizontally by ${String(overflow)}px`).toBeLessThanOrEqual(1);
}

async function capture(page: Page, file: string): Promise<void> {
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
}

test.describe("design lab", () => {
  for (const variant of VARIANTS) {
    for (const screen of SCREENS) {
      test(`${variant} ${screen} at 1440`, async ({ page }) => {
        test.skip(test.info().project.name !== "desktop", "captured once, at the review width");
        await signInAs(page, "MADSPACE Operations");
        await open(page, variant, screen, 1440, 900);
        await assertNoOverflow(page, `${variant}/${screen} at 1440`);
        await capture(page, shot(variant, screen, 1440));
      });
    }

    for (const screen of MOBILE_SCREENS) {
      test(`${variant} ${screen} at 390`, async ({ page }) => {
        test.skip(test.info().project.name !== "desktop", "captured once, at the review width");
        await signInAs(page, "MADSPACE Operations");
        await open(page, variant, screen, 390, 844);
        await assertNoOverflow(page, `${variant}/${screen} at 390`);
        await capture(page, shot(variant, screen, 390));
      });
    }

    /*
     * 1024 is checked and NOT captured. It is the width where a three-column
     * composition has to decide whether to stack, and the decision either works
     * or produces an overflow; a third set of fifteen images would not make
     * that decision easier to see than the assertion does.
     */
    test(`${variant} holds together at 1024`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "checked once");
      await signInAs(page, "MADSPACE Operations");
      for (const screen of SCREENS) {
        await open(page, variant, screen, 1024, 900);
        await assertNoOverflow(page, `${variant}/${screen} at 1024`);
      }
    });
  }

  /**
   * One contact sheet per screen, the three directions beside each other.
   *
   * Composited from the PNGs the tests above wrote, not from three live frames.
   * The obvious version loads each route in an iframe and cannot work, rightly:
   * every response carries `X-Frame-Options: DENY` and `frame-ancestors 'none'`
   * because nothing here is meant to be embedded. The first attempt produced
   * three white rectangles. Every pixel here still came from the route it
   * claims to show; what is lost is only that the three were captured moments
   * apart, which for comparing shape is nothing.
   */
  for (const screen of SCREENS) {
    test(`contact sheet: ${screen}`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "composed once");

      const shots = VARIANTS.map((variant) => ({
        variant,
        data: `data:image/png;base64,${readFileSync(
          `${OUT}/${shot(variant, screen, 1440)}.png`,
        ).toString("base64")}`,
      }));

      await page.setViewportSize({ width: 1560, height: 1000 });
      await page.setContent(`<!doctype html>
        <style>
          body { margin:0; background:#1b1b1a; font:12px/1.4 system-ui; color:#f2f1ef; }
          h1 { font-size:13px; letter-spacing:.09em; text-transform:uppercase; margin:0; padding:14px 14px 0; }
          .row { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; padding:14px; }
          figure { margin:0; display:flex; flex-direction:column; gap:8px; }
          figcaption { letter-spacing:.09em; text-transform:uppercase; font-weight:600; }
          img { width:100%; height:auto; display:block; border-radius:8px; }
        </style>
        <h1>${screen.replace("-", " ")}</h1>
        <div class="row">
          ${shots
            .map(
              (s) => `<figure>
                <figcaption>${s.variant.toUpperCase()}</figcaption>
                <img src="${s.data}" alt="Variant ${s.variant}">
              </figure>`,
            )
            .join("")}
        </div>`);

      await page.waitForTimeout(1200);

      /*
       * The ROW element, not the page.
       *
       * `fullPage` never returns less than the viewport, so a sheet whose three
       * images came out 500px tall was padded to 1000 with black, and half of
       * every contact sheet was empty. Capturing the element crops to exactly
       * what is on it, whatever height the tallest of the three turns out to be.
       */
      const sheet = page.locator("body > div.row");
      await sheet.screenshot({ path: `${OUT}/SHEET-${screen}.png` });
    });
  }
});
