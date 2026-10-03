import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * THE ACCESSIBILITY CONTRACT, ON THE MAIN SCREENS (P2-ZARAS, 2026-10-03).
 *
 * `design-lab-a11y.spec.ts` holds five clauses on the design lab's routes only.
 * The product's own screens had parts of them in four other specs — the sign-in
 * form from the keyboard (`sign-in-baseline`), the mobile sheet's trap
 * (`mobile-menu-containment`), axe on the portal (`portal-quality`), the Ask
 * scope control (`ask-iris-scope`) — and none on the analytical screens a
 * reader spends their time on. This holds the same five there:
 *
 *   1. keyboard reach  every control a reader can see is reached by Tab, in the
 *                      order the eye reads it;
 *   2. focus           the focused control always shows where it is;
 *   3. reading order   the DOM reads in the order the page is painted;
 *   4. pop-ups         an open menu or panel keeps Tab from landing beneath it,
 *                      and Escape closes it and gives focus back to its trigger;
 *   5. announcement    a change of state is spoken: a live region says what the
 *                      page now shows.
 *
 * Table-driven, the discipline of `fixed-covers-nothing.spec.ts`: one measured
 * assertion per test, so a red run names the surface, the clause and what was
 * found. The report keeps four clauses: its words are trilingual product
 * language, so an announcement there needs words nobody has written yet.
 *
 * Desktop only, checked once. The reading-order clause narrows the viewport to
 * a phone inside its test, where one column makes the painted order the
 * reading order without a judgement about columns.
 */

const ROOT = "/alpha/northgate";
const VIEWER = "Tomáš Varga";

interface Popup {
  readonly name: string;
  /** The control that opens it. */
  readonly trigger: string;
  /** How the open thing is found from its trigger, and whether it is open. */
  readonly kind: "details" | "expanded" | "dialog";
}

interface Surface {
  readonly key: string;
  readonly path: string;
  readonly popups: readonly Popup[];
  /** Changes the page's state and returns words the change must be announced with; null where the clause does not apply. */
  readonly change: ((page: Page) => Promise<string>) | null;
}

const PERIOD: Popup = {
  name: "the period menu",
  trigger: '.ox-context summary.ox-menu-button[aria-label="Period"]',
  kind: "details",
};
/*
 * Not every <details> is a pop-up. The registers' column chooser, "Show all"
 * and "How to read this" open in the flow of the page and push what follows
 * down; nothing is beneath them, so Tab walking on to the next control is the
 * reading order, not an escape. The chooser was on this list once, and the
 * change made to satisfy it broke a press on the density buttons beside it
 * (reverted in a25c222). Only panels drawn over the page are listed here.
 */

/** Picks a period from the shell's period menu: the change every analytical screen shares. */
async function changePeriod(page: Page): Promise<string> {
  await page.locator(PERIOD.trigger).click();
  const row = page
    .locator(".ox-context details.ox-menu[open] .ox-menu-panel a")
    .filter({ hasText: "Last 28 days" })
    .first();
  await row.click();
  await page.waitForURL(/period=last_28_days/);
  return "Last 28 days";
}

/** Submits a register's filter bar with the first non-default option of one select; returns the count it then shows. */
async function filterRegister(page: Page, field: string): Promise<string> {
  const select = page.locator(`form.ox-filters select[name="${field}"]`);
  const value = await select.evaluate(
    (el) => [...(el as HTMLSelectElement).options].map((o) => o.value).find((v, i) => i > 0) ?? "",
  );
  await select.selectOption(value);
  await page.locator("form.ox-filters button[type=submit]").click();
  await page.waitForURL(new RegExp(`${field}=`));
  await page.waitForLoadState("networkidle");
  return ((await page.locator(".ox-filters-count").textContent()) ?? "").trim();
}

const SURFACES: readonly Surface[] = [
  {
    key: "Briefing",
    path: `${ROOT}/showroom`,
    popups: [PERIOD],
    change: changePeriod,
  },
  {
    key: "Sales Flow",
    path: `${ROOT}/flow`,
    popups: [
      PERIOD,
      { name: "a figure's explanation", trigger: ".iris-kpi button.iris-measure-info", kind: "expanded" },
    ],
    change: async (page) => {
      await page.getByRole("link", { name: "Last 7 days", exact: true }).click();
      await page.waitForURL(/window=week/);
      return "Last 7 days";
    },
  },
  {
    key: "Project",
    path: `${ROOT}/project`,
    popups: [
      PERIOD,
      { name: "the export dialog", trigger: 'main button[aria-haspopup="dialog"]', kind: "dialog" },
    ],
    change: async (page) => {
      const tab = page.locator('[role="tablist"][aria-label="Unit segment"] [role="tab"][aria-selected="false"]').first();
      const label = ((await tab.textContent()) ?? "").trim();
      await tab.click();
      await page.waitForURL(/segment=/);
      return label;
    },
  },
  {
    key: "Units",
    path: `${ROOT}/units`,
    popups: [PERIOD],
    change: (page) => filterRegister(page, "status"),
  },
  {
    key: "Meetings",
    path: `${ROOT}/meetings`,
    popups: [PERIOD],
    change: (page) => filterRegister(page, "agent"),
  },
  {
    key: "Features",
    path: `${ROOT}/features`,
    popups: [PERIOD],
    change: async (page) => {
      await page.getByRole("navigation", { name: "Features", exact: true }).getByRole("link", { name: "Core", exact: true }).click();
      await page.waitForURL(/view=core/);
      return "Core";
    },
  },
  {
    key: "Sales Agents",
    path: `${ROOT}/agents`,
    popups: [PERIOD],
    change: async (page) => {
      await page.getByRole("tab", { name: "Coaching", exact: true }).click();
      await page.waitForURL(/view=coaching/);
      return "Coaching";
    },
  },
  {
    key: "Ask",
    path: `${ROOT}/ask`,
    popups: [
      { name: "the model picker", trigger: 'summary[aria-label="Model"]', kind: "details" },
      { name: "the scope picker", trigger: 'summary[aria-label="Which project this question is about"]', kind: "details" },
    ],
    change: async (page) => {
      const question = "Which apartments were opened most?";
      const field = page.locator(".ask-page").getByPlaceholder("Ask IRIS…");
      await field.fill(question);
      await field.press("Enter");
      await page.waitForURL(/[?&]q=/);
      return question;
    },
  },
  {
    key: "Report",
    path: `${ROOT}/report`,
    popups: [PERIOD],
    change: null,
  },
];

/* --- the measurements ------------------------------------------------------ */

async function open(page: Page, path: string): Promise<void> {
  await signIn(page, VIEWER);
  await page.goto(path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
}

interface Stop {
  readonly n: number | null;
  readonly what: string;
  readonly ringed: boolean;
}

/**
 * Marks every control a reader can see and reach, then walks the page with Tab
 * until focus comes back round, recording each stop and whether it showed
 * where it was. "Showed" is measured as a difference: the control and its
 * three nearest ancestors are read focused and then blurred, and some outline,
 * shadow, border, background or underline must change. A ring drawn on a card
 * around a field (`:has(:focus-visible)`) counts; a ring that is always there
 * does not.
 */
async function walk(page: Page): Promise<{ marked: { n: number; what: string; top: number; left: number; right: number }[]; stops: Stop[] }> {
  const marked = await page.evaluate(() => {
    const SELECTOR = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]';
    const out: { n: number; what: string; top: number; left: number; right: number }[] = [];
    let n = 0;
    /*
     * A natively interactive element a reader can see is owed a Tab stop even
     * when someone set tabindex="-1" on it — that is the regression this
     * clause exists to catch. Anything else counts only where it opted in.
     */
    const NATIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary';
    for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
      if (!el.matches(NATIVE) && el.tabIndex < 0) continue;
      if ((el as HTMLButtonElement).disabled) continue;
      if (el.closest("[inert], [aria-hidden='true']") !== null) continue;
      /*
       * `checkVisibility`, not the computed style: the rows of a closed
       * `<details>` keep `display: block` and `visibility: visible` and are
       * hidden by `content-visibility`, which only this sees.
       */
      if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: false })) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      el.dataset["a11yN"] = String(n);
      const text = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      out.push({ n, what: `${el.tagName.toLowerCase()} «${text}»`, top: r.top + window.scrollY, left: r.left, right: r.right });
      n += 1;
    }
    return out;
  });

  const stops: Stop[] = [];
  let first: string | null = null;
  for (let i = 0; i < marked.length + 25; i += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el === null || el === document.body) return null;
      const chain: Element[] = [];
      for (let e: Element | null = el; e !== null && chain.length < 4; e = e.parentElement) chain.push(e);
      const read = () =>
        chain
          .map((e) => {
            const s = getComputedStyle(e);
            return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine].join("|");
          })
          .join("#");
      const focused = read();
      el.blur();
      const blurred = read();
      el.focus({ preventScroll: true });
      const n = el.dataset["a11yN"];
      const text = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return { n: n === undefined ? null : Number(n), what: `${el.tagName.toLowerCase()} «${text}»`, ringed: focused !== blurred };
    });
    if (stop === null) continue;
    const key = `${String(stop.n)}${stop.what}`;
    if (first === null) first = key;
    else if (key === first) break;
    stops.push(stop);
  }
  return { marked, stops };
}

/** Every DOM-ordered pair of text blocks on the page that is painted the other way up. */
async function readingInversions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector("main") ?? document.body;
    const blocks = [...root.querySelectorAll<HTMLElement>("*")].filter((el) => {
      const s = getComputedStyle(el);
      if (s.display.startsWith("inline") || s.display === "none" || s.display === "contents") return false;
      if (s.position === "fixed" || s.position === "absolute") return false;
      /* A chart is one image to a reader (role=img); its axis labels are drawn, not read. */
      if (el.closest("svg") !== null) return false;
      if (el.closest('[role="dialog"], dialog, details:not([open]) > :not(summary), [aria-hidden="true"]') !== null) return false;
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && (c.textContent ?? "").trim().length > 0);
      const r = el.getBoundingClientRect();
      return own && r.width > 1 && r.height > 1;
    });
    const found: string[] = [];
    for (let i = 1; i < blocks.length; i += 1) {
      const a = blocks[i - 1]!.getBoundingClientRect();
      const b = blocks[i]!.getBoundingClientRect();
      /* b is read after a but painted above it, in the same column. */
      if (b.bottom <= a.top + 4 && b.left < a.right) {
        const name = (el: HTMLElement) => `${el.tagName.toLowerCase()} «${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30)}»`;
        found.push(`${name(blocks[i]!)} painted above ${name(blocks[i - 1]!)}`);
      }
    }
    return found;
  });
}

/** Records the text of every live region whenever it changes, from the first byte of each document. */
const LIVE_RECORDER = `(() => {
  window.__a11yLive = [];
  const live = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const l = el.getAttribute("aria-live");
    const r = el.getAttribute("role");
    return (l !== null && l !== "off") || r === "status" || r === "alert" || r === "log";
  };
  const region = (node) => {
    for (let el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement) if (live(el)) return el;
    return null;
  };
  const note = (el) => {
    const t = (el.textContent || "").trim();
    if (t) window.__a11yLive.push(t);
  };
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      const r = region(m.target);
      if (r) note(r);
      for (const added of m.addedNodes) if (added.nodeType === 1 && added.getAttribute("role") === "alert") note(added);
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

/** Text the live regions took on since `mark`, with the route announcer's own text alongside. */
async function spokenSince(page: Page, mark: number): Promise<string> {
  return page.evaluate((from) => {
    const log = ((window as unknown as { __a11yLive?: string[] }).__a11yLive ?? []).slice(from);
    const announcer = document.querySelector("next-route-announcer")?.shadowRoot?.querySelector("#__next-route-announcer__");
    return [...log, (announcer?.textContent ?? "").trim()].filter((t) => t.length > 0).join(" | ");
  }, mark);
}

/* --- the contract ---------------------------------------------------------- */

test.beforeEach(({ isMobile }, testInfo) => {
  test.skip(isMobile || testInfo.project.name !== "desktop", "checked once, at the desktop width");
});

for (const surface of SURFACES) {
  test.describe(`${surface.key}: the accessibility contract`, () => {
    test(`1 · ${surface.key}: every visible control is reached by Tab, in reading order`, async ({ page }) => {
      await open(page, surface.path);
      const { marked, stops } = await walk(page);
      const reached = new Set(stops.map((s) => s.n));
      const problems = marked.filter((m) => !reached.has(m.n)).map((m) => `not reached: ${m.what}`);
      const at = new Map(marked.map((m) => [m.n, m]));
      for (let i = 1; i < stops.length; i += 1) {
        const a = at.get(stops[i - 1]!.n ?? -1);
        const b = at.get(stops[i]!.n ?? -1);
        /* Going back up within the same column is a jump the eye does not make. */
        if (a !== undefined && b !== undefined && b.top + 8 < a.top && b.left + 8 < a.right) {
          problems.push(`order: ${b.what} after ${a.what}, though painted above it`);
        }
      }
      expect(problems, `${surface.key}: keyboard reach`).toEqual([]);
    });

    test(`2 · ${surface.key}: the focused control always shows where it is`, async ({ page }) => {
      await open(page, surface.path);
      const { stops } = await walk(page);
      expect(stops.length, `${surface.key}: Tab reached nothing`).toBeGreaterThan(3);
      expect(
        stops.filter((s) => !s.ringed).map((s) => s.what),
        `${surface.key}: focus with no visible indicator`,
      ).toEqual([]);
    });

    test(`3 · ${surface.key}: the DOM reads in the order the phone paints it`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, surface.path);
      expect(await readingInversions(page), `${surface.key} at 390: reading order`).toEqual([]);
    });

    for (const popup of surface.popups) {
      test(`4 · ${surface.key}: ${popup.name} keeps Tab out from beneath it, and Escape gives focus back`, async ({
        page,
      }) => {
        await open(page, surface.path);
        const trigger = page.locator(popup.trigger).first();
        await expect(trigger, `${surface.key}: ${popup.name} is on the page`).toBeVisible();
        const problems: string[] = [];

        const state = () =>
          page.evaluate(
            ({ selector, kind }) => {
              const t = document.querySelector(selector) as HTMLElement;
              const box =
                kind === "details"
                  ? t.closest("details")
                  : kind === "dialog"
                    ? document.querySelector('[role="dialog"], dialog[open]')
                    : t.closest(".iris-measure");
              const open =
                kind === "details"
                  ? (box as HTMLDetailsElement | null)?.open === true
                  : kind === "dialog"
                    ? box !== null && (box as HTMLElement).getBoundingClientRect().height > 0
                    : t.getAttribute("aria-expanded") === "true";
              const active = document.activeElement;
              return {
                open,
                inside: box !== null && active !== null && (box.contains(active) || active === t),
                onTrigger: active === t,
                where: active === null ? "nothing" : `${active.tagName.toLowerCase()} «${(active.textContent ?? "").trim().slice(0, 30)}»`,
              };
            },
            { selector: popup.trigger, kind: popup.kind },
          );

        await trigger.focus();
        await page.keyboard.press("Enter");
        if (!(await state()).open) problems.push("Enter on the trigger did not open it");

        for (let i = 0; i < 12; i += 1) {
          await page.keyboard.press("Tab");
          const s = await state();
          if (!s.open) break;
          if (!s.inside) {
            problems.push(`Tab ${i + 1} landed beneath the open ${popup.name}: ${s.where}`);
            break;
          }
        }

        if (!(await state()).open) {
          await trigger.focus();
          await page.keyboard.press("Enter");
        }
        /* Escape from inside the panel where it holds a control, else from its trigger. */
        await page.evaluate(
          ({ selector, kind }) => {
            const t = document.querySelector(selector) as HTMLElement;
            const box =
              kind === "details"
                ? t.closest("details")
                : kind === "dialog"
                  ? document.querySelector('[role="dialog"], dialog[open]')
                  : t.closest(".iris-measure");
            const inside = [
              ...(box?.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea") ?? []),
            ].find((el) => el !== t && el.checkVisibility());
            (inside ?? t).focus();
          },
          { selector: popup.trigger, kind: popup.kind },
        );
        await page.keyboard.press("Escape");
        const after = await state();
        if (after.open) problems.push("Escape did not close it");
        if (!after.onTrigger) problems.push(`Escape left focus on ${after.where}, not on the trigger`);

        expect(problems, `${surface.key}: ${popup.name}`).toEqual([]);
      });
    }

    if (surface.change !== null) {
      const change = surface.change;
      test(`5 · ${surface.key}: a change of state is announced`, async ({ page }) => {
        await page.addInitScript(LIVE_RECORDER);
        await open(page, surface.path);
        const mark = await page.evaluate(() => {
          const w = window as unknown as { __a11yLive?: string[]; __a11yBefore?: boolean };
          w.__a11yBefore = true;
          return (w.__a11yLive ?? []).length;
        });
        const words = await change(page);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(600);
        /* A client navigation keeps the window and its log; a full page load starts both afresh. */
        const sameWindow = await page.evaluate(
          () => (window as unknown as { __a11yBefore?: boolean }).__a11yBefore === true,
        );
        const spoken = await spokenSince(page, sameWindow ? mark : 0);
        expect(spoken, `${surface.key}: nothing announced the change to «${words}»`).toContain(words);
      });
    }
  });
}
