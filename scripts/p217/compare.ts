/**
 * P2-17: THE APPROVED TEXT AGAINST WHAT THE PRODUCT RENDERS (MERES1, 2026-10-01).
 *
 * The 101 sentences and the 257 short labels were built from a render dump of
 * 2026-09-27, and the tool that made the dump was never committed, so nobody
 * could say whether those 358 texts are in the product as approved. This and
 * `dump.p217.ts` are that tool, kept in the repository this time.
 *
 * It decides nothing. The approval sheet is the truth; this reads a dump of the
 * rendered report pages (`dump.p217.ts`, one file per language, the 09-27
 * shape) and says, for each item and each language, one of three things:
 *
 *   IDENTICAL         the approved text is the rendered line, byte for byte;
 *   DIFFERS           it is not, and both are printed;
 *   NOT MEASURABLE    the item's English is not on the rendered English page,
 *                     so this world cannot render the instance it was written
 *                     from — not a defect, and never counted as a difference.
 *
 * How an item is found: the three languages of a page render the same lines in
 * the same order (measured on the 09-27 dump: equal line counts on all eleven
 * pages), so the line where the item's English stands is the line where its
 * Slovak and Hungarian stand.
 *
 *   pnpm exec tsx scripts/p217/compare.ts <dump-dir> <sheet.md> [out.txt]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Language = "sk" | "hu";

export interface SheetItem {
  readonly n: number;
  readonly page: string;
  readonly en: string;
  readonly sk: string;
  readonly hu: string;
}

export interface RenderedPage {
  readonly url: string;
  readonly status: number;
  readonly lang: string;
  readonly text: string;
}

export type Dump = Readonly<Record<string, RenderedPage>>;

export type Verdict =
  | { readonly state: "identical"; readonly rendered: string }
  | { readonly state: "differs"; readonly rendered: string; readonly nbspOnly: boolean }
  | { readonly state: "not_measurable"; readonly why: string };

const PAGE = /^## ((?:petra|tomas) \/\S+)$/;
const ITEM = /^### (\d+)\\\.$/;
/* `**EN** text` (sheets 3 and 4) and `**SK text**` (sheet 1, where the whole line is bold). */
const LINE = /^\*\*(EN|SK|HU)(?:\*\* (.*)| (.*)\*\*)$/;

/** A sheet is markdown, so a literal `.` after a number or a `_` in a URL is written escaped. */
const unescape = (text: string): string => text.replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, "$1");

/** The items of one approval sheet. Refuses a sheet with a correction written in, which needs reading by a person first. */
export function parseSheet(markdown: string): readonly SheetItem[] {
  const lines = markdown.split(/\r?\n/);
  const items: SheetItem[] = [];
  let page: string | null = null;
  let current: { n: number; page: string; en?: string; sk?: string; hu?: string } | null = null;
  const flush = () => {
    if (current === null) return;
    const { n, page: p, en, sk, hu } = current;
    if (en === undefined || sk === undefined || hu === undefined) {
      throw new Error(`item ${String(n)} on ${p} lacks a language`);
    }
    items.push({ n, page: p, en, sk, hu });
    current = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const pageHead = PAGE.exec(line);
    if (pageHead) {
      flush();
      page = unescape(pageHead[1] ?? "");
      return;
    }
    if (/^## /.test(line)) {
      flush();
      page = null;
      return;
    }
    const itemHead = ITEM.exec(line);
    if (itemHead) {
      flush();
      if (page === null) throw new Error(`item on line ${String(i + 1)} stands under no page`);
      current = { n: Number(itemHead[1]), page };
      return;
    }
    if (current === null) return;
    const text = LINE.exec(line);
    if (text) {
      const key = (text[1] ?? "").toLowerCase() as "en" | "sk" | "hu";
      current[key] = unescape(text[2] ?? text[3] ?? "");
      return;
    }
    if (line.startsWith("**Javítás:**")) {
      const same = line.slice("**Javítás:**".length).trim();
      const next = (lines[i + 1] ?? "").trim();
      if (same.length > 0 || (next.length > 0 && !next.startsWith("#"))) {
        throw new Error(
          `item ${String(current.n)} on ${current.page} carries a correction; read it by hand before measuring`,
        );
      }
    }
  });
  flush();
  return items;
}

/** One item, one language, against the rendered pages. */
export function measure(
  item: SheetItem,
  language: Language,
  english: Dump,
  rendered: Dump,
): Verdict {
  const enPage = english[item.page];
  const page = rendered[item.page];
  if (enPage === undefined || page === undefined) {
    return { state: "not_measurable", why: "the page was not rendered" };
  }
  /* A table row's innerText puts tabs between cells, and an empty first or last cell leaves one at
   * either end; the sheets were written without them. Whitespace at a line's ends is layout. */
  const enLines = enPage.text.split("\n").map((l) => l.trim());
  const lines = page.text.split("\n").map((l) => l.trim());
  if (enLines.length !== lines.length) {
    return {
      state: "not_measurable",
      why: `the English page has ${String(enLines.length)} lines and the ${language.toUpperCase()} page ${String(lines.length)}, so a line cannot be paired`,
    };
  }
  const at = enLines.flatMap((line, i) => (line === item.en ? [i] : []));
  if (at.length === 0) {
    return {
      state: "not_measurable",
      why: "the item's English is not on the rendered English page: this world does not render the instance it was written from",
    };
  }
  const approved = item[language];
  /*
   * EVERY PLACE THE LINE STANDS IS JUDGED (SHELL1).
   *
   * A line the page shows more than once is identical only when every one of
   * its places carries the approved text. This read `includes` before, so one
   * localised place passed an item while another place kept the English.
   */
  const found = at.map((i) => lines[i] ?? "");
  if (found.every((line) => line === approved)) {
    return { state: "identical", rendered: approved };
  }
  const counts = new Map<string, number>();
  for (const line of found) counts.set(line, (counts.get(line) ?? 0) + 1);
  const shown =
    found.length === 1
      ? (found[0] ?? "")
      : [...counts]
          .map(([line, n]) => `${line}  [${String(n)} of ${String(found.length)} places]`)
          .join(" | ");
  /* Only when every place that is not the approved text differs from it in no-break spaces alone. */
  const nbspOnly = found
    .filter((line) => line !== approved)
    .every((line) => line.replace(/\u00a0/g, " ") === approved);
  return { state: "differs", rendered: shown, nbspOnly };
}

const readDump = (dir: string, language: string): Dump =>
  JSON.parse(readFileSync(join(dir, `${language}.json`), "utf8")) as Dump;

/** The report, in the shape `render.mts` writes, so the two can be compared by machine. */
export function report(
  items: readonly SheetItem[],
  dir: string,
): { text: string; counts: Record<string, number> } {
  const english = readDump(dir, "en");
  const dumps: Record<Language, Dump> = { sk: readDump(dir, "sk"), hu: readDump(dir, "hu") };
  const summary: Record<Verdict["state"], string[]> = {
    identical: [],
    differs: [],
    not_measurable: [],
  };
  const out: string[] = [];
  for (const item of items) {
    out.push(`### ${String(item.n)}  (${item.page})`);
    out.push(`EN     ${item.en}`);
    for (const language of ["sk", "hu"] as const) {
      const verdict = measure(item, language, english, dumps[language]);
      summary[verdict.state].push(`${String(item.n)}${language}`);
      const L = language.toUpperCase();
      out.push(`${L} Máté     ${item[language]}`);
      if (verdict.state === "not_measurable") {
        out.push(`${L} NOT MEASURABLE — ${verdict.why}`);
        continue;
      }
      out.push(`${L} rendered ${verdict.rendered}`);
      out.push(
        `${L} ${
          verdict.state === "identical"
            ? "IDENTICAL (byte for byte)"
            : verdict.nbspOnly
              ? "DIFFERS — IDENTICAL EXCEPT U+00A0 where Máté has U+0020"
              : "DIFFERS"
        }`,
      );
    }
    out.push("");
  }
  const total = items.length * 2;
  const head = [
    `identical:      ${String(summary.identical.length)} of ${String(total)} (${summary.identical.join(" ")})`,
    `differs:        ${String(summary.differs.length)} (${summary.differs.join(" ")})`,
    `not measurable: ${String(summary.not_measurable.length)} (${summary.not_measurable.join(" ")})`,
    "",
  ];
  return {
    text: [...head, ...out].join("\n"),
    counts: {
      total,
      identical: summary.identical.length,
      differs: summary.differs.length,
      not_measurable: summary.not_measurable.length,
    },
  };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/p217/compare.ts")) {
  const [dir, sheet, outPath] = process.argv.slice(2);
  if (dir === undefined || sheet === undefined) {
    console.error("usage: tsx scripts/p217/compare.ts <dump-dir> <sheet.md> [out.txt]");
    process.exit(2);
  }
  const { text, counts } = report(parseSheet(readFileSync(sheet, "utf8")), dir);
  if (outPath !== undefined) writeFileSync(outPath, text);
  console.log(JSON.stringify(counts));
}
