import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Which Supabase project a deployment writes to, proved from the right variable.
 *
 * The preflight rule used to read "`NEXT_PUBLIC_SUPABASE_URL` or
 * `SUPABASE_URL`", justified by the claim that the URL "is compiled into the
 * browser bundle". Both halves were wrong, and the second concealed the first.
 *
 * `SUPABASE_URL` is the server-side variable the durable audit and quota path
 * writes through — "Server-only. Never NEXT_PUBLIC_, never logged" in both
 * `.env.example` and the environment schema. `NEXT_PUBLIC_SUPABASE_URL` is a
 * separately named, optional, browser-exposed variable. Next.js inlines a
 * variable into the client bundle if and only if its name begins with
 * `NEXT_PUBLIC_`, so the server variable is NOT browser-bundled — and an
 * operator entitled to read "either" could have found the approved ref in the
 * public one and recorded the mapping as proved while the route wrote elsewhere.
 *
 * ## Why every assertion here is standalone rather than loose
 *
 * `SUPABASE_URL` IS A SUFFIX OF `NEXT_PUBLIC_SUPABASE_URL`. A `/SUPABASE_URL/`
 * match therefore succeeds on a document that never mentions the server
 * variable at all — which is precisely the failure being tested for. Every
 * assertion below anchors on {@link STANDALONE}.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const PEPPER = "docs/release/PEPPER-CONTRACT.txt";
const RUNBOOK = "docs/18-deployment.md";
const PUBLIC_URL = "NEXT_PUBLIC_SUPABASE_URL";

/** `SUPABASE_URL` not preceded by an identifier character — so not the suffix. */
const STANDALONE = /(?<![A-Z0-9_])SUPABASE_URL\b/;
const STANDALONE_ALL = /(?<![A-Z0-9_])SUPABASE_URL\b/g;

/** Claims that something reaches the browser. */
const BROWSER_EXPOSURE =
  /browser bundle|client bundle|compiled into the browser|inlined into the browser|browser-exposed|client-exposed|browser-bundled|bundled for the browser/i;

/** A denial, so a document may say the server variable is NOT browser-exposed. */
const NEGATION = /\b(not|never|cannot|no)\b/i;

/**
 * A phrase matcher that survives line wrapping and markdown emphasis.
 *
 * These documents are hard-wrapped prose and Prettier rewraps the Markdown one,
 * so a literal phrase can be split across a line break with an arbitrary
 * indent, and `**` can appear anywhere inside it. Asserting on the phrase
 * rather than on one particular wrapping is what keeps these tests about
 * meaning instead of about the current column width.
 */
const phrase = (words: string): RegExp =>
  new RegExp(words.trim().split(/\s+/).map(escape).join("[\\s*_`]+"), "i");

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Passages that assert browser exposure while naming the server variable and
 * do not deny it — a document telling a reader the two have the same
 * visibility, which is how "read either one" became defensible.
 */
function conflations(text: string): readonly string[] {
  const out: string[] = [];
  for (const match of text.matchAll(STANDALONE_ALL)) {
    const at = match.index ?? 0;
    /* The claim has to sit near the name to be a claim about it. */
    const span = text.slice(Math.max(0, at - 160), at + 200);
    if (!BROWSER_EXPOSURE.test(span)) continue;
    if (NEGATION.test(span)) continue;
    out.push(span.replace(/\s+/g, " ").trim());
  }
  return out;
}

/**
 * Does the document explicitly DENY that the server variable is browser-bundled?
 *
 * The counterpart to {@link conflations}: absence of a false claim is not the
 * same as presence of the true one, and the false one is the belief that made
 * "read either" look reasonable.
 */
function deniesBrowserBundling(text: string): boolean {
  for (const match of text.matchAll(STANDALONE_ALL)) {
    const at = match.index ?? 0;
    const span = text.slice(Math.max(0, at - 60), at + 200);
    if (BROWSER_EXPOSURE.test(span) && NEGATION.test(span)) return true;
  }
  return false;
}

/** Both orderings of the substitution, quoted and bare. */
const SUBSTITUTION_WORDINGS = [
  ["public first, backticked", "NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL"],
  ["server first, backticked", "SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL"],
  ["public first, bare", "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL"],
  ["server first, bare", "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL"],
] as const;

const ARTEFACTS = [
  ["pepper contract", PEPPER],
  ["deployment runbook", RUNBOOK],
] as const;

describe("the project-mapping rule names the right variable", () => {
  describe.each(ARTEFACTS)("%s", (_label, path) => {
    const text = (): string => read(path);

    it("names the standalone server-side variable, not just the public suffix", () => {
      expect(STANDALONE.test(text()), "no standalone SUPABASE_URL anywhere").toBe(true);
      /*
       * The trap this exists to catch: blank out every public mention and the
       * server variable must still be there. A loose match would survive this.
       */
      const withoutPublic = text().split(PUBLIC_URL).join("<public>");
      expect(STANDALONE.test(withoutPublic)).toBe(true);
    });

    it("calls the server-side variable authoritative", () => {
      expect(text()).toMatch(phrase("is authoritative"));
      expect(text()).toMatch(/server[- ]side|server-only/i);
    });

    it("treats the public variable as optional and secondary", () => {
      expect(text()).toContain(PUBLIC_URL);
      expect(text()).toMatch(phrase("secondary consistency check"));
    });

    it("forbids the public variable as a substitute", () => {
      expect(text()).toMatch(phrase("as a substitute"));
      expect(text()).toMatch(phrase("never use"));
      expect(text()).toMatch(phrase("are not interchangeable"));
    });

    it("requires a STOP when the two name different projects", () => {
      expect(text()).toMatch(phrase("different projects, STOP"));
    });

    it("requires the recorded ref to equal the approved project", () => {
      expect(text()).toMatch(phrase("project ref"));
      expect(text()).toMatch(phrase("approved Observer project"));
    });

    it("reads no secret value", () => {
      for (const secret of ["SUPABASE_SECRET_KEY", "OBSERVER_SUBJECT_PEPPER", "OPENAI_API_KEY"]) {
        expect(text(), secret).toContain(secret);
      }
      /*
       * The prohibition, in either document's words: the runbook says "**never**
       * read or print", the pepper contract says "DO NOT READ". Both are the
       * same rule and neither is the phrasing to assert on.
       */
      expect(text()).toMatch(/(never|do not)[\s*_`]+read/i);
    });

    it("pauses for Matthew rather than widening the read", () => {
      expect(text()).toMatch(/paus/i);
      expect(text()).toMatch(phrase("dashboard"));
    });

    it.each(SUBSTITUTION_WORDINGS)("rejects the substitution wording: %s", (_why, wording) => {
      expect(text()).not.toContain(wording);
    });

    it("never claims the server-side variable reaches the browser", () => {
      expect(conflations(text())).toEqual([]);
    });

    it("says only the NEXT_PUBLIC_ variable is client-exposed, and why", () => {
      expect(text()).toMatch(phrase("if and only if its name begins with NEXT_PUBLIC_"));
      /*
       * And the denial is stated, not merely implied. The two documents word it
       * differently — "is not browser-bundled" and "therefore is NOT compiled
       * into the browser bundle" — so this asserts the CLAIM rather than one
       * phrasing of it.
       */
      expect(deniesBrowserBundling(text()), "no explicit denial near the server variable").toBe(
        true,
      );
    });

    it("says client exposure does not establish the server target", () => {
      expect(text()).toMatch(phrase("exposure does not establish the server target"));
    });

    it("records the resolver's fallback rather than calling it a mapping", () => {
      /*
       * Read out of the resolver, not out of the documentation: an ABSENT
       * server variable is a silent fallback through a browser-exposed one,
       * not "no destination".
       */
      expect(text()).toMatch(phrase("fallback"));
      expect(text()).toMatch(phrase("in that order"));
    });
  });

  it("the resolver still behaves the way both documents describe", () => {
    /*
     * The documents are only correct while this stays true. Asserted against
     * the source rather than restated, because a rule that outlives the code it
     * describes is the whole defect class this milestone is about.
     */
    const resolver = read("apps/web/src/lib/supabase-env.ts");
    expect(resolver).toMatch(/URL_NAMES = \["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"\]/);
  });

  it("the environment schema still marks the server variable server-only", () => {
    expect(read("apps/web/src/lib/env.ts")).toMatch(/Server-only\. Never NEXT_PUBLIC_/);
  });

  it("no tracked prose artefact carries the substitution wording", () => {
    /*
     * Repository-wide, because the defect was that one file said it and the
     * others were merely consistent with it. A file explicitly retracting the
     * wording may quote it; nothing else may.
     */
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter((f) => /\.(md|txt)$/.test(f) && !f.startsWith("_review/"));
    expect(tracked.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const file of tracked) {
      const contents = read(file);
      for (const [, wording] of SUBSTITUTION_WORDINGS) {
        const at = contents.indexOf(wording);
        if (at === -1) continue;
        const around = contents.slice(Math.max(0, at - 500), at + 300);
        const retracting =
          /wrong|false|earlier edition|not interchangeable|superseded|as though they were|used to read/i.test(
            around,
          );
        if (!retracting) offenders.push(`${file}: ${wording}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
