import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./sign-in";
import { LANGUAGES, PAGES, VIEWER, withLanguage } from "../scripts/p217/pages";
import * as reportWords from "../apps/web/src/components/report/words";
import * as readmodelWords from "../packages/readmodels/src/words";

/**
 * NO ENGLISH LINE IN A SLOVAK OR HUNGARIAN REPORT THAT THE PRODUCT COULD HAVE LOCALISED (SHELL1).
 *
 * The report body is written in the language `?lang=` asks for; the frame
 * around it — the header, the navigation, the period, the data marker — was
 * not, and nothing measured it. On 2026-10-01 eleven report pages showed 29
 * lines identical in all three languages, among them "Demo data" in the frame
 * a few lines above "Demo údaje" in the body.
 *
 * WHY AN END-TO-END TEST AND NOT A STEP IN THE DUMP. The dump is a measuring
 * instrument run by hand (`pnpm p217:dump`), and whatever reads its output only
 * fails when someone runs it. A spec is in the gate every CI run already
 * executes, renders the same pages on the same server with the same harness,
 * and fails the build — which is what a measurement with teeth means here.
 *
 * WHAT IT COLLECTS. Every line of a page's `innerText` that is the same, at
 * the same position, in English and in the language asked for, and carries at
 * least three letters. Each language is compared with English on its own, so
 * a line English in Slovak alone is still caught; on 2026-10-01 that rule and
 * "identical in all three" collected the same 29 lines. Every collected line
 * is then one of three things:
 *
 *  - (a) ALLOWED: on `ALLOWED`, with the reason it is the same in every language;
 *  - (b) A PROVEN DEFECT: the product already has the localised form — the same
 *    English line shows a different text elsewhere on the same page, or a word
 *    table holds a record whose English is this line and whose form in this
 *    language is not, unless `NOT_PROOF` names that record a homonym. The test
 *    FAILS on it;
 *  - (c) MÁTÉ'S DECISION: on `DECIDED_BY_MATE`, a question in
 *    `_review/shell1/kerdesek-keret.md`. Printed, never failed on.
 *
 * Anything else is unclassified and FAILS: a new English line has to be put
 * in one of the three by a person, not pass because nobody looked.
 *
 * It runs on the desktop project: the frame's text is the same at every
 * width the product draws a header at, and 33 report renders per project is
 * the cost of the measurement, not of a page.
 */

type Rule = { readonly line: string | RegExp; readonly why: string };

/** (a) The same in every language because it is a name, not a word. */
const ALLOWED: readonly Rule[] = [
  { line: "BY MADSPACE", why: "The company's mark beside the IRIS wordmark, a brand name." },
  { line: "Northgate Residences", why: "A synthetic project's proper name." },
  { line: "Riverside Walk", why: "A synthetic project's proper name." },
  { line: "ISTER TOWER", why: "A project's proper name." },
  { line: "Alpha Estates", why: "A synthetic developer's proper name." },
  { line: "Petra Novák", why: "A synthetic account's name, shown as the reader's own." },
  { line: "Tomáš Varga", why: "A synthetic account's name, shown as the reader's own." },
  { line: "Akhilesh Undev", why: "A synthetic agent's name, the subject of an agent report." },
  { line: "Lucia Bartošová", why: "A synthetic agent's name, listed in a report." },
];

/** (c) English today; whether to localise it or keep it is Máté's to say (`kerdesek-keret.md`). */
const DECIDED_BY_MATE: readonly Rule[] = [
  { line: "Skip to content", why: "the skip link at the top of every page" },
  { line: "ASK IRIS", why: "the first navigation item" },
  { line: "Sales Flow", why: "a navigation item" },
  { line: "Project", why: "a navigation item" },
  { line: "Projects", why: "the account controls' way to the project list" },
  { line: "Settings", why: "the account controls' way to the settings" },
  { line: "Sign out", why: "the account controls' sign-out" },
  { line: "Developer", why: "the reader's role beside their name" },
  { line: "Agency manager", why: "the reader's role beside their name" },
  { line: /^Ask IRIS about .+$/, why: "the prompt bar at the foot of every page" },
  { line: "This isn’t here", why: "the not-found page's heading" },
  {
    line: /^The address may be mistyped, or point at a unit, an agent or a conversation that has since changed\./,
    why: "the not-found page's explanation",
  },
];

/**
 * Word-table records that share an English line with the frame and are not
 * its localised form: a homonym proves nothing. Each says whose record it is.
 */
const NOT_PROOF: readonly Rule[] = [
  {
    line: "Project",
    why: "The agent report's buyers-table column (`buyersColumns[3]`), not the navigation item.",
  },
];

const matches = (rules: readonly Rule[], line: string): Rule | undefined =>
  rules.find((rule) => (typeof rule.line === "string" ? rule.line === line : rule.line.test(line)));

/**
 * Every English → localised pair the word tables hold, by walking each export
 * that is written per language (`{ en, sk, hu }`) in parallel. A table added
 * later is read without being listed here.
 */
function wordTable(): Map<string, Map<string, Set<string>>> {
  const table = new Map<string, Map<string, Set<string>>>();
  const add = (en: string, language: string, form: string) => {
    const forms = table.get(en) ?? new Map<string, Set<string>>();
    forms.set(language, (forms.get(language) ?? new Set()).add(form));
    table.set(en, forms);
  };
  const walk = (en: unknown, others: Record<string, unknown>) => {
    if (typeof en === "string") {
      for (const [language, form] of Object.entries(others)) {
        if (typeof form === "string") add(en, language, form);
      }
    } else if (en !== null && typeof en === "object") {
      for (const key of Object.keys(en)) {
        walk(
          (en as Record<string, unknown>)[key],
          Object.fromEntries(
            Object.entries(others).map(([l, v]) => [
              l,
              v !== null && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined,
            ]),
          ),
        );
      }
    }
  };
  for (const value of [...Object.values(reportWords), ...Object.values(readmodelWords)]) {
    if (value === null || typeof value !== "object" || !("en" in value)) continue;
    const record = value as Record<string, unknown>;
    walk(
      record["en"],
      Object.fromEntries(LANGUAGES.filter((l) => l !== "en").map((l) => [l, record[l]])),
    );
  }
  return table;
}

const lettersIn = (line: string) => (line.match(/\p{L}/gu) ?? []).length;
const linesOf = async (page: Page) =>
  (await page.locator("body").innerText()).split("\n").map((line) => line.trim());

/** Where a line stands, as the render says: the landmark and the nearest shell class around it. */
async function whereIs(page: Page, line: string): Promise<string> {
  return page.evaluate((wanted) => {
    const all = [...document.body.querySelectorAll<HTMLElement>("*")].filter(
      (el) => el.innerText?.trim() === wanted && el.offsetParent !== null,
    );
    const deepest = all.find((el) => !all.some((other) => other !== el && el.contains(other)));
    if (deepest === undefined) return "not located";
    const landmark = deepest.closest("header") ? "header" : deepest.closest("main") ? "main" : "body";
    let named: Element | null = deepest;
    while (named !== null && ![...named.classList].some((c) => /^(irs|iris|ox|ask)-/.test(c))) {
      named = named.parentElement;
    }
    const cls = named === null ? "" : [...named.classList].find((c) => /^(irs|iris|ox|ask)-/.test(c));
    return `${landmark}${cls ? ` .${cls}` : ""}`;
  }, line);
}

test("a Slovak or Hungarian report shows no English line the product could have localised", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the frame's text does not vary with width");
  test.setTimeout(PAGES.length * LANGUAGES.length * 30_000);

  const table = wordTable();
  const defects: string[] = [];
  const unclassified: string[] = [];
  const decided = new Map<string, Set<string>>();

  let signedIn: keyof typeof VIEWER | null = null;
  for (const key of PAGES) {
    const [who, path] = key.split(" ") as [keyof typeof VIEWER, string];
    if (signedIn !== who) {
      await page.context().clearCookies();
      await signInAs(page, VIEWER[who]);
      signedIn = who;
    }
    await page.goto(withLanguage(path, "en"), { waitUntil: "networkidle" });
    const english = await linesOf(page);
    for (const language of LANGUAGES.filter((l) => l !== "en")) {
      await page.goto(withLanguage(path, language), { waitUntil: "networkidle" });
      const lines = await linesOf(page);
      expect(lines.length, `${key} ${language}: the page's lines pair with English`).toBe(
        english.length,
      );
      const seen = new Set<string>();
      for (const [i, line] of lines.entries()) {
        if (line !== english[i] || lettersIn(line) < 3 || seen.has(line)) continue;
        seen.add(line);
        if (matches(ALLOWED, line) !== undefined) continue;
        const onPage = english.some((en, j) => en === line && lines[j] !== line);
        const inTable =
          matches(NOT_PROOF, line) === undefined &&
          [...(table.get(line)?.get(language) ?? [])].some((form) => form !== line);
        if (onPage || inTable) {
          const proof = [onPage && "localised elsewhere on this page", inTable && "a word table has it"]
            .filter(Boolean)
            .join(", ");
          defects.push(`${key} ${language}: "${line}" (${proof}) at ${await whereIs(page, line)}`);
          continue;
        }
        if (matches(DECIDED_BY_MATE, line) !== undefined) {
          const where = `${key} ${language} at ${await whereIs(page, line)}`;
          decided.set(line, (decided.get(line) ?? new Set<string>()).add(where));
          continue;
        }
        unclassified.push(`${key} ${language}: "${line}" at ${await whereIs(page, line)}`);
      }
    }
  }

  for (const [line, where] of decided) {
    console.log(`(c) ${JSON.stringify(line)} on ${String(where.size)} page renders`);
    for (const at of where) console.log(`      ${at}`);
  }
  expect.soft(defects, "(b) English where the product has the localised form").toEqual([]);
  expect.soft(unclassified, "English lines nobody has classified").toEqual([]);
});
