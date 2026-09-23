import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * EVERY LINK A READ MODEL BUILT CARRIES THE PERIOD THE READER CHOSE.
 *
 * P2-16's first clause keeps the scope from a list to its detail and back, and
 * the period is part of the scope everywhere. The rule this spec holds: a page
 * opened with `period=last_28_days` hands the reader no link into the project
 * that drops it. The default period is the one `withPeriod` omits, so the test
 * uses another: a dropped period and a default one would otherwise look alike.
 *
 * Photographed on 2026-09-23 before the fix: 588 such links across three roles
 * and four projects — the ranked bars on Agents and Sales Flow, every finding's
 * evidence and next step, Sales Flow's rings and changes, every Audience row,
 * two of Project's own links, every link on the overviews and the brief (drawn
 * by the UI package's components, which knew nothing of periods), and the Ask
 * answers' evidence and action.
 *
 * NOT IN THIS RULE, deliberately: `segment` (Project) and `window` (Sales Flow)
 * are not carried. The DoD names search, period, project and paging place, and
 * neither of these two; carrying them is a separate decision.
 */

const PERIOD = "period=last_28_days";
const ASK = (question: string) => `ask?q=${encodeURIComponent(question)}`;

const PAGES: readonly { who: string; path: string }[] = [
  ...[
    "/alpha/ister-tower/agents",
    "/alpha/northgate/agents/agt_lucia",
    "/alpha/northgate/audience",
    "/alpha/ister-tower/flow",
    "/alpha/northgate/flow",
    "/alpha/northgate/project",
    "/alpha/northgate/presentation",
    "/alpha/northgate/showroom",
    "/alpha/northgate/units",
    "/alpha/northgate/units/A-402",
    "/alpha/northgate/meetings",
    "/alpha/northgate/meetings/mtg_ng0132",
    "/alpha/northgate/overview",
    "/alpha/northgate/meetings/mtg_viktoria0827",
    `/alpha/northgate/${ASK("Which available two-bedroom apartments have the strongest verified interest?")}`,
    `/alpha/northgate/${ASK("Why did demand fall this quarter?")}`,
    "/beta/kingsford/flow",
  ].map((path) => ({ who: "Tomáš Varga", path })),
  /* The agent's own overview is a different read model from the executive one. */
  { who: "Monika Kováčová", path: "/alpha/northgate/overview" },
];

/** Links inside the page to this or another project that do not carry the period. */
async function droppingThePeriod(page: Page): Promise<string[]> {
  return page.locator("main a[href]").evaluateAll(
    (anchors, period) =>
      anchors
        .map((a) => ({
          text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
          href: a.getAttribute("href") ?? "",
        }))
        .filter(
          ({ href }) =>
            /^\/[a-z0-9-]+\/[a-z0-9-]+(\/|\?|$)/.test(href) &&
            !/^\/(madspace|settings|lab|design-lab|projects|sign-in)\b/.test(href) &&
            !href.includes(period),
        )
        .map(({ text, href }) => `${text} → ${href}`),
    PERIOD,
  );
}

for (const { who, path } of PAGES) {
  test(`${who} · ${path}: every project link carries the period`, async ({ page }) => {
    await signIn(page, who);
    await page.goto(`${path}${path.includes("?") ? "&" : "?"}${PERIOD}`);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");

    /* Guards the guard: a page with no project links proves nothing about them. */
    const links = await page.locator("main a[href^='/']").count();
    expect(links, "the page drew no internal link at all").toBeGreaterThan(0);

    expect(await droppingThePeriod(page)).toEqual([]);
  });
}
