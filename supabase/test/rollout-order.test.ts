import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The rollout order, parsed rather than sampled.
 *
 * The first version of this file searched for broad words anywhere in the
 * document. That was too weak twice over: "push" matches the GitHub section
 * hundreds of lines earlier, and a numbered row could be deleted, duplicated or
 * reordered without a single assertion noticing. It now parses THE TABLE — the
 * nineteen numbered rows an operator actually follows — and asserts positions
 * within it.
 *
 * Three orderings in that table were discovered by audit, not by design, and
 * each one would have cost something real:
 *
 *  - THE PEPPER AND THE REDEPLOY COME BEFORE ANY DATABASE MUTATION. `3f298a6`
 *    is the commit that made `OBSERVER_SUBJECT_PEPPER` mandatory, and Vercel
 *    applies environment changes only to NEW deployments. A rollout that
 *    migrated first would have spent two database mutations before discovering
 *    the application could not answer.
 *
 *  - EVERY VERSION-1 WRITER IS RETIRED BEFORE THE CONTRACT MIGRATION, not only
 *    the deployments that can call the old façades. Migration 3 keeps the
 *    13-argument call working through defaults and the contract migration does
 *    not disable it, so both `3f298a6` deployments would otherwise keep writing
 *    cross-tenant-linkable version-1 pseudonyms for ever.
 *
 *  - THE LIVE-MODEL PROOF IS LAST AND SEPARATE. A deterministic-composer answer
 *    satisfies the compatibility proof completely, so 13/13 is not evidence
 *    that live AI works.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const RUNBOOK = join(ROOT, "docs", "18-deployment.md");
const TEXT = readFileSync(RUNBOOK, "utf8");

/* --- parsing the table --------------------------------------------------- */

interface Step {
  readonly n: number;
  readonly text: string;
}

/**
 * The numbered rollout rows, in document order.
 *
 * Located by the table's own header so a numbered row elsewhere in the runbook
 * — and there are several — cannot be mistaken for part of the sequence.
 */
function steps(): readonly Step[] {
  /*
   * Located by a whitespace-tolerant header match. Prettier column-aligns
   * Markdown tables, so `| # | Step | Mutates |` becomes `| #   | Step … |`
   * with padding that depends on the longest cell — a literal search finds it
   * until somebody edits a row, and then the whole file silently collects no
   * tests at all. That happened once; the regex is the fix.
   */
  const match = /^\|\s*#\s*\|\s*Step\s*\|\s*Mutates\s*\|\s*$/m.exec(TEXT);
  if (match?.index === undefined) throw new Error("the rollout table header is missing");
  const rest = TEXT.slice(match.index);
  const end = rest.indexOf("\n\n");
  const body = end < 0 ? rest : rest.slice(0, end);

  return body
    .split("\n")
    .map((line) => /^\|\s*(\d+)\s*\|(.*)\|[^|]*\|\s*$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ n: Number(m[1]), text: (m[2] ?? "").trim() }));
}

const STEPS = steps();

/** The number of the first step whose text matches, or -1. */
function stepOf(pattern: RegExp): number {
  return STEPS.find((s) => pattern.test(s.text))?.n ?? -1;
}

/*
 * The step that CONFIGURES the pepper, not every row mentioning it. The word
 * appears in the preflight and in the approval row too, and matching it loosely
 * is exactly the weakness this file replaced.
 */
const PEPPER = /Reuse, create or explicitly rotate the pepper/i;
const REDEPLOY = /redeploy exact SHA `?3f298a6/i;
const SMOKE = /pre-migration HTTP smoke/i;
const ISOLATE = /protect the original unverified `?3f298a6/i;
const MIGRATION_3 = /Apply Migration 3/i;
const LEGACY_PROOF = /legacy 13\/13/i;
const PUSH = /\*\*Push\*\* the corrected release branch/i;
const SCOPED_PROOF = /scoped 13\/13/i;
const LIVE_MODEL = /live-model readiness/i;
const RETIRE = /version-1-capable/i;
const CONTRACT = /\*\*contract migration\*\* last/i;

/* --- 1. the table itself ------------------------------------------------- */

describe("the rollout table is intact", () => {
  it("has nineteen rows, numbered 1..19 with no gap or duplicate", () => {
    expect(STEPS.map((s) => s.n)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });

  it("names every milestone exactly once", () => {
    for (const [name, pattern] of [
      ["pepper", PEPPER],
      ["redeploy 3f298a6", REDEPLOY],
      ["pre-migration smoke", SMOKE],
      ["isolate the original", ISOLATE],
      ["migration 3", MIGRATION_3],
      ["legacy proof", LEGACY_PROOF],
      ["push", PUSH],
      ["scoped proof", SCOPED_PROOF],
      ["live-model", LIVE_MODEL],
      ["retire version-1 writers", RETIRE],
      ["contract last", CONTRACT],
    ] as const) {
      const hits = STEPS.filter((s) => pattern.test(s.text));
      expect(hits.length, `${name} appears ${hits.length} times`).toBe(1);
    }
  });
});

/* --- 2. the order that makes it safe ------------------------------------- */

describe("the sequence protects what it is meant to protect", () => {
  it("configures the pepper and redeploys before any database mutation", () => {
    expect(stepOf(PEPPER)).toBeLessThan(stepOf(REDEPLOY));
    expect(stepOf(REDEPLOY)).toBeLessThan(stepOf(SMOKE));
    expect(stepOf(SMOKE)).toBeLessThan(stepOf(MIGRATION_3));
  });

  it("isolates the original unverified deployment once the fresh one answers", () => {
    expect(stepOf(SMOKE)).toBeLessThanOrEqual(stepOf(ISOLATE));
    expect(stepOf(ISOLATE)).toBeLessThan(stepOf(MIGRATION_3));
  });

  it("proves the legacy build before pushing, and pushes before the scoped proof", () => {
    expect(stepOf(MIGRATION_3)).toBeLessThan(stepOf(LEGACY_PROOF));
    expect(stepOf(LEGACY_PROOF)).toBeLessThan(stepOf(PUSH));
    expect(stepOf(PUSH)).toBeLessThan(stepOf(SCOPED_PROOF));
  });

  it("keeps the live-model proof separate from, and after, the scoped proof", () => {
    expect(stepOf(SCOPED_PROOF)).toBeLessThan(stepOf(LIVE_MODEL));
    // And it is its own row, not folded into the compatibility one.
    expect(stepOf(SCOPED_PROOF)).not.toBe(stepOf(LIVE_MODEL));
  });

  it("retires every version-1 writer before the contract migration", () => {
    expect(stepOf(LIVE_MODEL)).toBeLessThan(stepOf(RETIRE));
    expect(stepOf(RETIRE)).toBeLessThan(stepOf(CONTRACT));
    expect(stepOf(CONTRACT)).toBe(19);
  });

  it("names both 3f298a6 deployments in the retirement step", () => {
    const retire = STEPS.find((s) => RETIRE.test(s.text))?.text ?? "";
    expect(retire).toMatch(/fresh and original `?3f298a6/i);
  });
});

/* --- 3. the claims that must stay honest --------------------------------- */

describe("the runbook does not over-read UNKNOWN", () => {
  it("states the immutable snapshot as proven", () => {
    expect(TEXT).toMatch(/retains the environment snapshot captured when it was built/i);
    expect(TEXT).toMatch(/only\s+to\s+new\s+deployments/i);
  });

  it("states the pepper's presence in that snapshot as unknown", () => {
    expect(TEXT).toMatch(/\*\*Unknown\*\*/);
    expect(TEXT).toMatch(/Whether that snapshot contains `OBSERVER_SUBJECT_PEPPER`/i);
  });

  it("states the current behaviour as unobserved, not as a failure", () => {
    expect(TEXT).toMatch(/It may answer; it may return 503\. Neither has been seen\./);
  });

  it("states the exclusion as a requirement about eligibility", () => {
    expect(TEXT).toMatch(/ineligible\*\* for the controlled legacy proof/i);
    expect(TEXT).toMatch(/configuration snapshot is unverified/i);
  });

  it("never asserts the old deployment is pepper-less or permanently 503", () => {
    /*
     * The exact over-reads the audit found. UNKNOWN is not ABSENT, and an
     * unobserved deployment has not been shown to fail.
     */
    for (const claim of [
      /pepper-less/i,
      /keeps returning 503/i,
      /permanently.{0,30}503/i,
      /only the (fresh|new) deployment has (it|the variable)/i,
      /finally receives the variable/i,
    ]) {
      expect(TEXT).not.toMatch(claim);
    }
  });

  it("never claims the currently deployed 3f298a6 answers questions today", () => {
    expect(TEXT).not.toMatch(/3f298a6[^\n]*\b(works|is working|answers) (now|today)\b/i);
  });

  it("does not promise live AI on a deterministic answer", () => {
    expect(TEXT).toContain("Observer application works, but live AI is not yet enabled.");
    expect(TEXT).toContain("Live AI is not proven — see the failed checks");
  });

  it("refuses to overwrite an existing pepper automatically", () => {
    expect(TEXT).toMatch(/\*\*Reuse it\.\*\* Do not edit, do not rotate, do not overwrite/i);
    expect(TEXT).toMatch(/Never infer that two separate sensitive variables hold the same value/i);
    expect(TEXT).toMatch(/explicitly authorising a coordinated rotation/i);
  });
});

/* --- 4. no operator SQL carries a stale step number ---------------------- */

describe("operator SQL names phases, never rollout step numbers", () => {
  const DIRS = ["supabase/verifiers", "supabase/prerequisites", "supabase/migrations"] as const;

  const files = DIRS.flatMap((dir) =>
    readdirSync(join(ROOT, dir))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => join(dir, f)),
  );

  it("finds the operator SQL to check", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files)("%s carries no rollout step number", (file) => {
    /*
     * A number inside a SQL file cannot be renumbered when the sequence
     * changes, and an operator who trusts a stale "step 1" runs the database
     * work before the application is known to work. Phase names instead.
     */
    const text = readFileSync(join(ROOT, file), "utf8");
    expect(text).not.toMatch(/ROLLOUT STEPS? \d/i);
    expect(text).not.toMatch(/\bstep \d+ of the rollout\b/i);
    expect(text).not.toMatch(/\brollout steps? \d/i);
  });

  it("uses phase names in the files that describe where they belong", () => {
    const phases = [
      ["supabase/prerequisites/observer-cron-prerequisite.sql", /CRON PREREQUISITE PHASE/],
      ["supabase/verifiers/observer-http-compat-proof.sql", /LEGACY COMPATIBILITY PHASE/],
      ["supabase/verifiers/observer-http-compat-proof.sql", /SCOPED\s+COMPATIBILITY PHASE/],
      ["supabase/verifiers/observer-ai-readiness.sql", /LIVE-MODEL READINESS PHASE/],
      [
        "supabase/migrations/20260826140000_observer_bucket_retention.sql",
        /CRON PREREQUISITE PHASE/,
      ],
    ] as const;

    for (const [file, pattern] of phases) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toMatch(pattern);
    }
  });
});
