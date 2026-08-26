import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The rollout order, guarded as a fact rather than as prose.
 *
 * Two of the eight steps below were discovered by audit rather than by design,
 * and both were ordering mistakes that documentation alone had let stand:
 *
 *  - THE PEPPER MUST BE CONFIGURED AND THE COMMIT REDEPLOYED BEFORE ANYTHING
 *    ELSE. `3f298a6` is the commit that made `OBSERVER_SUBJECT_PEPPER`
 *    mandatory: its gate returns 503 for every question when the variable is
 *    absent, before admission and before an audit row. And Vercel's
 *    environment-variable changes apply only to NEW deployments — setting the
 *    variable does not repair the existing `3f298a6` Preview URL. So the
 *    legacy compatibility proof has to run against a FRESH redeploy of that
 *    exact SHA, and a rollout that applies migrations first would spend two
 *    database mutations before discovering the application cannot answer.
 *
 *  - THE LIVE-MODEL PROOF IS LAST AND SEPARATE. A deterministic-composer
 *    answer satisfies the compatibility proof completely, so "13/13" is not
 *    evidence that live AI works.
 *
 * A test rather than a heading, because the ordering is the safety property.
 * If somebody reorders the runbook, this fails.
 */

const ROOT = join(import.meta.dirname, "..", "..");

/** The eight ordered milestones the runbook must contain, in this order. */
const ORDER = [
  { name: "pepper configuration", pattern: /pepper/i },
  {
    name: "fresh redeploy of exact 3f298a6",
    pattern: /redeploy[^\n]*3f298a6|3f298a6[^\n]*redeploy/i,
  },
  {
    name: "pre-migration HTTP smoke",
    pattern: /pre-migration[^\n]*(smoke|request)|smoke[^\n]*pre-migration/i,
  },
  { name: "database migrations", pattern: /apply\s+(observer-)?migration\s*3|apply migration 3/i },
  {
    name: "legacy compatibility proof",
    pattern: /legacy[^\n]*(proof|part b)|expected_build\s*=\s*'legacy'/i,
  },
  { name: "push", pattern: /\bpush\b/i },
  { name: "scoped proof", pattern: /scoped[^\n]*(proof|part b)|expected_build\s*=\s*'scoped'/i },
  { name: "live-model proof", pattern: /model-authored|live[- ]model|ai-readiness/i },
] as const;

/**
 * Every document that carries the rollout sequence.
 *
 * All of them, not one: a runbook corrected in the deployment doc and left
 * stale in the review bundle is how an operator follows the wrong order.
 */
const RUNBOOKS = ["docs/18-deployment.md"] as const;

function orderedPositions(text: string): { name: string; at: number }[] {
  let cursor = 0;
  return ORDER.map(({ name, pattern }) => {
    const rest = text.slice(cursor);
    const m = rest.match(pattern);
    const at = m?.index === undefined ? -1 : cursor + m.index;
    if (at >= 0) cursor = at + 1;
    return { name, at };
  });
}

describe.each(RUNBOOKS)("%s documents the rollout in the required order", (file) => {
  const text = readFileSync(join(ROOT, file), "utf8");

  it("contains every milestone", () => {
    const missing = orderedPositions(text)
      .filter((p) => p.at < 0)
      .map((p) => p.name);
    expect(missing).toEqual([]);
  });

  it("contains them in order, each after the one before", () => {
    const found = orderedPositions(text);
    for (let i = 1; i < found.length; i += 1) {
      const previous = found[i - 1];
      const current = found[i];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      // Scanning forward from the previous match, so this is genuinely about
      // sequence and not about a word appearing somewhere earlier by accident.
      expect(current?.at).toBeGreaterThan(previous?.at ?? Number.MAX_SAFE_INTEGER);
    }
  });

  it("states that the OLD deployment URL stays pepper-less", () => {
    /*
     * The fact most likely to be lost. Configuring the project variable does
     * not reach a build that already exists — so the original `3f298a6`
     * deployment keeps returning 503 for every question, for ever, and must
     * never be used for the legacy proof.
     */
    // Whitespace-tolerant: the runbook is prose that Prettier rewraps, so a
    // line break must not be the difference between a pass and a failure.
    expect(text).toMatch(
      /do(es)? not\s+(affect|apply\s+to|repair|reach)[^.]*(previous|existing|already)/i,
    );
    expect(text).toMatch(/only\s+to\s+new\s+deployments/i);
  });

  it("does not promise live AI on a deterministic answer", () => {
    expect(text).toContain("Observer application works, but live AI is not yet enabled.");
  });

  it("never claims the currently deployed 3f298a6 answers questions today", () => {
    /*
     * The contradiction this milestone exists to remove: `3f298a6` is the
     * pepper commit, and whether its deployment carries the variable has never
     * been demonstrated through HTTP from here.
     */
    expect(text).not.toMatch(/3f298a6[^\n]*\b(works|is working|answers) (now|today)\b/i);
  });
});
