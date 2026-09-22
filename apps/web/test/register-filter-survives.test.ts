import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  readRegisterQuery,
  registerHref,
  type RegisterSearch,
} from "../src/components/units/register";

/**
 * The register a reader built survives opening a unit and coming back.
 *
 * ## What this proves, and what it cannot
 *
 * The register keeps its whole state in the query string — its own folder says
 * so — so "does the filter survive" is two separate questions with two
 * different answers, and only one of them is a source question.
 *
 * **The browser's own Back button** restores the previous URL, filter and all.
 * It was never the broken half and this file does not test it: what a browser
 * restores is a runtime behaviour of the browser, and a unit test that claimed
 * to settle it would be asserting something it never ran.
 *
 * **The Back this screen draws** is the "Units" crumb on a unit's page, and it
 * is not the browser's history. It had to be told, and what it is told has to
 * survive a round trip: serialised into the row's link, carried through the
 * unit page's address, parsed back by the register. That round trip is a source
 * question, it is what the two assertions below test, and it is the half that
 * was broken.
 */

const web = resolve(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(resolve(web, path), "utf8");

const BASE = "/alpha/ister-tower/units";

/**
 * A register narrowed on every axis it has.
 *
 * Every field is deliberately off its default, because `parametersOf` omits
 * defaults: a query left at its defaults would round-trip through an empty
 * string and prove nothing at all.
 */
const FILLED: RegisterSearch = {
  q: "balcony",
  status: "reserved",
  rooms: "3",
  shown: "all",
  sort: "views",
  dir: "asc",
  more: "1",
  unit: "IT-A-12-07",
};

/** Parse a href built by `registerHref` back into the shape a page receives. */
function searchOf(href: string): RegisterSearch {
  const params = new URL(href, "https://observer.invalid").searchParams;
  return Object.fromEntries(params) as RegisterSearch;
}

describe("the register survives the round trip through a unit's page", () => {
  it("carries every field it has, named one at a time", () => {
    const query = readRegisterQuery(FILLED);
    const back = readRegisterQuery(searchOf(registerHref(BASE, query)));

    /*
     * Field by field rather than one `toEqual`, so a failure names the axis
     * that was dropped. Two of the eight do not travel under their own name —
     * `scope` is the `shown` parameter and `dir` is `asc`/`desc` — which is
     * exactly the kind of mapping a round trip loses quietly.
     */
    expect(back.q, "the text search").toBe(query.q);
    expect(back.status, "the status filter").toBe(query.status);
    expect(back.rooms, "the rooms filter").toBe(query.rooms);
    expect(back.scope, "which rows are shown").toBe(query.scope);
    expect(back.sort, "the sort column").toBe(query.sort);
    expect(back.dir, "the sort direction").toBe(query.dir);
    expect(back.more, "whether a second page was asked for").toBe(query.more);
    expect(back.unit, "the marked row").toBe(query.unit);

    expect(back).toEqual(query);
  });

  it("and the narrowed register is not the bare one", () => {
    /* Guards the guard: if `registerHref` returned `base` unchanged, the round
     * trip above would still pass for every default-valued field. */
    expect(registerHref(BASE, readRegisterQuery(FILLED))).not.toBe(BASE);
  });
});

/**
 * The two links that have to carry it, enumerated.
 *
 * P2-07's lesson, applied: the rule is not stated in a comment and hoped for —
 * the places it must hold are written out, so a third link added later is a
 * line here rather than a thing nobody remembered.
 */
const LINKS = [
  {
    what: "the register row that opens a unit",
    file: "src/components/units/UnitRegister.tsx",
    anchor: "href={dynamicRoute(",
  },
  {
    what: "the Units crumb that comes back",
    file: "src/app/(app)/[tenantSlug]/[projectSlug]/units/[unitCode]/page.tsx",
    anchor: 'label: "Units"',
  },
] as const;

/**
 * Comments removed before searching.
 *
 * Both hrefs are introduced by a block comment that explains why they carry the
 * register, and those comments name `registerHref`. Searching the raw source
 * would therefore match the explanation of the mechanism instead of the
 * mechanism — which is exactly how the Project Overview guard passed a mutation
 * a round ago, by finding a denominator's words in a `note` rather than the
 * `of` on the figure. The prose is not the code.
 */
const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");

describe("both directions carry the register", () => {
  it.each(LINKS)("$what", ({ file, anchor }) => {
    const source = withoutComments(read(file));
    const at = source.indexOf(anchor);

    expect(at, `the anchor \`${anchor}\` is no longer in ${file}`).toBeGreaterThan(-1);

    /* The href's own expression, not the whole file. */
    const block = source.slice(at, at + 200);

    expect(block, `${file} builds this href without the register's state`).toContain(
      "registerHref(",
    );
  });
});
