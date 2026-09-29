import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * NO LINK GOES TO A PERSON PAGE, BECAUSE THERE IS NONE — measured on the page.
 *
 * `packages/synthetic/test/no-person-route.test.ts` proves the read models no
 * longer carry a route to `/people`. This proves what the reader is handed:
 * a read model's empty route can still become `<a href="">`, and a missing
 * one became `href="#"` in the brief (`contactHref ?? "#"`), which a source
 * test cannot see.
 *
 * Each page below carried such links on 2026-09-23 — 94 anchors across the
 * three executive overviews, the agent overview, the brief and two prepared
 * Ask answers. Where an ACTION went, the page now says so in words ("… — no
 * surface for this yet"), because a link that vanishes silently leaves the
 * reader not knowing a next step was ever named.
 */

const ASK = (question: string) => `ask?q=${encodeURIComponent(question)}`;

const PAGES: readonly { who: string; path: string; says?: string }[] = [
  {
    who: "Petra Novák",
    path: "/alpha/northgate/overview",
    says: "Open the buyer — no surface for this yet",
  },
  { who: "Petra Novák", path: "/alpha/riverside/overview" },
  { who: "Tomáš Varga", path: "/beta/kingsford/overview" },
  { who: "Monika Kováčová", path: "/alpha/northgate/overview" },
  {
    who: "Monika Kováčová",
    path: "/alpha/northgate/meetings/mtg_viktoria0827",
    says: "Open the full timeline — no surface for this yet",
  },
  {
    who: "Monika Kováčová",
    path: `/alpha/northgate/${ASK("Which prospects should the sales team contact this week?")}`,
    says: "Open the follow-up list — no surface for this yet",
  },
  {
    who: "Monika Kováčová",
    path: `/alpha/northgate/${ASK("Prepare me for Viktória's meeting.")}`,
  },
];

/** Anchors that go to the people route, to "#", or nowhere at all. */
async function guessingLinks(page: Page): Promise<string[]> {
  return page.locator("main a").evaluateAll((anchors) =>
    anchors
      .map((a) => ({
        text: (a.textContent ?? "").replace(/\s+/g, " ").trim(),
        href: a.getAttribute("href"),
      }))
      .filter(
        ({ href }) =>
          href === null || href === "" || href === "#" || /\/people(?:[?#]|$)/.test(href),
      )
      .map(({ text, href }) => `${text} → ${JSON.stringify(href)}`),
  );
}

for (const { who, path, says } of PAGES) {
  test(`${who} · ${path}: no link to a person page that does not exist`, async ({ page }) => {
    await signIn(page, who);
    await page.goto(path);
    /* The page's own heading or answer, so the anchors are read from a rendered page. */
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");

    expect(await guessingLinks(page)).toEqual([]);
    if (says !== undefined) {
      await expect(page.locator("main").getByText(says, { exact: false })).toBeVisible();
    }
  });
}
