import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "@playwright/test";
import { signInAs } from "../../e2e/sign-in";

/**
 * P2-17: THE REPORT PAGES AS THEY RENDER, IN EACH LANGUAGE (MERES1, 2026-10-01).
 *
 * The dump the 101 sentences and 257 labels were cut from (2026-09-27) was made
 * by a tool that was never committed. This is that tool, in the same shape:
 * one file per language, keyed by "<viewer> <path>", each page's `url`,
 * `status`, `lang` and the body's `innerText`. `compare.ts` reads it.
 *
 * It renders what the product renders and reads nothing else: no read model,
 * no word table, no source file. It runs on the end-to-end suite's own server
 * and harness environment (`playwright.p217.config.ts`).
 *
 *   pnpm exec playwright test -c scripts/p217/playwright.p217.config.ts
 *
 * Written to `P217_DUMP_DIR`, or `_review/meres1/dump` (gitignored).
 */

/** The eleven pages of the 09-27 dump, by the key the approval sheets use. */
export const PAGES = [
  "petra /alpha/northgate/report",
  "petra /alpha/northgate/report?period=year_to_date",
  "petra /alpha/northgate/report?period=last_28_days",
  "petra /alpha/riverside/report",
  "petra /alpha/ister-tower/report",
  "tomas /alpha/northgate/report",
  "tomas /alpha/northgate/report?agent=agt_akhilesh",
  "tomas /alpha/northgate/report?meeting=mtg_ng0132",
  "tomas /alpha/ister-tower/report",
  "tomas /alpha/ister-tower/report?agent=observer-review-harness",
  "tomas /alpha/ister-tower/report?meeting=d4c6a9e1-228c-460c-ab3e-2c235ff2de79",
] as const;

const VIEWER = { petra: "Petra Novák", tomas: "Tomáš Varga" } as const;
const LANGUAGES = ["en", "sk", "hu"] as const;
const OUT = resolve(
  process.env["P217_DUMP_DIR"] ?? join(import.meta.dirname, "../../_review/meres1/dump"),
);

/** English is the page as addressed; the others carry `lang`, as the export dialog writes it. */
const withLanguage = (path: string, language: string): string =>
  language === "en" ? path : `${path}${path.includes("?") ? "&" : "?"}lang=${language}`;

test("dumps the eleven report pages in three languages", async ({ page }) => {
  test.setTimeout(PAGES.length * LANGUAGES.length * 30_000);
  mkdirSync(OUT, { recursive: true });
  const dump: Record<
    string,
    Record<string, { url: string; status: number; lang: string; text: string }>
  > = { en: {}, sk: {}, hu: {} };

  let signedIn: keyof typeof VIEWER | null = null;
  for (const key of PAGES) {
    const [who, path] = key.split(" ") as [keyof typeof VIEWER, string];
    if (signedIn !== who) {
      await page.context().clearCookies();
      await signInAs(page, VIEWER[who]);
      signedIn = who;
    }
    for (const language of LANGUAGES) {
      const url = withLanguage(path, language);
      const response = await page.goto(url, { waitUntil: "networkidle" });
      /* As strings and locators: the scripts are checked without the DOM library. */
      await page.evaluate("document.fonts.ready.then(() => true)");
      const text = await page.locator("body").innerText();
      (dump[language] as Record<string, unknown>)[key] = {
        url,
        status: response?.status() ?? 0,
        lang: language,
        text,
      };
    }
  }
  for (const language of LANGUAGES) {
    writeFileSync(join(OUT, `${language}.json`), JSON.stringify(dump[language], null, 1));
  }
});
