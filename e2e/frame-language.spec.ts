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
 *
 * THREE READINGS OF THE SAME PAGES, ONE RULE (NYOMTAT1). The screen's lines;
 * the PRINTED lines, with the page in print media — the document P2-17 is
 * about, where the print stylesheet hides the header but not the context band;
 * and the SPOKEN attributes — `aria-label`, `placeholder`, `title`, `alt` —
 * which a screen reader says and `innerText` never holds. One spec, extended
 * rather than a second one beside it, because all three read the same eleven
 * pages through the same classification and the same word tables, and a copy
 * of that machinery is a second place for the rule to drift. Each reading
 * keeps its own lists: what is on paper is not what is on screen.
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

/*
 * THE PRINTED REPORT (NYOMTAT1). The print stylesheet hides the header and the
 * mobile bar, so most of the screen's frame is not on paper; the context band
 * (developer, project, period) and the page itself are. These lists hold only
 * what the printed render showed on 2026-10-01.
 */

/** (a) on the printed report. */
const PRINT_ALLOWED: readonly Rule[] = [
  {
    line: "Skip to content",
    why: "In `innerText`, never on paper: `.obs-skip` stands above the page edge until focused.",
  },
  { line: "Northgate Residences", why: "A synthetic project's proper name, in the context band." },
  { line: "Riverside Walk", why: "A synthetic project's proper name, in the context band." },
  { line: "ISTER TOWER", why: "A project's proper name, in the context band." },
  { line: "Alpha Estates", why: "A synthetic developer's proper name, in the context band." },
  { line: "Akhilesh Undev", why: "A synthetic agent's name, the subject of an agent report." },
  { line: "Lucia Bartošová", why: "A synthetic agent's name, listed in a report." },
];

/** (c) on the printed report: `_review/nyomtat1/kerdesek-hozzaferes.md` names them with the screen's. */
const PRINT_DECIDED_BY_MATE: readonly Rule[] = [
  { line: "This isn’t here", why: "the not-found page's heading" },
  {
    line: /^The address may be mistyped, or point at a unit, an agent or a conversation that has since changed\./,
    why: "the not-found page's explanation",
  },
];

/*
 * WHAT A SCREEN READER HEARS (NYOMTAT1). `aria-label`, `placeholder`, `title`
 * and `alt` are not in `innerText`, so the two readings above cannot see them.
 * Read off the rendered DOM, every element including the ones the desktop
 * hides (the mobile menu's controls are in the DOM at every width).
 */

/** (a) among the spoken attributes. */
const SPOKEN_ALLOWED: readonly Rule[] = [
  { line: "alt: IRIS", why: "The wordmark's text alternative: the product's name." },
  { line: "aria-label: by MADSPACE", why: "The company's mark under the wordmark, a brand name." },
  {
    line: /^title: (Petra Novák|Tomáš Varga)$/,
    why: "A synthetic account's name, the full form of a truncated name.",
  },
  {
    line: /^title: (Northgate Residences|Riverside Walk|ISTER TOWER|Alpha Estates)$/,
    why: "A project's or developer's proper name, the full form of a truncated label.",
  },
];

/** (c) among the spoken attributes: `_review/nyomtat1/kerdesek-hozzaferes.md`. */
const SPOKEN_DECIDED_BY_MATE: readonly Rule[] = [
  { line: "aria-label: Sections", why: "the navigation landmark" },
  { line: "aria-label: Menu", why: "the mobile menu's button" },
  { line: "aria-label: Close menu", why: "the mobile menu's close button" },
  { line: "aria-label: Project", why: "the project switcher" },
  { line: "aria-label: Period", why: "the period switcher" },
  { line: "aria-label: Developer", why: "the developer switcher" },
  { line: "aria-label: IRIS by MADSPACE — this project's Ask IRIS", why: "the wordmark's link" },
  { line: /^aria-label: Ask IRIS about .+$/, why: "the prompt bar's field" },
  { line: "placeholder: Ask IRIS…", why: "the prompt bar's resting placeholder" },
  { line: "aria-label: Send", why: "the prompt bar's send button" },
  { line: "title: Send", why: "the prompt bar's send button" },
  {
    line: "aria-label: Dictate a question. Not available: this build does not enable the microphone.",
    why: "the prompt bar's dictation button",
  },
  { line: "title: Dictation is not enabled in this build", why: "the prompt bar's dictation button" },
];

/** The same homonym as on screen: the project switcher is not the buyers table's column. */
const SPOKEN_NOT_PROOF: readonly Rule[] = [
  {
    line: "aria-label: Project",
    why: "The agent report's buyers-table column (`buyersColumns[3]`), not the project switcher.",
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

/** The attributes a screen reader or a pointer reads and `innerText` does not hold. */
const SPOKEN = ["aria-label", "placeholder", "title", "alt"] as const;

/** Every spoken attribute on the page, in document order, as `name: value`. */
async function attributesOf(page: Page): Promise<string[]> {
  return page.evaluate((names) => {
    const out: string[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      for (const name of names) {
        const value = el.getAttribute(name)?.trim();
        if (value) out.push(`${name}: ${value}`);
      }
    }
    return out;
  }, [...SPOKEN]);
}

/** Where an attribute stands: its element, the landmark, and the nearest shell class. */
async function whereAttribute(page: Page, item: string): Promise<string> {
  const at = item.indexOf(": ");
  const [name, value] = [item.slice(0, at), item.slice(at + 2)];
  return page.evaluate(
    ([n, v]) => {
      const el = [...document.body.querySelectorAll("*")].find(
        (e) => e.getAttribute(n)?.trim() === v,
      );
      if (el === undefined) return "not located";
      const landmark = el.closest("header") ? "header" : el.closest("main") ? "main" : "body";
      let named: Element | null = el;
      while (named !== null && ![...named.classList].some((c) => /^(irs|iris|ox|ask)-/.test(c))) {
        named = named.parentElement;
      }
      const cls = named === null ? "" : [...named.classList].find((c) => /^(irs|iris|ox|ask)-/.test(c));
      return `${landmark} <${el.tagName.toLowerCase()}>${cls ? ` .${cls}` : ""}`;
    },
    [name, value] as const,
  );
}

/** One way of reading a page, and the lists a person keeps for what it reads. */
interface Reading {
  readonly name: string;
  readonly media: "screen" | "print";
  readonly read: (page: Page) => Promise<string[]>;
  /** The words a word table would hold: the line itself, or an attribute's value. */
  readonly words: (item: string) => string;
  readonly locate: (page: Page, item: string) => Promise<string>;
  readonly allowed: readonly Rule[];
  readonly decided: readonly Rule[];
  readonly notProof: readonly Rule[];
}

async function measureReports(page: Page, reading: Reading) {
  const table = wordTable();
  /* The prompt bar types questions into its placeholder; reduced motion holds it at rest, so a read is repeatable. */
  await page.emulateMedia({ reducedMotion: "reduce" });
  const defects: string[] = [];
  const unclassified: string[] = [];
  const decided = new Map<string, Set<string>>();
  const load = async (url: string) => {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: reading.media, reducedMotion: "reduce" });
    return reading.read(page);
  };

  let signedIn: keyof typeof VIEWER | null = null;
  for (const key of PAGES) {
    const [who, path] = key.split(" ") as [keyof typeof VIEWER, string];
    if (signedIn !== who) {
      await page.context().clearCookies();
      await signInAs(page, VIEWER[who]);
      signedIn = who;
    }
    const english = await load(withLanguage(path, "en"));
    for (const language of LANGUAGES.filter((l) => l !== "en")) {
      const items = await load(withLanguage(path, language));
      expect(items.length, `${key} ${language}: the page's ${reading.name} pair with English`).toBe(
        english.length,
      );
      const seen = new Set<string>();
      for (const [i, item] of items.entries()) {
        const words = reading.words(item);
        if (item !== english[i] || lettersIn(words) < 3 || seen.has(item)) continue;
        seen.add(item);
        if (matches(reading.allowed, item) !== undefined) continue;
        const onPage = english.some((en, j) => en === item && items[j] !== item);
        const inTable =
          matches(reading.notProof, item) === undefined &&
          [...(table.get(words)?.get(language) ?? [])].some((form) => form !== words);
        if (onPage || inTable) {
          const proof = [onPage && "localised elsewhere on this page", inTable && "a word table has it"]
            .filter(Boolean)
            .join(", ");
          defects.push(`${key} ${language}: "${item}" (${proof}) at ${await reading.locate(page, item)}`);
          continue;
        }
        if (matches(reading.decided, item) !== undefined) {
          const where = `${key} ${language} at ${await reading.locate(page, item)}`;
          decided.set(item, (decided.get(item) ?? new Set<string>()).add(where));
          continue;
        }
        unclassified.push(`${key} ${language}: "${item}" at ${await reading.locate(page, item)}`);
      }
    }
  }

  for (const [item, where] of decided) {
    console.log(`(c) ${JSON.stringify(item)} on ${String(where.size)} page renders`);
    for (const at of where) console.log(`      ${at}`);
  }
  console.log(
    `${reading.name}: (b) ${String(defects.length)}, (c) ${String(decided.size)}, unclassified ${String(unclassified.length)}`,
  );
  expect.soft(defects, "(b) English where the product has the localised form").toEqual([]);
  expect.soft(unclassified, "English nobody has classified").toEqual([]);
}

const linesOf = async (page: Page) =>
  (await page.locator("body").innerText()).split("\n").map((line) => line.trim());

const READINGS: readonly Reading[] = [
  {
    name: "screen lines",
    media: "screen",
    read: linesOf,
    words: (line) => line,
    locate: whereIs,
    allowed: ALLOWED,
    decided: DECIDED_BY_MATE,
    notProof: NOT_PROOF,
  },
  {
    name: "printed lines",
    media: "print",
    read: linesOf,
    words: (line) => line,
    locate: whereIs,
    allowed: PRINT_ALLOWED,
    decided: PRINT_DECIDED_BY_MATE,
    notProof: [],
  },
  {
    name: "spoken attributes",
    media: "screen",
    read: attributesOf,
    words: (item) => item.slice(item.indexOf(": ") + 2),
    locate: whereAttribute,
    allowed: SPOKEN_ALLOWED,
    decided: SPOKEN_DECIDED_BY_MATE,
    notProof: SPOKEN_NOT_PROOF,
  },
];

for (const reading of READINGS) {
  test(`a Slovak or Hungarian report: no ${reading.name} in English the product could have localised`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the report's words do not vary with width");
    test.setTimeout(PAGES.length * LANGUAGES.length * 30_000);
    await measureReports(page, reading);
  });
}

/*
 * THE PERIOD ON PAPER (NYOMTAT1). The print stylesheet hides the header, not the
 * context band, so the period switcher's value prints. Measured rather than
 * inferred: on every report, in each language, the printed value is visible and
 * is the word table's label for the period the address asks for.
 */
test("a printed report names its period in the report's language", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the report's words do not vary with width");
  test.setTimeout(PAGES.length * LANGUAGES.length * 30_000);
  const period = (path: string) =>
    (new URLSearchParams(path.split("?")[1] ?? "").get("period") ??
      "quarter_to_date") as keyof (typeof readmodelWords.PERIOD_WORDS)["en"];
  let signedIn: keyof typeof VIEWER | null = null;
  for (const key of PAGES) {
    const [who, path] = key.split(" ") as [keyof typeof VIEWER, string];
    if (signedIn !== who) {
      await page.context().clearCookies();
      await signInAs(page, VIEWER[who]);
      signedIn = who;
    }
    for (const language of LANGUAGES) {
      await page.goto(withLanguage(path, language), { waitUntil: "networkidle" });
      await page.emulateMedia({ media: "print" });
      /* The mobile menu holds a second switcher; the one on paper is the visible one. */
      const value = page.locator('summary[aria-label="Period"] .ox-menu-value').filter({ visible: true });
      await expect(value, `${key} ${language}: the period prints`).toBeVisible();
      await expect(value, `${key} ${language}`).toHaveText(
        readmodelWords.PERIOD_WORDS[language][period(path)].label,
      );
      /* The table read above is the one under test: a localised label left in English would pass it. */
      if (language !== "en") {
        await expect(value, `${key} ${language}: not the English label`).not.toHaveText(
          readmodelWords.PERIOD_WORDS.en[period(path)].label,
        );
      }
    }
  }
});
