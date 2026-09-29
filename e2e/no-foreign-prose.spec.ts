import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * NO PROJECT SPEAKS ANOTHER PROJECT'S PROSE — the scripted Ask session.
 *
 * The prepared Ask answers are Northgate's scenario: its figures ("viewings
 * held at 46", "offers fell from 17 to 12"), its unit A-505, its buyer, and its
 * framing ("south-facing units", "floors 4 to 6"). They were served to every
 * synthetic project. A crawl of every project with every account on 2026-09-24
 * found 31 surface pairs doing it, all from one source — the third instance of
 * the leak the brief and the agent overview were gated for.
 *
 * Refusal is asserted by what renders, never by a status (rule 28): the
 * not-found boundary in this application answers 200 under streaming. A
 * Northgate-only question on another project must draw the Ask screen's own
 * refusal — "That is not a question Observer can answer from this project's
 * read models today." — and none of Northgate's words.
 */

const MARKERS = [
  "Viktória",
  "Halász",
  "A-505",
  "A-402",
  "viewings held at 46",
  "Offers fell from 17 to 12",
  "South-facing units draw",
  "the two-room finding",
  "three stalled offers",
  "Intent signals expire after 21 days",
];

const NORTHGATE_ONLY = [
  "Why did demand fall this quarter?",
  "Which available two-bedroom apartments have the strongest verified interest?",
  "Which prospects should the sales team contact this week?",
  "Prepare me for Viktória's meeting.",
  "Which apartment attributes are gaining demand?",
  "Create a one-page report for tomorrow's management meeting.",
];

const REFUSAL = "That is not a question Observer can answer from this project’s read models today.";

const ELSEWHERE = [
  { who: "Petra Novák", root: "/alpha/riverside", name: "Riverside Walk" },
  { who: "Tomáš Varga", root: "/beta/kingsford", name: "Kingsford Yard" },
  { who: "Martin Kováč", root: "/alpha/ister-tower", name: "ISTER TOWER" },
] as const;

async function northgateWordsIn(text: string): Promise<string[]> {
  return MARKERS.filter((marker) => text.includes(marker));
}

for (const { who, root, name } of ELSEWHERE) {
  test(`${who} · ${root}/ask: no prose from Northgate's scenario on the landing`, async ({
    page,
  }) => {
    await signIn(page, who);
    await page.goto(`${root}/ask`);
    const main = page.locator("main");
    /* The landing rendered, for this project: its composer is labelled with the project's own name. */
    await expect(main.getByText(`Ask IRIS about ${name}`).first()).toBeVisible();
    expect(await northgateWordsIn(await main.innerText())).toEqual([]);
  });

  for (const question of NORTHGATE_ONLY) {
    test(`${who} · ${root} · "${question}": refused by its rendered boundary, not answered in Northgate's words`, async ({
      page,
    }) => {
      await signIn(page, who);
      await page.goto(`${root}/ask?q=${encodeURIComponent(question)}`);
      const main = page.locator("main");
      await expect(main.getByText(REFUSAL)).toBeVisible();
      /* The page echoes the question back; those are the reader's words, not the project's. */
      const served = (await main.innerText()).split(question).join(" ");
      expect(await northgateWordsIn(served)).toEqual([]);
    });
  }
}

/* Guards the guard: Northgate keeps its scenario, or a refusal everywhere would pass above. */
test("Monika Kováčová · /alpha/northgate: Northgate still answers its own prepared question", async ({
  page,
}) => {
  await signIn(page, "Monika Kováčová");
  await page.goto(`/alpha/northgate/ask?q=${encodeURIComponent("Prepare me for Viktória's meeting.")}`);
  const main = page.locator("main");
  await expect(main.getByText(/Three visits in three weeks/)).toBeVisible();
  await expect(main.getByText(REFUSAL)).toHaveCount(0);
});
