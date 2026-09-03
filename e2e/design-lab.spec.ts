import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";

/**
 * The review set for the Source detail design lab.
 *
 * Three directions, two widths each, plus one sheet putting the three side by
 * side so a reviewer can compare them without switching tabs. Not assertions:
 * these produce the images a person looks at, and `docs/12-visual-autopsy.md`
 * is the record of what happens when nobody does.
 *
 * ## It needs a development server
 *
 * The lab route calls `notFound()` unless the local control plane is enabled,
 * which requires a non-production `NODE_ENV`. The default Playwright
 * configuration builds and runs `next start`, so every capture would be a
 * screenshot of a 404 page. Run it against the dev server:
 *
 *   OBSERVER_BASE_URL=http://localhost:3310 pnpm exec playwright test design-lab
 *
 * with `pnpm --filter @observer/web dev --port 3310` running and
 * `OBSERVER_LOCAL_CONTROL_PLANE=1` in `apps/web/.env.local`.
 *
 * ## The estate has to be interesting
 *
 * All three variants read the same source, and a source with an empty outbox
 * makes eight of the figures read "0" or "Not reported", which is a fine state
 * for the product and a useless one for choosing a layout. Press the lifecycle
 * driver through to "Report a busy outbox" on the real Source detail screen
 * before capturing, or the review set will compare three empty states.
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

const VARIANTS = [
  { key: "a", name: "light" },
  { key: "b", name: "dark" },
  { key: "c", name: "hybrid" },
] as const;

async function shoot(page: Page, file: string): Promise<void> {
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
}

test.describe("design lab", () => {
  for (const variant of VARIANTS) {
    test(`variant ${variant.key} at 1440`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "captured once, at the review width");
      await signInAs(page, "MADSPACE Operations");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/design-lab/source-detail/${variant.key}`);

      /*
       * The variant's own root, not just a 200. A `notFound()` from the gate
       * renders a page that screenshots perfectly well and shows nothing being
       * reviewed, which is the failure this whole file exists to avoid.
       */
      await expect(page.locator(`.dl${variant.key}-root`)).toBeVisible();
      await shoot(page, `${variant.key.toUpperCase()}-${variant.name}-1440`);
    });

    test(`variant ${variant.key} at 390`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "captured once, at the review width");
      await signInAs(page, "MADSPACE Operations");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/design-lab/source-detail/${variant.key}`);
      await expect(page.locator(`.dl${variant.key}-root`)).toBeVisible();

      /*
       * A horizontal scrollbar at 390 is a defect, not a detail, and it is the
       * one thing a full-page screenshot hides: the image simply comes out
       * wider. Asserted rather than looked for afterwards.
       */
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${variant.key} overflows by ${String(overflow)}px at 390`).toBeLessThanOrEqual(1);

      await shoot(page, `${variant.key.toUpperCase()}-${variant.name}-390`);
    });
  }

  test("all three side by side", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "captured once");

    /*
     * The three captures composited, not three live frames.
     *
     * The obvious version of this loads each route in an iframe. It cannot
     * work, and it is right that it cannot: `next.config.ts` sends
     * `X-Frame-Options: DENY` and `frame-ancestors 'none'` on every response,
     * because nothing in this application is meant to be embedded and an
     * analytics screen inside somebody else's page is a clickjacking target.
     * The first attempt produced a sheet of three white rectangles.
     *
     * So the PNGs the tests above just wrote are read from disk and inlined as
     * data URIs. Every pixel still came from the route it claims to show; what
     * is lost is only that the three were captured moments apart, which for
     * comparing shape is nothing.
     */
    const shots = VARIANTS.map((v) => {
      const file = `${OUT}/${v.key.toUpperCase()}-${v.name}-1440.png`;
      return {
        ...v,
        data: `data:image/png;base64,${readFileSync(file).toString("base64")}`,
      };
    });

    await page.setViewportSize({ width: 1560, height: 1000 });
    await page.setContent(`<!doctype html>
      <style>
        body { margin:0; background:#1b1b1a; font:12px/1.4 system-ui; color:#f2f1ef; }
        .row { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; padding:14px; }
        figure { margin:0; display:flex; flex-direction:column; gap:8px; }
        figcaption { letter-spacing:.09em; text-transform:uppercase; font-weight:600; }
        img { width:100%; height:auto; display:block; border-radius:8px; }
      </style>
      <div class="row">
        ${shots
          .map(
            (v) => `<figure>
              <figcaption>${v.key.toUpperCase()} &middot; ${v.name}</figcaption>
              <img src="${v.data}" alt="Variant ${v.key}">
            </figure>`,
          )
          .join("")}
      </div>`);

    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/ALL-three-side-by-side.png`, fullPage: true });
  });
});
