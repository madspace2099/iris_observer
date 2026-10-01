import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "@playwright/test";
import { signInAs } from "../../e2e/sign-in";
import { LANGUAGES, PAGES, VIEWER, withLanguage } from "./pages";

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

const OUT = resolve(
  process.env["P217_DUMP_DIR"] ?? join(import.meta.dirname, "../../_review/meres1/dump"),
);

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
