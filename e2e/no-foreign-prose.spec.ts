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

/*
 * A QUESTION WITH NO PREPARED ANSWER IS NOW ANSWERED, NOT REFUSED (2026-10-19).
 *
 * The owner wired typed questions to the analysis pipeline for the recorded
 * demonstration (ADR-0040): the read-only tools run against the project in
 * view and the answer is composed from what they return. The property this
 * file exists for is unchanged — no project speaks Northgate's scenario — and
 * it is now asserted on that answer once it has settled. A unit code is the
 * one marker that can be a project's own data rather than the scenario's:
 * Northgate's catalogue holds A-402, and a tool listing Northgate's own most
 * viewed units may name it. On Northgate, codes are therefore not markers.
 */
const SETTLED = '.ask-trace[data-settled="true"]';
const UNIT_CODE = /^[A-Z]-\d{3}$/;

/*
 * Northgate is on the list too since its own script was retired (R01-2, Máté
 * 2026-10-02): no project speaks the scenario, its own included.
 */
const ELSEWHERE = [
  { who: "Monika Kováčová", root: "/alpha/northgate", name: "Northgate Residences" },
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
    test(`${who} · ${root} · "${question}": answered from its own read models, not in Northgate's words`, async ({
      page,
    }) => {
      await signIn(page, who);
      await page.goto(`${root}/ask?q=${encodeURIComponent(question)}`);
      const main = page.locator("main");
      await expect(main.locator(SETTLED)).toBeVisible({ timeout: 20_000 });
      await expect(main.getByText(REFUSAL)).toHaveCount(0);
      /* The page echoes the question back; those are the reader's words, not the project's. */
      const served = (await main.innerText()).split(question).join(" ");
      const words = await northgateWordsIn(served);
      expect(
        root === "/alpha/northgate" ? words.filter((w) => !UNIT_CODE.test(w)) : words,
      ).toEqual([]);
    });
  }
}

/*
 * Guards the guard: a computed question is still answered, or a refusal
 * everywhere would pass above. Northgate's scripted answer was this anchor
 * until the script was retired (R01-2, Máté 2026-10-02).
 */
test("Monika Kováčová · /alpha/northgate: a computed question is still answered", async ({
  page,
}) => {
  await signIn(page, "Monika Kováčová");
  await page.goto(
    `/alpha/northgate/ask?q=${encodeURIComponent("How many presentations were recorded, and how did they end?")}`,
  );
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: "Open the meetings" }).first()).toBeVisible();
  await expect(main.getByText(REFUSAL)).toHaveCount(0);
  /* Answered from the prepared session, not sent through the analysis pipeline. */
  await expect(main.locator(".ask-trace")).toHaveCount(0);
});
