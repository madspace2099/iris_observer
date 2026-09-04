import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./sign-in";

/**
 * ASK IRIS: THE DELIVERED DESIGN BESIDE WHAT WAS BUILT.
 *
 * The user exported their design as HTML and named it the visual source of
 * truth for `/[tenant]/[project]/ask`. This captures both — the export and the
 * implementation — at the same widths, and writes a side-by-side page so the
 * comparison is looked at rather than asserted.
 *
 * ## The reference is served, not opened from disk
 *
 * The export is a Claude Design canvas document: a custom element rendered by
 * its own runtime, with a WebGL background on `three.js`. Opened as a `file://`
 * URL it renders nothing at all. It is therefore copied into
 * `apps/web/public/_ask-reference/` and served by the same development server
 * as the application, and that directory is listed in `.git/info/exclude` —
 * an inbound artefact, kept out of the repository the way `CLAUDE.md` says
 * inbound artefacts are kept out of it.
 *
 * If the directory is missing every reference capture is skipped and the
 * implementation captures still run, because a missing inbound file should not
 * look like a broken screen.
 *
 * ## Running it
 *
 *   pnpm --filter @observer/web dev --port 3310
 *   OBSERVER_BASE_URL=http://localhost:3310 pnpm exec playwright test ask-iris-compare
 */

const OUT =
  process.env["OBSERVER_ASK_SHOTS"] ??
  "C:/Users/42191/AppData/Local/Temp/claude/C--Users-42191-Documents-IRIS-OBSERVER/8eba7212-1d04-4994-b6ca-c0d2830338c5/scratchpad/ask-compare";

const REFERENCE = "/_ask-reference/IRIS%20Observer.dc.html";

/** The review project. Northgate is the address the user named. */
const ASK = "/alpha/northgate/ask";

const HIDE_DEV_OVERLAY = `
  nextjs-portal,
  [data-nextjs-dev-tools-button],
  #__next-build-watcher { display: none !important; }
`;

/** Desktop first, then the two the brief calls out by name. */
const WIDTHS = [1920, 1440, 1280, 1024, 768, 390] as const;

async function shoot(page: Page, file: string): Promise<void> {
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(500);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
}

/**
 * A horizontal scrollbar is a defect, and it is the one thing a full-page
 * capture hides: the image comes out wider and looks correct.
 */
async function assertNoOverflow(page: Page, where: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where} overflows horizontally by ${String(overflow)}px`).toBeLessThanOrEqual(
    1,
  );
}

test.describe("Ask IRIS against the delivered design", () => {
  /* --- the reference --------------------------------------------------- */

  for (const width of [1440, 390] as const) {
    test(`reference at ${String(width)}`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "captured once");

      const response = await page.request.get(REFERENCE);
      test.skip(
        response.status() >= 400,
        "the inbound design export is not present under apps/web/public/_ask-reference",
      );

      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(REFERENCE);
      /* The export's own composer, so a blank canvas cannot pass as a capture. */
      await expect(page.locator("#iris-prompt")).toBeVisible();
      await shoot(page, `REFERENCE-${String(width)}`);
    });
  }

  test("reference with the history panel open", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "captured once");
    const response = await page.request.get(REFERENCE);
    test.skip(response.status() >= 400, "the inbound design export is not present");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(REFERENCE);
    await page.getByRole("button", { name: "History" }).click();
    await page.waitForTimeout(700);
    await shoot(page, "REFERENCE-history-1440");
  });

  /* --- the implementation ---------------------------------------------- */

  for (const width of WIDTHS) {
    test(`implementation at ${String(width)}`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "captured once, at every width");
      await signInAs(page, "Petra Novák");
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
      await page.goto(ASK);

      await expect(page.locator(".ask-page")).toBeVisible();
      await expect(page.locator(".ask-page").getByPlaceholder("Ask IRIS…")).toBeVisible();

      await assertNoOverflow(page, `ask at ${String(width)}`);
      await shoot(page, `ASK-${String(width)}`);
    });
  }

  test("implementation with the history panel open", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "captured once");
    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(`${ASK}?history=1`);
    await expect(page.getByRole("heading", { name: "HISTORY" })).toBeVisible();
    await assertNoOverflow(page, "ask history at 1440");
    await shoot(page, "ASK-history-1440");
  });

  test("implementation with an answer", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "captured once");
    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(ASK);

    /*
     * Asked by pressing the first opening rather than by navigating to a
     * hand-written `?q=`, so the capture also proves the journey the brief
     * requires: a suggested question produces an answer at an address.
     */
    const first = page.locator(".ask-opening").first();
    await expect(first).toBeVisible();
    await first.click();

    await expect(page.locator(".ask-log")).toBeVisible();
    await assertNoOverflow(page, "ask answer at 1440");
    await shoot(page, "ASK-answer-1440");
  });

  /* --- what a screenshot hides ------------------------------------------ */

  test("the composer is operable from the keyboard alone", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ASK);

    /*
     * Scoped to the page's own composer. The docked bar carries the same
     * placeholder and is present in the DOM on every surface — hidden by the
     * stylesheet here, which does not stop a locator resolving it. An unscoped
     * query matches two fields and fails in strict mode, which is the whole
     * reason this line names the page.
     */
    const field = page.locator(".ask-page").getByPlaceholder("Ask IRIS…");
    await field.focus();
    await expect(field).toBeFocused();

    await field.fill("What were the main insights from this month?");
    await field.press("Enter");

    /* Enter sends, and the question survives in the address. */
    await page.waitForURL(/[?&]q=/);
    await expect(page.locator(".ask-log")).toBeVisible();

    /* Shift+Enter must NOT send. */
    await page.goto(ASK);
    const again = page.locator(".ask-page").getByPlaceholder("Ask IRIS…");
    await again.fill("two");
    await again.press("Shift+Enter");
    await expect(page).not.toHaveURL(/[?&]q=/);
  });

  test("carries no exporter artefact and no third-party font", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");

    const external: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http://localhost") || url.startsWith("data:")) return;
      external.push(url);
    });

    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ASK);
    await expect(page.locator(".ask-page")).toBeVisible();
    await page.waitForTimeout(600);

    expect(external, `the page reached outside the origin: ${external.join(", ")}`).toEqual([]);

    const html = await page.content();
    for (const artefact of ["Made with Claude", "unpkg.com", "fonts.googleapis", "dc.html", "x-dc"]) {
      expect(html, `the exporter artefact "${artefact}" survived into the page`).not.toContain(
        artefact,
      );
    }
  });

  test("has one h1, and the navigation says where the reader is", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ASK);

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "ASK IRIS" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    /* The project the answers are about is stated, not implied. */
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Northgate Residences");
  });

  test("reports no console error", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(String(error)));

    await signInAs(page, "Petra Novák");
    await page.goto(ASK);
    await expect(page.locator(".ask-page")).toBeVisible();
    await page.waitForTimeout(800);

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("has no axe violations, idle and with history open", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const url of [ASK, `${ASK}?history=1`]) {
      await page.goto(url);
      await expect(page.locator(".ask-page")).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.help}`),
        `${url}: ${results.violations.map((v) => v.id).join(", ")}`,
      ).toEqual([]);
    }
  });

  /* --- the travelling light ---------------------------------------------- */

  /**
   * READS THE LIGHT OUT OF THE FRAMEBUFFER.
   *
   * The effect is now a fragment shader, so there is no computed style to
   * interrogate and no element whose position means anything — the canvas never
   * moves; the pixels inside it do. `preserveDrawingBuffer: true` is what makes
   * this possible: the drawing buffer survives the frame, so it can be copied
   * into a 2D canvas and read back.
   *
   * Returns the brightest pixel's position, normalised to the canvas, and how
   * bright it is on a single channel. Both matter. Position proves the head
   * travels; peak proves it is LIGHT rather than a grey smudge, which is the
   * property two rejected CSS attempts failed on and no structural assertion
   * would have caught.
   */
  const sampleGlow = async (page: Page, hostSelector: string) =>
    page.evaluate((sel) => {
      const cv = document.querySelector(`${sel} .ask-glow-canvas`) as HTMLCanvasElement | null;
      if (!cv) return null;

      const flat = document.createElement("canvas");
      flat.width = cv.width;
      flat.height = cv.height;
      const ctx = flat.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(cv, 0, 0);
      const { data } = ctx.getImageData(0, 0, flat.width, flat.height);

      /* Every second pixel: the head is tens of pixels across, so a stride of
       * two cannot miss it, and it quarters the work on a 2000×450 buffer. */
      let best = -1;
      let bx = 0;
      let by = 0;
      let peak = 0;
      for (let y = 0; y < flat.height; y += 2) {
        for (let x = 0; x < flat.width; x += 2) {
          const i = (y * flat.width + x) * 4;
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          const sum = r + g + b;
          if (sum > best) {
            best = sum;
            bx = x;
            by = y;
            peak = Math.max(r, g, b);
          }
        }
      }
      return { x: bx / flat.width, y: by / flat.height, peak };
    }, hostSelector);

  test("laps the perimeter of both composers", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 900 });

    const lap = async (where: string, host: string) => {
      const first = await sampleGlow(page, host);
      expect(first, `${where}: no glow canvas — WebGL was refused`).not.toBeNull();

      /*
       * 1.5s of a 6.45s lap is 23% of the perimeter, far more than the sampling
       * stride or any rounding, and short enough that the head cannot come back
       * around to where it started.
       */
      await page.waitForTimeout(1500);
      const second = await sampleGlow(page, host);
      if (!first || !second) throw new Error("unreachable: asserted above");

      const moved = Math.hypot(second.x - first.x, second.y - first.y);
      expect(
        moved,
        `${where}: the head did not move in 1.5s — stuck at ${first.x.toFixed(3)}, ${first.y.toFixed(3)}`,
      ).toBeGreaterThan(0.02);
    };

    await page.goto(ASK);
    await expect(page.locator(".ask-page .ask-glow-canvas")).toBeAttached();
    await lap("the Ask composer", ".ask-page");

    await page.goto("/alpha/northgate/flow");
    await expect(page.locator(".ask-dock .ask-glow-canvas")).toBeAttached();
    await lap("the docked bar", ".ask-dock");
  });

  /**
   * ONE LAP IS 6.45 SECONDS, WHICH IS THE ONE NUMBER A READER CAN FEEL.
   *
   * `travel = fract(uTime * 0.155)` — 0.155 loops per second. Everything else
   * in the shader is a shape; this is the tempo, and it is the constant most
   * likely to be "improved" by someone who finds the light too slow.
   *
   * Measured by return rather than by speed: the head is photographed, then
   * again half a lap later, then again a full lap later. A wrong period fails
   * one of the two — too fast and it has already come back at the half, too
   * slow and it has not arrived at the full.
   */
  test("takes 6.45 seconds to go round", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ASK);
    await expect(page.locator(".ask-page .ask-glow-canvas")).toBeAttached();

    const start = await sampleGlow(page, ".ask-page");
    await page.waitForTimeout(3225);
    const half = await sampleGlow(page, ".ask-page");
    await page.waitForTimeout(3225);
    const full = await sampleGlow(page, ".ask-page");
    if (!start || !half || !full) throw new Error("no glow canvas — WebGL was refused");

    const away = Math.hypot(half.x - start.x, half.y - start.y);
    const back = Math.hypot(full.x - start.x, full.y - start.y);

    /*
     * The tolerances are loose on purpose. `waitForTimeout` is not a frame
     * clock and the shader integrates real deltas, so a lap measured this way
     * carries tens of milliseconds of slop — enough to move the head a few
     * pixels, nowhere near enough to hide a period that is out by a factor.
     */
    expect(away, "half a lap later the head has not moved away").toBeGreaterThan(0.15);
    expect(back, `a full lap later the head is at ${full.x.toFixed(2)}, not back at ${start.x.toFixed(2)}`).toBeLessThan(0.06);
  });

  /**
   * THE ASSERTION THE TWO REJECTED VERSIONS WOULD HAVE FAILED.
   *
   * `I = 1 - exp(-1.35 * I)` runs on the SUM of four bloom scales, which is
   * what drives the head to white instead of pale blue. A layered-CSS
   * reproduction gets the path right and lands around a third of this, and
   * "it moves" was true of it — so motion alone was never enough to test.
   *
   * The floor is set below the measured value with room for driver variance:
   * this runs on whatever rasteriser the CI browser has, and the number to
   * defend is "unmistakably lit", not a specific one.
   */
  test("the head is white-hot, not a smudge", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ASK);
    await expect(page.locator(".ask-page .ask-glow-canvas")).toBeAttached();

    const lit = await sampleGlow(page, ".ask-page");
    expect(lit, "no glow canvas — WebGL was refused").not.toBeNull();
    expect(lit?.peak ?? 0, "the travelling head is not reaching full intensity").toBeGreaterThan(180);
  });

  test("stops travelling, and stays lit, when motion is reduced", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ASK);
    await expect(page.locator(".ask-page .ask-glow-canvas")).toBeAttached();

    const first = await sampleGlow(page, ".ask-page");
    await page.waitForTimeout(1500);
    const second = await sampleGlow(page, ".ask-page");
    expect(first, "no glow canvas — WebGL was refused").not.toBeNull();
    if (!first || !second) throw new Error("unreachable: asserted above");

    /*
     * `uMotion = 0` and the clock frozen at 2.1: the head is drawn, once, and
     * never advances. Both halves matter — a still frame that was also DARK
     * would satisfy "does not move" while failing the brief, which asks for the
     * static halo to stay.
     */
    expect(second.x, "the light must not travel under reduced motion").toBeCloseTo(first.x, 5);
    expect(second.y, "the light must not travel under reduced motion").toBeCloseTo(first.y, 5);
    expect(first.peak, "the still halo must remain lit under reduced motion").toBeGreaterThan(120);

    await shoot(page, "ASK-reduced-motion-1440");
    await page.emulateMedia({ reducedMotion: null });
  });

  test("the light does not overflow or intercept a click at any width", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák");

    for (const width of [1440, 1024, 390] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });

      await page.goto(ASK);
      await assertNoOverflow(page, `ask with the travelling light at ${String(width)}`);
      /*
       * The canvas overhangs the card by 130px on every side — across the whole
       * composer and past its controls — so the one thing that must be proved
       * is that it cannot take a press meant for one of them.
       */
      const inert = await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".ask-page .ask-glow-canvas") as Element)
            .pointerEvents,
      );
      expect(inert, "the travelling light must never take a click").toBe("none");

      await page.goto("/alpha/northgate/flow");
      await assertNoOverflow(page, `the dock with the travelling light at ${String(width)}`);
    }

    /* And the dock still submits, with the canvas layered across its edge. */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/alpha/northgate/flow");
    const bar = page.locator(".ask-dock").getByPlaceholder(/Ask IRIS/);
    await bar.fill("Why did demand fall this quarter?");
    await bar.press("Enter");
    await page.waitForURL(/\/ask\?.*q=/);
    await expect(page.locator(".ask-log")).toBeVisible();
  });

  /**
   * THE STILL HALO STANDS DOWN WHEN THE SHADER STANDS UP.
   *
   * Both draw the same light and both are additive against a dark ground, so
   * leaving the gradients in place under a running canvas would double the rim.
   * The stylesheet retires them with `content: none` keyed on the canvas being
   * present, which also means their SURVIVAL is the no-WebGL fallback — one
   * mechanism, tested from both sides.
   */
  test("hands the still halo over to the shader exactly once", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ASK);
    await expect(page.locator(".ask-page .ask-glow-canvas")).toBeAttached();

    const withCanvas = await page.evaluate(() => {
      const hero = document.querySelector(".ask-page .ask-hero") as Element;
      return {
        before: getComputedStyle(hero, "::before").content,
        after: getComputedStyle(hero, "::after").content,
      };
    });
    expect(withCanvas.before, "the still halo must retire under the shader").toBe("none");
    expect(withCanvas.after, "the still halo must retire under the shader").toBe("none");

    /* Take the canvas away — what a refused context leaves — and it comes back. */
    const withoutCanvas = await page.evaluate(() => {
      document.querySelector(".ask-page .ask-glow-canvas")?.remove();
      const hero = document.querySelector(".ask-page .ask-hero") as Element;
      return {
        before: getComputedStyle(hero, "::before").content,
        after: getComputedStyle(hero, "::after").content,
      };
    });
    expect(withoutCanvas.before, "without WebGL the card must still be lit").not.toBe("none");
    expect(withoutCanvas.after, "without WebGL the card must still be lit").not.toBe("none");
  });

  /**
   * A FILMSTRIP OF THE LAP, because a still cannot show a moving light.
   *
   * The lap is 6.45s, so eight frames 806ms apart walk the head once round the
   * perimeter. Sampling the live animation is the only option now — the pulse
   * position is a uniform inside the shader, not a style that can be pinned —
   * and it is also the honest one: these are frames the effect actually
   * produced, at the speed it actually runs.
   *
   * ## Captured as a REGION, not as the element
   *
   * `.ask-hero` is exactly the card's box, and an element screenshot clips to
   * it — which crops away everything the shader draws, because the card is
   * opaque and the light lives outside its border. The first filmstrip taken
   * this way showed eight near-identical pictures of an unlit card and looked
   * like proof the port had failed. So the clip is the hero's box grown by the
   * canvas's own overhang, and the frames show the glow.
   */
  test("films the lap", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "captured once");
    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ASK);
    await expect(page.locator(".ask-page .ask-glow-canvas")).toBeAttached();

    mkdirSync(OUT, { recursive: true });

    /** The hero's box grown by `pad`, clamped to the viewport. */
    const around = async (selector: string, pad: number) => {
      const box = await page.locator(selector).boundingBox();
      if (!box) throw new Error(`${selector} has no box`);
      const size = page.viewportSize();
      if (!size) throw new Error("no viewport");
      const x = Math.max(0, box.x - pad);
      const y = Math.max(0, box.y - pad);
      return {
        x,
        y,
        width: Math.min(size.width - x, box.width + pad * 2),
        height: Math.min(size.height - y, box.height + pad * 2),
      };
    };

    const clip = await around(".ask-page .ask-hero", 90);
    for (let frame = 0; frame < 8; frame += 1) {
      await page.screenshot({ clip, path: `${OUT}/LAP-${String(frame).padStart(2, "0")}.png` });
      await page.waitForTimeout(806);
    }

    /* And one of the docked bar, mid-lap. */
    await page.goto("/alpha/northgate/flow");
    await expect(page.locator(".ask-dock .ask-glow-canvas")).toBeAttached();
    await page.waitForTimeout(1200);
    await page.screenshot({
      clip: await around(".ask-dock .ask-hero", 70),
      path: `${OUT}/LAP-dock.png`,
    });
  });

  /* --- the variant, and the screens it must not touch -------------------- */

  test("wears the reference header on Ask IRIS and nowhere else", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "checked once");
    await signInAs(page, "Petra Novák");
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(ASK);
    await expect(page.locator('.irs-shell[data-variant="ask"]')).toBeVisible();

    const ask = await page.evaluate(() => {
      const nav = document.querySelector(".irs-nav");
      const out = document.querySelector(".irs-signout");
      return {
        navGap: nav === null ? null : getComputedStyle(nav).gap,
        signOut: out === null ? null : Math.round(out.getBoundingClientRect().width),
        context: document.querySelector(".ox-context") !== null,
        tabs: document.querySelector(".ox-tabs") !== null,
        projects: document.querySelector('a[href="/projects"]') !== null,
        settings: document.querySelector('a[href^="/settings/ai"]') !== null,
      };
    });

    /* The export's own values, not chosen ones. */
    expect(ask.navGap, "the Ask header must use the export's 40px nav gap").toBe("40px");
    expect(ask.signOut, "the Sign out pill is 96px wide in the export").toBe(96);
    expect(ask.context, "the reference has no second utility row").toBe(false);
    expect(ask.tabs, "the reference draws no sub-navigation").toBe(false);
    expect(ask.projects, "Projects is not in the reference header").toBe(false);
    expect(ask.settings, "Settings is not in the reference header").toBe(false);

    /*
     * AND THE OTHER SURFACES MUST BE UNTOUCHED BY IT.
     *
     * This is the assertion the whole variant exists to make true. Sales Flow
     * keeps the default gap, the full account row, the context band and its
     * detail tabs; if the Ask rules ever stop being keyed on the attribute,
     * this fails rather than a reviewer noticing months later.
     */
    for (const other of ["/alpha/northgate/flow", "/alpha/northgate/project"]) {
      await page.goto(other);
      await expect(page.locator('.irs-shell[data-variant="default"]')).toBeVisible();

      const kept = await page.evaluate(() => {
        const nav = document.querySelector(".irs-nav");
        return {
          navGap: nav === null ? null : getComputedStyle(nav).gap,
          signOutPill: document.querySelector(".irs-signout") !== null,
          context: document.querySelector(".ox-context") !== null,
          projects: document.querySelector('a[href="/projects"]') !== null,
          settings: document.querySelector('a[href^="/settings/ai"]') !== null,
        };
      });

      expect(kept.navGap, `${other} must keep the default nav gap`).toBe("24px");
      expect(kept.signOutPill, `${other} must not gain the Ask pill`).toBe(false);
      expect(kept.context, `${other} must keep its context band`).toBe(true);
      expect(kept.projects, `${other} must keep its Projects link`).toBe(true);
      expect(kept.settings, `${other} must keep its Settings link`).toBe(true);
    }
  });

  /**
   * The four screens the stopped run left behind, checked for safety only.
   *
   * They are FRONTEND IMPLEMENTED, VISUAL REVIEW PENDING. Nothing here judges
   * how they look; it asserts that they render, that they do not overflow, that
   * they raise no console error, and that the Ask redesign has not leaked into
   * them — which is the only question this correction had to answer about them.
   */
  const preserved: readonly {
    readonly name: string;
    readonly path: string;
    readonly openFirstRow?: boolean;
  }[] = [
    { name: "Briefing", path: "/alpha/northgate/showroom" },
    { name: "Units", path: "/alpha/northgate/units" },
    { name: "Meetings", path: "/alpha/northgate/meetings" },
    /*
     * Reached by opening a row rather than by a hand-written id. A meeting id
     * invented in a test is a test that passes against the not-found branch:
     * the first version of this used `ses_0001`, which does not exist, and the
     * screen it actually checked was the pre-meeting brief's empty state.
     */
    { name: "Meeting detail", path: "/alpha/northgate/meetings", openFirstRow: true },
  ];

  for (const screen of preserved) {
    test(`${screen.name} is unharmed`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "checked once");

      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(String(e)));

      await signInAs(page, "Petra Novák");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(screen.path);

      if (screen.openFirstRow === true) {
        const row = page.locator('a[href*="/meetings/"]').first();
        await expect(row).toBeVisible();
        await row.click();
        await page.waitForURL(/\/meetings\/.+/);
      }

      await expect(page.locator(".irs-shell")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await assertNoOverflow(page, `${screen.name} at 1440`);

      /* No Ask class may appear anywhere but the docked bar. */
      const leaked = await page.evaluate(() =>
        [...document.querySelectorAll('[class*="ask-"]')]
          .filter((e) => e.closest(".ask-dock") === null)
          .map((e) => (e.className || "").toString())
          .slice(0, 5),
      );
      expect(leaked, `Ask styles leaked into ${screen.name}: ${leaked.join(" | ")}`).toEqual([]);

      expect(errors, `${screen.name}: ${errors.join(" | ")}`).toEqual([]);
      await shoot(page, `PRESERVED-${screen.name.replace(/s+/g, "-")}-1440`);
    });
  }

  /* --- the side-by-side ------------------------------------------------- */

  test("writes the comparison sheet", async () => {
    test.skip(test.info().project.name !== "desktop", "written once");

    /*
     * Composited from the PNGs above rather than from two live frames. The
     * obvious version puts both in iframes and cannot work: every response from
     * this application carries `X-Frame-Options: DENY`, rightly, and the first
     * attempt at this in another review produced three white rectangles. Every
     * pixel here still came from the page it claims to show.
     */
    const embed = (file: string): string | null => {
      try {
        return `data:image/png;base64,${readFileSync(`${OUT}/${file}.png`).toString("base64")}`;
      } catch {
        return null;
      }
    };

    const pairs = [
      { label: "Idle · 1440", a: "REFERENCE-1440", b: "ASK-1440" },
      { label: "History · 1440", a: "REFERENCE-history-1440", b: "ASK-history-1440" },
      { label: "Idle · 390", a: "REFERENCE-390", b: "ASK-390" },
    ];

    const rows = pairs
      .map((pair) => {
        const left = embed(pair.a);
        const right = embed(pair.b);
        if (left === null && right === null) return "";
        const cell = (src: string | null, who: string): string =>
          src === null
            ? `<figure><figcaption>${who}</figcaption><div class="missing">not captured</div></figure>`
            : `<figure><figcaption>${who}</figcaption><img src="${src}" alt="${who}"></figure>`;
        return `<section><h2>${pair.label}</h2><div class="pair">${cell(left, "Reference")}${cell(right, "Implementation")}</div></section>`;
      })
      .join("");

    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      `${OUT}/compare.html`,
      `<!doctype html>
<meta charset="utf-8">
<title>Ask IRIS — reference beside implementation</title>
<style>
  body { margin:0; padding:28px; background:#02050d; color:#f4f7fc;
         font:14px/1.55 "Manrope", system-ui, sans-serif; }
  h1 { font-size:22px; font-weight:500; letter-spacing:-0.02em; margin:0 0 6px; }
  p.lede { color:#98a4b8; max-width:74ch; margin:0 0 30px; }
  h2 { font-size:12px; letter-spacing:.14em; text-transform:uppercase;
       color:#98a4b8; font-weight:600; margin:34px 0 12px; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start; }
  figure { margin:0; display:flex; flex-direction:column; gap:8px; }
  figcaption { font-size:12px; letter-spacing:.09em; text-transform:uppercase; color:#98a4b8; }
  img { width:100%; height:auto; display:block; border-radius:10px;
        border:1px solid rgb(130 150 185 / 16%); }
  .missing { padding:60px; text-align:center; color:#98a4b8;
             border:1px dashed rgb(130 150 185 / 26%); border-radius:10px; }
</style>
<h1>Ask IRIS — the delivered design beside what was built</h1>
<p class="lede">
  Left is the HTML export, served and rendered as delivered. Right is
  <code>/alpha/northgate/ask</code> in the application, signed in, reading the real
  synthetic project through the repository port. Three deliberate differences:
  Manrope rather than Inter, <code>#00A3FF</code> rather than <code>#2f97ff</code>, and
  the background grid and composer glow drawn as static CSS rather than as animated
  WebGL shaders from a CDN.
</p>
${rows}
`,
      "utf8",
    );
  });
});
