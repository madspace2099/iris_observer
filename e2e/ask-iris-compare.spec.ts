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
        settings: document.querySelector('a[href="/settings/ai"]') !== null,
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
          settings: document.querySelector('a[href="/settings/ai"]') !== null,
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
