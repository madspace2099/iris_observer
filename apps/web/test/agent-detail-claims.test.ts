import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The agent page claims for a figure only what the read model claims.
 *
 * The recorded-outcome region read "Verified outcomes" and said "a commercial
 * result a system of record stands behind" over a count of the agent's own
 * entries. The read model no longer says so; this checks that the page does
 * not say it either, in the one place a reader meets the words.
 *
 * Source assertions, as the other page-claim tests do it: the page is an async
 * server component behind the repository and the session.
 */

const web = resolve(import.meta.dirname, "..");
const PAGE = readFileSync(
  resolve(web, "src/app/(app)/[tenantSlug]/[projectSlug]/agents/[agentId]/page.tsx"),
  "utf8",
);

/** The JSX only — a comment may name the old claim to say why it went. */
const MARKUP = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the recorded-outcome region", () => {
  it("names no system of record as standing behind the agent's own entry", () => {
    expect(MARKUP, "the page still credits a system of record with the agent's entry").not.toMatch(
      /system of record stands behind/,
    );
  });

  it("calls the outcomes what they are", () => {
    expect(MARKUP).toContain("Outcomes they recorded");
  });

  it("reads them from the field that says so", () => {
    expect(MARKUP).toContain("view.recordedOutcomes");
  });
});

/*
 * THE REGISTER SAYS WHAT IS TRUE TODAY, AND NOT THAT IT CANNOT CHANGE.
 *
 * "No buyer is named here and none can be" stood on the screen — the second
 * half in a rendered sentence a reader meets — after P1-08b had been reopened
 * and `docs/22-visitor-name-display.md` had recorded that a real name may be
 * displayed and is in design. Three copies said it: the page's note, the
 * register's docblock and the barrel's line ("no buyer's name anywhere in
 * it"). One assertion holds all three to the present tense, whichever way
 * the open decision goes.
 */
const REGISTER = readFileSync(resolve(web, "src/components/agents/MeetingRegister.tsx"), "utf8");
const BARREL = readFileSync(resolve(web, "src/components/agents/index.ts"), "utf8");

describe("the register's claim about the buyer", () => {
  it("says no buyer is named today, and never that none can be", () => {
    const copies = { page: PAGE, register: REGISTER, barrel: BARREL };
    const offenders = Object.entries(copies)
      .filter(([, source]) => /none can be|name anywhere in it/.test(source))
      .map(([name]) => name);
    expect(offenders, "a copy still claims a name is impossible").toEqual([]);
  });
});
