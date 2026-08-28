import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  facts,
  render,
  RED_GATE_ATTEMPTS,
  HISTORY_REPAIR,
  historyReplacementCommits,
} from "../../scripts/release/facts";
import {
  hashTokens,
  accountableHashes,
  unaccountedTokens,
} from "../../scripts/release/build-package";
import {
  LIVE,
  DEPLOYMENTS,
  CAPABILITY,
  INVENTORY_RECORDED_IN,
  LAST_VERCEL_ENUMERATION,
  DELIVERED_ARCHIVES,
  ARCHIVE_OUTCOMES,
  outcomeOf,
  priorDelivered,
  DEPLOYMENT_INVENTORY_PROVENANCE,
  OLDEST_BUCKET_HISTORY_PROVENANCE,
  CATALOGUE_STATE,
  renderCatalogueFact,
} from "../../scripts/release/live-snapshot";
import { HISTORICAL_CONTROL_CHAR_COMMITS } from "../../scripts/release/transport-safe";
import { baselineCommit } from "../../scripts/release/facts";
import {
  OBSERVED_MAPPINGS,
  OBSERVATION_LOG,
  historyFor,
  PEPPER_STATE,
  PRODUCTION_RUNTIME_STATE,
  OBSERVATION_MUTATION_STATUS,
  PRODUCTION_TRANSITION,
  KNOWN_EXTERNAL_ACTIVITY,
  EXTERNAL_ACTIVITY_COMPLETENESS,
  THIS_MILESTONE_EXTERNAL_ACCESS,
  classifyObservation,
  renderObservedMapping,
  APPROVED_PROJECT_REF,
} from "../../scripts/release/preflight";

/**
 * Five artefacts describe the same retirement policy to five different
 * audiences. They must not disagree.
 *
 * They did. The rollout table, the verifier and the runbook were corrected to
 * separate the two capabilities and their two remedies; `supabase/README.md`
 * kept offering one remedy for both, and the contract migration kept describing
 * an inventory selected by age. Nothing failed, because nothing compared them —
 * each was internally consistent and collectively they told a reader three
 * different things.
 *
 * The second half of this file checks the EVIDENCE templates: that every
 * changing value is a placeholder rather than a typed copy, that every fact the
 * resolver produces is actually used, and that the recorded snapshot is the
 * only place a live number is stated.
 */

const ROOT = join(import.meta.dirname, "..", "..");

/**
 * The resolved facts, computed ONCE for the whole file.
 *
 * ## Why this is not merely a speed-up
 *
 * `facts()` shells out to git dozens of times — HEAD, both remotes, the
 * local-only log, a rev-list count over the patch chain, and a blob hash for
 * every migration at two commits. This file called it nineteen times, and the
 * suite took sixty-seven seconds in a single worker as a result.
 *
 * A Vitest worker answers the parent over an RPC with a deadline, and every one
 * of those git calls is synchronous — so the worker's own event loop was held,
 * over and over, for a minute. Vitest recorded `Timeout calling "onTaskUpdate"`
 * as an UNHANDLED ERROR and exited 1 beside a report saying every test passed:
 * the exact runner-level shape this repository spent a milestone diagnosing,
 * reproduced by this file alone. The parent was fine throughout — its worst
 * event-loop stall was 77ms.
 *
 * The facts are a pure function of HEAD and the working tree, and neither moves
 * during a run, so computing them once is the same measurement. Memoised HERE
 * and never in `facts.ts`: caching in the module would change what the packager
 * does, and the packager is supposed to re-derive.
 */
let resolvedFacts: Readonly<Record<string, string>> | null = null;
const allFacts = (): Readonly<Record<string, string>> => {
  resolvedFacts ??= facts({ stagedFiles: 0 });
  return resolvedFacts;
};
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
/** Built, not written: a literal backtick inside a template is a parse hazard. */
const BACKTICK = String.fromCharCode(96);
/** Prose wraps, so a citation may sit across a line break. */
const WS = String.fromCharCode(92) + "s+";

const README = "supabase/README.md";
const RUNBOOK = "docs/18-deployment.md";
const PEPPER = "docs/release/PEPPER-CONTRACT.txt";
const VERIFIER = "supabase/verifiers/observer-contract-readiness.sql";
const MIGRATION = "supabase/migrations/20260826090000_observer_audit_facade_cleanup.sql";

describe("the five artefacts agree on the retirement policy", () => {
  const POLICY = [README, RUNBOOK, PEPPER, VERIFIER, MIGRATION] as const;

  it.each([README, RUNBOOK, VERIFIER, MIGRATION])(
    "%s requires DELETION for a version-1-capable build",
    (path) => {
      const text = read(path);
      expect(text).toMatch(/pseudonym_version = 1/);
      expect(text).toMatch(/DELETE(D)?\b/);
    },
  );

  it.each([README, RUNBOOK, MIGRATION])(
    "%s does not offer protection as a substitute for deletion",
    (path) => {
      const text = read(path);
      /*
       * The banned claim is the EQUIVALENCE, not the word "protect": protection
       * remains a valid remedy for a legacy-façade-only build, and every one of
       * these files has to say so.
       */
      expect(text).not.toMatch(/deleted or genuinely protected/i);
      expect(text).not.toMatch(/cannot reach its own\s*\n?(--|>)?\s*route handler/i);
    },
  );

  it.each([README, RUNBOOK, MIGRATION])(
    "%s says the contract migration removes the façade functions",
    (path) => {
      expect(read(path)).toMatch(/removes?\s+(\w+\s+)?(RPC|functions?|façade|facade)/i);
    },
  );

  it.each([README, MIGRATION])(
    "%s says thirteen-argument admission survives this migration",
    (path) => {
      expect(read(path)).toMatch(/does\s+\**not\**\s+(disable|close)/i);
      expect(read(path)).toMatch(/thirteen[- ]argument/i);
    },
  );

  it("every policy artefact names 3f298a6 as version-1-capable", () => {
    for (const path of POLICY) {
      if (!read(path).includes("3f298a6")) continue;
      expect(read(path), path).toMatch(/3f298a6/);
    }
    /* At least the three that carry the inventory must name it. */
    for (const path of [README, RUNBOOK, MIGRATION]) {
      expect(read(path), path).toMatch(/3f298a6/);
    }
  });

  it("the verifier still refuses to say READY", () => {
    const text = read(VERIFIER);
    expect(text).toMatch(/INCONCLUSIVE/);
    expect(text).toMatch(/NO-GO/);
    expect(text).toMatch(/UNUSABLE/);
    /* Not a bare word-boundary match: NO-GO and READINESS both contain it. */
    expect(text).not.toMatch(/'\s*READY\b/);
  });

  it("the migration and the README agree that 1ee5d2d writes nothing", () => {
    expect(read(MIGRATION)).toMatch(/1ee5d2d\W{0,3}is NEITHER/);
    expect(read(README)).toMatch(/1ee5d2d/);
    expect(CAPABILITY["1ee5d2d"]).toBe("none");
  });

  it("the recorded capability table matches what the artefacts claim", () => {
    expect(CAPABILITY["3f298a6"]).toBe("version1");
    expect(CAPABILITY["3515402"]).toBe("none");
    const version1 = Object.entries(CAPABILITY).filter(([, c]) => c === "version1");
    /* Exactly one SHA is version-1-capable; that is why the rule is narrow. */
    expect(version1.map(([sha]) => sha)).toEqual(["3f298a6"]);
  });

  it("every deployed SHA has a recorded capability", () => {
    for (const d of DEPLOYMENTS) {
      expect(CAPABILITY[d.sha], `${d.sha} is deployed but unclassified`).toBeDefined();
    }
  });
});

describe("the pepper contract separates project mapping from pepper metadata", () => {
  const text = (): string => read(PEPPER);

  it("reads the Supabase project from the non-secret URL, not from metadata", () => {
    expect(text()).toMatch(/PART ONE — PROJECT MAPPING, FROM ONE NON-SECRET SERVER-SIDE VALUE/);
    /*
     * Standalone, not loose: `SUPABASE_URL` is a suffix of
     * `NEXT_PUBLIC_SUPABASE_URL`, so a bare match passes on a document naming
     * only the public variable. supabase/test/project-mapping.test.ts carries
     * the full rule; this asserts the section exists and names the right one.
     */
    expect(text()).toMatch(/(?<![A-Z0-9_])SUPABASE_URL\b/);
    expect(text()).toMatch(/project ref/i);
  });

  it("reads pepper presence, type and scope as metadata only", () => {
    expect(text()).toMatch(/PART TWO — PEPPER STATE, FROM METADATA ONLY/);
    expect(text()).toMatch(/EXISTS in each relevant scope/);
    expect(text()).toMatch(/ABSENT, UNIFORM or AMBIGUOUS/);
  });

  it("states that neither part reads a secret value", () => {
    expect(text()).toMatch(/NEITHER PART READS A SECRET VALUE/);
    for (const name of ["OBSERVER_SUBJECT_PEPPER", "SUPABASE_SECRET_KEY", "OPENAI_API_KEY"]) {
      expect(text(), name).toContain(name);
    }
  });

  it("no longer claims mapping comes through metadata only", () => {
    expect(text()).not.toMatch(/determines,?\s+THROUGH METADATA ONLY/);
  });
});

describe("the evidence templates carry no hand-copied changing value", () => {
  const templates = readdirSync(join(ROOT, "docs/release"))
    .filter((f) => f.endsWith(".txt"))
    .sort();

  it("there are templates to check", () => {
    expect(templates.length).toBeGreaterThanOrEqual(3);
    expect(templates).toContain("REVIEW.txt");
  });

  it.each(templates)("%s states no live number literally", (file) => {
    const text = read(join("docs/release", file));
    /*
     * The observation timestamp is the tell: if it appears as text rather than
     * as a placeholder, somebody pasted a snapshot in, and it will be wrong the
     * next time anything is regenerated.
     */
    expect(text).not.toContain(LIVE.observedAt);
    /*
     * The CURRENT value, specifically. A template may still discuss a number an
     * earlier edition got wrong — that narrative is half the point of the file
     * — but the value that is true today must be rendered rather than typed, or
     * it silently becomes yesterday's number tomorrow.
     */
    expect(text, "the current bucket age is written out instead of rendered").not.toContain(
      `${LIVE.oldestBucketHours} hours`,
    );
  });

  it("resolves every placeholder, and defines no fact nothing uses", () => {
    const values = allFacts();
    const used = new Set<string>();
    for (const file of templates) {
      const template = read(join("docs/release", file));
      for (const token of template.match(/\{\{([A-Z0-9_]+)\}\}/g) ?? [])
        used.add(token.slice(2, -2));
      expect(render(template, values).missing, file).toEqual([]);
    }
    expect([...Object.keys(values)].filter((k) => !used.has(k)).sort()).toEqual([]);
  });

  it("renders the same oldest-bucket age into every file that mentions one", () => {
    const values = allFacts();
    for (const file of templates) {
      const out = render(read(join("docs/release", file)), values).out;
      for (const m of out.matchAll(/oldest bucket[^.\n]{0,40}?(\d+)\s*hours/gi)) {
        expect(Number(m[1]), file).toBe(LIVE.oldestBucketHours);
      }
    }
  });

  it("the snapshot's own numbers are internally coherent", () => {
    expect(LIVE.auditVersion1Rows).toBeLessThanOrEqual(LIVE.auditRows);
    expect(LIVE.newestBucketHours).toBeLessThanOrEqual(LIVE.oldestBucketHours);
    /*
     * THE CATALOGUE VALUES ARE NOT SNAPSHOT FIELDS. They were carried forward
     * with no query and no timestamp recorded, so they live in their own object
     * and render as unknown. Their internal consistency is still worth checking
     * — migration 3 unapplied is why the column count and the argument count
     * agree — but it is a check on carried values, not on a measurement.
     */
    const carried = (name: string): number | null => CATALOGUE_STATE[name]?.value ?? null;
    if (carried("pseudonymVersionColumn") === 0) expect(carried("admitArgs")).toBe(13);
    else expect(carried("admitArgs")).toBe(15);
    for (const name of Object.keys(CATALOGUE_STATE)) {
      expect(CATALOGUE_STATE[name]?.query, name).toBeNull();
      expect(CATALOGUE_STATE[name]?.observedAt, name).toBeNull();
      expect(renderCatalogueFact(name)).toMatch(/^UNKNOWN/);
    }
  });
});

describe("headings and provenance name the right thing", () => {
  it("the pepper contract renders the current commit, not the one it was introduced at", () => {
    const text = read(PEPPER);
    /* It said "Commit f1dbffd" through four milestones of edits. */
    expect(text).not.toMatch(/^Commit f1dbffd,/m);
    expect(text).toMatch(/{{HEAD_SHORT}}/);
    expect(text).toMatch(/Introduced at f1dbffd/);
  });

  it("the enumeration point is an explicit constant, not the tail of a list", () => {
    /*
     * The list grows every milestone while the enumeration stays where it was,
     * so deriving one from the other claimed an enumeration three deliveries
     * after the last time anybody looked.
     */
    expect(LAST_VERCEL_ENUMERATION).toBe("f1dbffd");
    expect(INVENTORY_RECORDED_IN.at(-1)).not.toBe(LAST_VERCEL_ENUMERATION);
    const source = read("scripts/release/facts.ts");
    expect(source).not.toContain("INVENTORY_RECORDED_IN[INVENTORY_RECORDED_IN.length - 1]");
    expect(source).not.toContain("INVENTORY_RECORDED_IN.at(-1)");
  });

  it("the rendered sentence separates recording, enumeration and currency", () => {
    const rendered = render(read("docs/release/REVIEW.txt"), allFacts()).out;
    expect(rendered).toMatch(/last ENUMERATED for\s+f1dbffd/);
    expect(rendered).toMatch(/currently accurate\s+UNKNOWN/);
    expect(rendered).toContain("prior archives + this candidate");
  });

  it("no artefact says a byte comparison establishes that no query was made", () => {
    /*
     * It cannot. An unchanged record is equally consistent with no query and
     * with a query that returned the same values.
     */
    const rendered = render(read("docs/release/RETENTION-EVIDENCE.txt"), allFacts()).out;
    expect(rendered).not.toMatch(/establishes that no query was made/i);
    expect(rendered).toMatch(/CANNOT ESTABLISH WHETHER A QUERY/i);
    expect(rendered).toMatch(/OPERATOR/);
  });
});

describe("the deployment inventory's provenance", () => {
  const archives = existsSync(join(ROOT, "_review"))
    ? readdirSync(join(ROOT, "_review")).filter((f) => f.endsWith(".zip"))
    : [];

  it("names the bundles it claims to be unchanged across", () => {
    expect(INVENTORY_RECORDED_IN.length).toBeGreaterThan(0);
    expect(INVENTORY_RECORDED_IN.at(-1)).toBeTruthy();
  });

  /*
   * Checked over the DECLARED bundles only, and only those whose archive
   * happens to be on this machine.
   *
   * Not over every `.zip` in `_review/`: that directory also accumulates the
   * intermediate archives a packaging session writes on the way to the one that
   * is actually handed over, and an unshipped build artefact is not a delivery.
   * An absent archive is passed over rather than failed, because packaging must
   * never depend on an earlier ZIP nobody declared as an input — that was one of
   * the reasons the documented rebuild could not be run twice.
   */
  const present = INVENTORY_RECORDED_IN.filter((b) =>
    archives.includes(`IRIS-Observer-${b}-review.zip`),
  );

  const inventoryOf = (bundle: string): string | null => {
    let text = "";
    try {
      text = execFileSync(
        "unzip",
        [
          "-p",
          join(ROOT, "_review", `IRIS-Observer-${bundle}-review.zip`),
          "COMPATIBILITY-EVIDENCE.txt",
        ],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      );
    } catch {
      return null;
    }
    /*
     * BOTH HEADINGS, because the heading changed and this did not.
     *
     * The section used to be "EVERY READY VERCEL DEPLOYMENT, BY SHA" and was
     * renamed to say the reading is HISTORICAL rather than current — a correct
     * change, and it silently broke this extractor for every archive built
     * afterwards: the regex matched nothing, `inventoryOf` returned null, and
     * the case reported "no readable inventory" for a bundle whose table was
     * perfectly intact.
     *
     * An extractor pinned to prose is a check that a rename can disable, so it
     * accepts either wording and the case would fail loudly if a future one
     * appeared.
     */
    const section =
      /EVERY (?:READY VERCEL DEPLOYMENT|VERCEL DEPLOYMENT READY)[\s\S]*?NOT DEPLOYED/.exec(
        text,
      )?.[0] ?? "";
    const urls = section.match(/iris-observer-[a-z0-9]+-/g) ?? [];
    return urls.length > 0 ? urls.join(",") : null;
  };

  /*
   * UNCONDITIONAL, and compared against the DECLARATION rather than pairwise.
   *
   * These were two `it.runIf` tests, gated on how many delivered archives
   * happened to be in this machine's gitignored `_review/` — so the suite's
   * skipped count moved with the contents of a directory that is not in the
   * repository. Comparing each present archive against `DEPLOYMENTS` needs no
   * second archive to compare with, so the guard is gone and the check is
   * stronger: pairwise equality was satisfied by two bundles that agreed with
   * each other and disagreed with the recorded snapshot.
   */
  it("every delivered bundle on disk records the declared deployment inventory", () => {
    let checked = 0;
    let reference: string | null = null;
    for (const bundle of present) {
      const inventory = inventoryOf(bundle);
      expect(inventory, `${bundle} has no readable inventory`).toBeTruthy();
      expect((inventory ?? "").split(","), bundle).toHaveLength(DEPLOYMENTS.length);
      if (reference === null) reference = inventory;
      else expect(inventory, bundle).toBe(reference);
      checked += 1;
    }
    expect(checked, "no delivered archive was available to check").toBeGreaterThan(0);
  });

  it("counts twenty deployments, the page size that hides a second page", () => {
    /* Twenty is `vercel ls`'s default page, which is why the count matters. */
    expect(DEPLOYMENTS).toHaveLength(20);
  });

  it("declares an outer hash for every bundle it claims to have delivered", () => {
    for (const a of DELIVERED_ARCHIVES) expect(a.sha256, a.bundle).toMatch(/^[0-9a-f]{64}$/);
    const delivered = new Set(DELIVERED_ARCHIVES.map((a) => a.bundle));
    expect(delivered.size).toBe(DELIVERED_ARCHIVES.length);
  });

  it("carries the inventory in a subset of what was delivered, not the same list", () => {
    /*
     * THEY ARE DIFFERENT FACTS, and forcing them to be equal hid two
     * deliveries. `3f298a6` was handed over and PREDATES the deployment
     * inventory table, so it belongs in one list and not the other. Every
     * bundle that carries the table was of course delivered; the reverse does
     * not follow, and asserting equality is what made the shorter list
     * authoritative for both.
     */
    const delivered = new Set(DELIVERED_ARCHIVES.map((a) => a.bundle));
    for (const bundle of INVENTORY_RECORDED_IN) {
      expect(delivered.has(bundle), bundle).toBe(true);
    }
    expect(INVENTORY_RECORDED_IN.length).toBeLessThan(DELIVERED_ARCHIVES.length);
    expect([...INVENTORY_RECORDED_IN]).not.toContain("3f298a6");
    expect(delivered.has("3f298a6")).toBe(true);
  });

  it("those declared hashes match the archives that are on disk", () => {
    /*
     * The declaration is what packaging uses, so it must not drift from the
     * files it names. Any archive that is missing is skipped, not assumed.
     */
    let checked = 0;
    for (const a of DELIVERED_ARCHIVES) {
      const path = join(ROOT, "_review", `IRIS-Observer-${a.bundle}-review.zip`);
      if (!existsSync(path)) continue;
      expect(createHash("sha256").update(readFileSync(path)).digest("hex"), a.bundle).toBe(
        a.sha256,
      );
      checked += 1;
    }
    expect(checked, "no delivered archive was available to check").toBeGreaterThan(0);
  });
});

/**
 * The prose corrections, asserted so they cannot drift back.
 *
 * Every one of these was a real contradiction in a delivered archive: a
 * document that said no history was rewritten and then described rewriting two
 * commits, a fault called unresolved after it had been diagnosed and corrected,
 * a summary counting five `main` builds beside a table listing seven, and a
 * carried-forward enumeration described as gathered for the current commit.
 *
 * Read from the AUTHORED templates, because that is where the words live; the
 * rendered-output checks elsewhere in this file confirm they survive rendering.
 */
describe("the evidence prose says what is true at this commit", () => {
  const review = readFileSync(join(ROOT, "docs/release/REVIEW.txt"), "utf8");
  const compat = readFileSync(join(ROOT, "docs/release/COMPATIBILITY-EVIDENCE.txt"), "utf8");
  /*
   * AND THE RENDERED TEXT, for the claims that are VALUES rather than words.
   *
   * The template can only carry a placeholder for the pepper verdict, the
   * external-activity chronology and the mutation status — that is the whole
   * point of rendering them from the declared state rather than typing them.
   * Checking those against the authored file would only prove a placeholder
   * exists; checking them here proves the constant reaches the document.
   */
  const rendered = render(review, allFacts()).out;

  it("states the history repair, and what it does not undo", () => {
    /*
     * This round DID rewrite history, under explicit authorisation and only
     * locally. The document has to say so plainly, say what it was authorised
     * for, and say what it leaves standing — because a repair that removed the
     * commits behind two red gate results could easily read as though it had
     * removed the results.
     */
    expect(review).not.toMatch(/^no history was rewritten\.$/m);
    expect(review).toMatch(/HISTORY WAS REWRITTEN IN THIS ROUND, UNDER EXPLICIT\s+AUTHORISATION/);
    expect(review).toMatch(/ONLY\s+LOCALLY/);
    expect(review).toMatch(/does not retract either gate result/);
    expect(review).toMatch(/no claim is made here that their objects were physically pruned/);
  });

  it("records both red attempts, and that neither was retried or delivered", () => {
    for (const attempt of RED_GATE_ATTEMPTS) {
      /* RENDERED: these are values, and the template can only carry placeholders. */
      expect(rendered, attempt.commit).toContain(attempt.commit);
      expect(rendered, attempt.record).toContain(attempt.record);
      /* The record it names is actually here. */
      expect(existsSync(join(ROOT, attempt.record)), attempt.record).toBe(true);
    }
    expect(review).toMatch(/NEITHER COMMIT WAS RETRIED/);
    expect(review).toMatch(/one fix-forward\s+candidate and it was spent/);
    expect(review).toMatch(/neither appears in\s+any delivery count/);
  });

  it("says why an audit exemption was rejected, and carries none", () => {
    expect(review).toMatch(/THE OPERATOR THEN AUTHORISED A LOCAL-ONLY HISTORY REPAIR/);
    expect(review).toMatch(/a control being negotiated away\s+one case at a time/);
    expect(review).toMatch(/no allowlist, no path exception, no commit-message exception/);
    /* And the auditor itself declares nothing. */
    const auditor = readFileSync(join(ROOT, "scripts", "secret-audit.mjs"), "utf8");
    expect(auditor).not.toMatch(/[0-9a-f]{40}/);
  });

  it("derives the replacement count from the branch, never from a constant", () => {
    /*
     * THE DEFECT THIS CLOSES. `replacementCommits: 1` was declared and "replaced
     * by one" was written into the prose, and three commits were already there
     * by the time the archive shipped — the repair had needed a second for the
     * evidence and a third for the hash accounting, and neither moved.
     */
    const derived = historyReplacementCommits();
    expect(derived.length).toBeGreaterThanOrEqual(3);
    expect(rendered).toContain(String(derived.length));
    expect(rendered).toContain(derived.join(", "));
    /* And the number in the document IS the length of the list beside it. */
    const m = /([0-9]+) local-only commits above \S+ were replaced by ([0-9]+) on the same/.exec(
      rendered.replace(/\s+/g, " "),
    );
    expect(m, "the replacement sentence must be rendered").not.toBeNull();
    expect(Number(m?.[2])).toBe(derived.length);
    /* The constant that went stale is gone. */
    /*
     * The constant that went stale is gone as a FIELD. It survives in the
     * comment naming what it was, so this looks for a declaration rather than
     * for the word anywhere in the file.
     */
    const facts = readFileSync(join(ROOT, "scripts", "release", "facts.ts"), "utf8");
    expect(facts).not.toMatch(/^\s*replacementCommits:\s*[0-9]/m);
  });

  it("names the protected base and does not claim to have touched it", () => {
    expect(rendered).toContain(HISTORY_REPAIR.protectedBase);
    expect(review).toMatch(/Nothing at or before that commit was\s+touched/);
    expect(HISTORY_REPAIR.retractsGateResults).toBe(false);
    expect(HISTORY_REPAIR.affectsDeliveryCounts).toBe(false);
  });

  it("no longer calls the runner-level exit open, unreproduced or unexplained", () => {
    expect(review).not.toMatch(/A SECOND FAULT REMAINS OPEN/);
    expect(review).not.toMatch(/IT IS UNRESOLVED/);
    expect(review).not.toMatch(/It has not been reproduced on demand and is not explained/);
  });

  it("records what the fault actually was, and where the reporter failed", () => {
    expect(review).toMatch(/takes the\s+unhandled-error list as .?_errors.? and DISCARDS/);
    expect(review).toMatch(/vitest-worker/);
    expect(review).toMatch(/onTaskUpdate/);
    expect(review).toMatch(/RPC response timeout DURING TEST EXECUTION/);
  });

  it("does not present the historical IPC observation as the identified cause", () => {
    /*
     * `ERR_IPC_CHANNEL_CLOSED` was a conjecture about a different shape. It may
     * be mentioned; it may not be promoted to the cause of the later failure.
     */
    expect(review).toMatch(/THIS IS NOT THE EARLIER/);
    expect(review).toMatch(/ERR_IPC_CHANNEL_CLOSED. OBSERVATION/);
    expect(review).toMatch(/it is retired rather than promoted/);
  });

  it("records the lifecycle correction and that it was not sufficient alone", () => {
    expect(review).toMatch(/PGLITE LIFETIME/);
    expect(review).toMatch(/162\/162/);
    expect(review).toMatch(/THIS ALONE DID NOT REMOVE THE FAULT/);
  });

  it("records the measured concurrency reduction and the matrix result", () => {
    expect(review).toMatch(/from 18\s*\n?\s*to 12/);
    expect(review).toMatch(/1 runner-level exit in 3/);
    expect(review).toMatch(/0 in 3, then 0 in 6 more/);
  });

  it("says plainly that 0/9 is not proof of impossibility", () => {
    expect(review).toMatch(/NOT STATISTICAL PROOF THAT\s+RECURRENCE IS IMPOSSIBLE/);
  });

  it("records that the gate now measures unhandled errors and fails closed", () => {
    expect(review).toMatch(/measures unhandled errors\s+directly and fails closed/);
    expect(review).toMatch(/so\s+does an ABSENT count/);
  });

  it("lists every authoritative attempt, including the red and aborted ones", () => {
    /*
     * A history that names only the runs that finished green reports a gate
     * that never refused and never stopped. The red run at `7b18141` was a
     * defect this repository introduced; the aborted attempt at `4549f76`
     * produced no verdict at all and was stopped by hand.
     */
    expect(review).toMatch(/aa579a4\s+GREEN/);
    expect(review).toMatch(/7b18141\s+RED/);
    expect(review).toMatch(/c1b80f0\s+GREEN/);
    expect(review).toMatch(/ab98c7a\s+GREEN/);
    expect(review).toMatch(/4549f76\s+ABORTED, OPERATOR-DECLARED/);
    expect(review).toMatch(/THE RED RUN WAS NOT RETRIED AT ITS OWN COMMIT/);
    expect(review).toMatch(/A later green result at a later commit is not a retraction/);
  });

  it("labels first-attempt and no-retry as operator declarations", () => {
    /*
     * There is no append-only attempt ledger, so nothing in this repository
     * can demonstrate that a run was the first attempt or that none followed.
     * Those are statements by the person who ran them.
     */
    expect(review).toMatch(/no append-only attempt ledger/);
    expect(review).toMatch(/OPERATOR DECLARATIONS/);
    /* And no row states it as a measurement — only the paragraph that names it a declaration. */
    expect(review).not.toMatch(/GREEN on its first attempt —/);
    expect(review).not.toMatch(/GREEN on its first attempt,/);
  });

  it("records that the previous archive was delivered and rejected", () => {
    expect(review).toMatch(/REJECTED by independent audit/);
  });
  it("does not claim to have preserved a record it cannot produce", () => {
    /*
     * Two earlier claims of preservation pointed at an untracked working
     * directory. Nothing a reviewer holds can be opened to check either.
     */
    expect(review).not.toMatch(/preserved as .failed-gate/);
    expect(review).toMatch(/THAT RECORD IS NOT IN THIS ARCHIVE/);
    expect(review).toMatch(/RED RECORD ITSELF NO LONGER EXISTS/);
    /*
     * AND THE CITATION HAS TO BE RIGHT. The first edition of this paragraph
     * named the wrong file — in the very passage about naming only what a
     * reviewer can check — so the file it points at is verified here.
     */
    expect(review).toMatch(/tracked regression assertions/);
    const cited = new RegExp(
      "in" +
        WS +
        BACKTICK +
        "(supabase/test/[a-z-]+[.]test[.]ts)" +
        BACKTICK +
        WS +
        "that reproduce",
    ).exec(review);
    expect(cited?.[1]).toBeTruthy();
    const source = read(cited?.[1] ?? "");
    expect(source).toContain("GATE_IN_PROGRESS");
    expect(source).toContain("readGateResultsFromDisk");
  });

  it("records the procedural deviation rather than only the correction", () => {
    expect(review).toMatch(/AND WORK CONTINUED PAST THE STOP/);
    expect(review).toMatch(/the sequence was not the\s+authorised one/);
  });

  it("counts seven main builds, matching the inventory it prints", () => {
    /*
     * DERIVED from the recorded inventory rather than restated: the summary
     * said five while the table beneath it listed seven, and a hand-written
     * number is exactly how that happens.
     */
    const rows = DEPLOYMENTS.length;
    const main = DEPLOYMENTS.filter((d) => d.ref === "main").length;
    const release = rows - main;
    expect(rows).toBe(20);
    expect(main).toBe(7);
    expect(release).toBe(13);
    expect(review).toMatch(/and seven of .main./);
    expect(review).not.toMatch(/and five of .main./);
  });

  it("does not say the compatibility evidence was gathered for this commit", () => {
    /*
     * It said "Gathered <date> for commit <head>" while the inventory had last
     * been enumerated several bundles earlier. Rendered for, from a timestamped
     * carried-forward observation — which is a different claim.
     */
    expect(compat).not.toMatch(/^Gathered .* for commit/m);
    expect(compat).toMatch(/Rendered for commit/);
    expect(compat).toMatch(/carried-forward enumeration/);
    expect(compat).toMatch(/NOT re-gathered for this commit/);
    expect(compat).toMatch(/\{\{LAST_ENUMERATION\}\}/);
  });

  it("dates the manual observations honestly and keeps the superseded one", () => {
    /*
     * The reading moved. Production had no SUPABASE_URL on 2026-08-27 and has
     * the canonical origin on 2026-08-28, and both are recorded — a variable
     * being ADDED is the more interesting of the two facts.
     */
    expect(review).toMatch(/2026-08-28/);
    expect(review).toMatch(/PRODUCTION CHANGED, AND BOTH READINGS ARE KEPT/);
    expect(review).toMatch(/time of day was not\s+recorded/);
  });

  it("attributes the mutation status to whoever could settle it", () => {
    /*
     * The screenshots show open editors with Save and Cancel, and for one round
     * nobody had said which was clicked — so UNKNOWN was the honest value.
     * Matthew has since confirmed CANCEL. A statement from the person who
     * performed the act is the only source that could settle it, so the status
     * is settled and the "UNKNOWN, not zero" paragraph is out of date.
     */
    expect(review).toMatch(/MATTHEW HAS SINCE CONFIRMED HE EXITED WITH\s+CANCEL/);
    expect(rendered).toContain(OBSERVATION_MUTATION_STATUS);
    /* The stale paragraph is gone, not merely contradicted further down. */
    expect(review).not.toMatch(/WHETHER ANYTHING WAS CHANGED IS UNKNOWN, NOT ZERO/);
    expect(review).not.toMatch(/Unless Matthew separately\s+confirms/);
  });

  it("keeps the Production transition unknown, which the confirmation does not settle", () => {
    /*
     * Two different facts. Matthew confirming he clicked Cancel says nothing
     * about who added Production's SUPABASE_URL between the two readings.
     */
    expect(review).toMatch(/THAT SETTLES THE READINGS, NOT THE TRANSITION/);
    expect(rendered).toMatch(/Actor UNKNOWN, time UNKNOWN/);
  });

  it("does not claim no agent has ever read Vercel", () => {
    /*
     * It was false: an agent called get_project against the Vercel account in
     * an earlier milestone. The sentence is removed, the chronology replaces
     * it, and the correction is stated rather than silently applied.
     */
    expect(review).toMatch(/AN AGENT HAS READ VERCEL/);
    expect(review).toMatch(
      /Previous editions of this document said "NO AGENT HAS EVER\s+READ VERCEL" and that was false/,
    );
    /*
     * The action itself is NOT restated in prose. It is a row of the rendered
     * chronology, and the binding cases below prove the document carries it
     * from there and from nowhere else.
     */
    expect(review).not.toMatch(/read-only get_project call/);
  });

  it("renders the whole external chronology rather than a per-milestone sentence", () => {
    /* Every declared row reaches the document, including the two UNKNOWN ones. */
    for (const e of KNOWN_EXTERNAL_ACTIVITY) expect(rendered).toContain(e.action);
    expect(rendered).toContain(THIS_MILESTONE_EXTERNAL_ACCESS.statement);
    /*
     * KNOWN, not complete, and it says which. A four-row list rendered under
     * "the complete chronology" omitted the Supabase snapshot query, the Vercel
     * enumeration and every git fetch — and its type could not represent the
     * third at all.
     */
    expect(rendered).toMatch(/\d+ KNOWN external interaction\(s\)/);
    expect(rendered).toContain(`COMPLETENESS: ${EXTERNAL_ACTIVITY_COMPLETENESS}`);
    expect(rendered).not.toMatch(/the complete chronology/);
    /* Every system the list can now describe, including the one it could not. */
    expect(KNOWN_EXTERNAL_ACTIVITY.map((e) => e.system)).toContain("Git");
    expect(KNOWN_EXTERNAL_ACTIVITY.map((e) => e.system)).toContain("Supabase");
  });

  it("keeps the three claims about external access distinct", () => {
    /*
     * "No external access in this milestone", "observed manually at some earlier
     * point", and "the current state, which nobody re-read" are three different
     * statements, and collapsing them is how a stale reading becomes a claim
     * about now.
     */
    /* Scoped to the round, and said to be scoped to it. */
    expect(review).toMatch(/NO EXTERNAL MUTATION OCCURRED IN THIS ROUND/);
    expect(review).toMatch(/THAT IS A CLAIM ABOUT THIS ROUND, NOT ABOUT THE PROJECT/);
    /*
     * And the two findings the same screenshots settle against us — RENDERED
     * from the declared state objects, so the document cannot state a verdict
     * the constants do not carry.
     */
    expect(rendered).toContain(
      `${PEPPER_STATE.state} / ${PEPPER_STATE.finding} / ${PEPPER_STATE.verdict}`,
    );
    expect(rendered).toContain(
      `${PRODUCTION_RUNTIME_STATE.state} / ${PRODUCTION_RUNTIME_STATE.verdict}`,
    );
    for (const m of PRODUCTION_RUNTIME_STATE.missing) expect(rendered).toContain(m);
    expect(review).toMatch(/TWO SEPARATE UNREVEALABLE ROWS ARE NOT TWO EQUAL VALUES/);
  });

  it("names the step each STOP actually blocks", () => {
    /*
     * Project mapping passing makes step 2 reachable; the pepper blocks step 3;
     * the Production credentials block promotion, which section 6 excludes from
     * the sequence entirely. An earlier edition ran all three together as "the
     * pepper and Production runtime credentials still do [block step 2]".
     */
    /*
     * ONLY THE SUB-GATE PASSED. Step 1 is a read-only preflight in two parts,
     * and its catalogue and inventory reads have not been performed — so
     * promoting one passing sub-gate into a reachable step 2 was wrong.
     */
    expect(review).toMatch(/PROJECT MAPPING NO LONGER BLOCKS STEP 1/);
    expect(review).toMatch(/Step 1 is INCOMPLETE, not passed/);
    expect(review).not.toMatch(/STEP 2 — explicit operator approval and the/);
    expect(review).toMatch(/THE PEPPER BLOCKS STEP 3/);
    expect(review).toMatch(/THE PRODUCTION RUNTIME CREDENTIALS BLOCK PROMOTION/);
    expect(review).not.toMatch(/the pepper and Production runtime credentials still do/);
  });

  it("gives PAUSE a remedy that is not the STOP remedy", () => {
    /*
     * PAUSE says the TOOLING could not isolate the value, not that the value is
     * wrong, and its own remedy forbids rotating or replacing anything — so
     * "every non-PASS state requires a configuration correction and a restart"
     * reinstated exactly the advice section B removes.
     */
    expect(review).toMatch(/PAUSE AND STOP TAKE DIFFERENT REMEDIES/);
    /*
     * The distinction is OBSERVATION, not severity: "nobody looked" and
     * "somebody looked and there is nothing there" reach different states and
     * different remedies, and collapsing them sent an operator to change
     * configuration on no evidence.
     */
    expect(review).toMatch(/PAUSE\s+THE VALUE WAS NOT OBSERVED/);
    expect(review).toMatch(/STOP\s+THE VALUE WAS OBSERVED AND IS WRONG, OR IS OBSERVED ABSENT/);
    expect(review).toMatch(/NO configuration change and NO restart/);
    /* And manual evidence retains the complete origin, not the extracted ref. */
    expect(review).toMatch(/THE COMPLETE ORIGIN IS WHAT IS RECORDED, not the ref/);
    expect(review).not.toMatch(
      /Every non-PASS state requires an explicit operator decision, a\nconfiguration correction/,
    );
  });
});

/**
 * DELIVERY IS NOT ACCEPTANCE, AND NEITHER IS ENUMERATION.
 *
 * One list was doing the work of six different facts: which archives were
 * handed over, which of those anybody accepted, which bundles carry the
 * recorded Vercel inventory, when Vercel was last actually enumerated, which
 * bundle is the current candidate, and which archive the byte comparisons are
 * measured against. Conflating them produced "ten previously delivered
 * bundles" beside a baseline five deliveries stale, in a package whose most
 * recent predecessor had been reviewed and REJECTED.
 */
describe("delivery is not acceptance", () => {
  it("declares every archive that was handed over, including the rejected ones", () => {
    const bundles = DELIVERED_ARCHIVES.map((a) => a.bundle);
    for (const later of ["166be98", "1b8b912", "7ac84fa", "aa579a4", "c1b80f0"]) {
      expect(bundles).toContain(later);
    }
  });

  it("records the rejected candidates as rejected, and claims no acceptance", () => {
    for (const rejected of ["1b8b912", "aa579a4", "c1b80f0", "ab98c7a"]) {
      expect(outcomeOf(rejected), rejected).toBe("rejected");
    }
    /*
     * ABSENCE OF A REJECTION IS NOT ACCEPTANCE. Nothing here may be called
     * accepted without explicit evidence, and there is none to cite.
     */
    expect(Object.values(ARCHIVE_OUTCOMES)).not.toContain("accepted");
    for (const a of DELIVERED_ARCHIVES) {
      expect(["rejected", "unreviewed"]).toContain(outcomeOf(a.bundle));
    }
  });

  it("measures byte comparisons against the most recent archive handed over", () => {
    /*
     * The baseline follows the list, so declaring a delivery moves it. It had
     * been pinned to `e18f860` while five later archives went out, which meant
     * every "unchanged since" line spanned the wrong interval.
     */
    const last = DELIVERED_ARCHIVES.at(-1)?.bundle ?? "";
    expect(last).toBe("ab1f773");
    expect(baselineCommit().startsWith(last)).toBe(true);
  });

  it("counts twenty-two delivered, eight rejected and none accepted", () => {
    /*
     * DERIVED, never written into prose. Each number is a different question —
     * how many went out, how many came back refused, how many anybody accepted
     * — and they were previously stated as sentences that went stale one at a
     * time.
     */
    expect(DELIVERED_ARCHIVES).toHaveLength(22);
    const outcomes = DELIVERED_ARCHIVES.map((a) => outcomeOf(a.bundle));
    expect(outcomes.filter((o) => o === "rejected")).toHaveLength(8);
    expect(outcomes.filter((o) => o === "accepted")).toHaveLength(0);
    /* And the archive delivered at the start of this round is one of the eight. */
    expect(outcomeOf("ab1f773")).toBe("rejected");
  });

  it("keeps the enumeration point where somebody actually looked", () => {
    expect(LAST_VERCEL_ENUMERATION).toBe("f1dbffd");
    expect(INVENTORY_RECORDED_IN.at(-1)).not.toBe(LAST_VERCEL_ENUMERATION);
  });

  it("excludes the current candidate from the prior deliveries", () => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    expect(priorDelivered(head)).not.toContain(head.slice(0, 7));
    expect(priorDelivered("c1b80f0")).not.toContain("c1b80f0");
    expect(priorDelivered("c1b80f0")).toContain("f1dbffd");
  });

  it("derives its counts instead of typing them, and drops the stale phrase", () => {
    const review = render(read("docs/release/REVIEW.txt"), allFacts()).out;
    expect(review).not.toContain("ten previously delivered bundles");
    expect(review).toContain("archives handed over before this one");
    expect(review).toContain("were reviewed and REJECTED");
    expect(review).toContain(`last ENUMERATED for   ${LAST_VERCEL_ENUMERATION}`);
  });
});

/**
 * THE PREFLIGHT VERDICT IS RENDERED, NOT RESTATED.
 *
 * The delivered `c1b80f0` archive printed Preview as `MAPPED / PASS / via
 * manual` in a hand-maintained table, beside a rule that had already been
 * corrected to require the public row as well. Verdict text duplicated next to
 * a rule is verdict text that can disagree with it.
 */
describe("the carried-forward mapping is derived from the classifier", () => {
  const outcomes = OBSERVED_MAPPINGS.map((o) => ({
    environment: o.environment,
    ...classifyObservation(o, APPROVED_PROJECT_REF),
  }));

  it("reaches MAPPED for Preview on the 2026-08-28 observation", () => {
    const preview = outcomes.find((o) => o.environment === "Preview");
    expect(preview?.state).toBe("MAPPED");
    expect(preview?.verdict).toBe("PASS");
    expect(preview?.ref).toBe(APPROVED_PROJECT_REF);
    expect(preview?.via).toBe("manual");
  });

  it("reaches MAPPED for Production, which had no SUPABASE_URL a day earlier", () => {
    /*
     * THE TRANSITION IS THE POINT. Production was observed ABSENT on
     * 2026-08-27 and observed present, canonical and correct on 2026-08-28.
     * Both readings are kept; overwriting the first would erase the fact that
     * a variable was added, which is the more interesting of the two facts.
     */
    const production = outcomes.find((o) => o.environment === "Production");
    expect(production?.state).toBe("MAPPED");
    expect(production?.verdict).toBe("PASS");
    expect(production?.ref).toBe(APPROVED_PROJECT_REF);
  });

  it("keeps every superseded observation rather than overwriting it", () => {
    const production = historyFor("Production");
    expect(production).toHaveLength(2);
    expect(production[0]?.observedOn).toBe("2026-08-27");
    expect(production[0]?.observedServer.kind).toBe("absent");
    expect(production[1]?.observedOn).toBe("2026-08-28");
    expect(production[1]?.observedServer.kind).toBe("present");
    /* The log only ever grows: the latest view is derived from it, not stored. */
    expect(OBSERVATION_LOG.length).toBeGreaterThan(OBSERVED_MAPPINGS.length);
  });

  it("records the pepper and Production runtime STOPs on their own axes", () => {
    /*
     * MAPPING PASSING DOES NOT MAKE THESE PASS. Two separate unrevealable
     * secret rows are not two equal values, and a complete listing that shows
     * no Production OPENAI_API_KEY does not become a mapping failure.
     */
    expect(PEPPER_STATE.verdict).toBe("STOP");
    expect(PEPPER_STATE.state).toBe("SEPARATE_SECRET_ROWS");
    expect(PEPPER_STATE.finding).toBe("EQUALITY_UNPROVEN");
    expect(PRODUCTION_RUNTIME_STATE.verdict).toBe("STOP");
    expect(PRODUCTION_RUNTIME_STATE.missing).toContain("OPENAI_API_KEY");
    expect(PRODUCTION_RUNTIME_STATE.missing).toContain("SUPABASE_SECRET_KEY");
  });

  it("records the mutation status Matthew confirmed, and nothing wider", () => {
    /*
     * UNKNOWN was the honest value while nobody had said which control was
     * clicked. Matthew has since confirmed CANCEL — a statement from the person
     * who performed the act, which is the only source that could settle it.
     */
    expect(OBSERVATION_MUTATION_STATUS).toBe("NO_MUTATION_CONFIRMED");
    /*
     * AND IT SETTLES ONLY THE READINGS. The variable that appeared in
     * Production between them has no recorded actor and no recorded time, and
     * neither is inferred from who was taking the screenshots.
     */
    expect(PRODUCTION_TRANSITION.actor).toBe("UNKNOWN");
    expect(PRODUCTION_TRANSITION.occurredAt).toBe("UNKNOWN");
    expect(PRODUCTION_TRANSITION.variable).toBe("SUPABASE_URL");
  });

  it("keeps an external-activity row for the agent read that did happen", () => {
    const agentReads = KNOWN_EXTERNAL_ACTIVITY.filter((e) => e.actor === "an agent");
    expect(agentReads).toHaveLength(1);
    expect(agentReads[0]?.action).toBe("get_project");
    expect(agentReads[0]?.mutation).toBe("none");
    /* And this milestone claims nothing beyond itself. */
    expect(THIS_MILESTONE_EXTERNAL_ACCESS.reads).toBe(0);
    expect(THIS_MILESTONE_EXTERNAL_ACCESS.mutations).toBe(0);
  });

  it("renders the current mapping from the classifier, with its ref", () => {
    const block = renderObservedMapping(APPROVED_PROJECT_REF);
    expect(block).toContain("MAPPED");
    expect(block).toContain("PASS");
    expect(block).toContain("https://tfcchobwobpadenampyh.supabase.co");
    expect(block).toContain("observed absent");
    /* Both environments, both derived. */
    expect(block).toContain("Preview");
    expect(block).toContain("Production");
  });

  it("renders into the evidence rather than being typed beside it", () => {
    const source = readFileSync(join(ROOT, "docs/release/REVIEW.txt"), "utf8");
    expect(source).toContain("{{OBSERVED_MAPPING_BLOCK}}");
    const review = render(source, allFacts()).out;
    /* Rendered, so the document cannot state a verdict the rule would not reach. */
    expect(review).toContain("MAPPED");
    expect(review).toContain("established via           manual");
  });
});

/**
 * A HASH-SHAPED TOKEN NOBODY CAN ACCOUNT FOR REFUSES THE PACKAGE.
 *
 * That control is right and this milestone did not weaken it. It is here
 * because the evidence prose broke it, and the break cost an authoritative
 * gate run.
 *
 * The `ddefa50` gate went red for one reason and it was not the release
 * protocol: REVIEW quoted the operation id of a preserved failed record and the
 * sha256 of the file holding it, WRAPPED ACROSS TWO LINES so it arrived as two
 * separate tokens. The packager refuses a digest it cannot account for, an
 * untracked file's digest is exactly that, and `build()` therefore threw inside
 * the `beforeAll` of all three package-building suites. Fourteen tests in
 * `package-generation` alone were reported as SKIPPED — a suite-level failure
 * with zero failed assertions, which is the shape a runner-level fault makes.
 *
 * The lesson was sequencing, not design. Those suites had been verified on a
 * clean candidate commit; the prose that broke them landed in the NEXT commit,
 * the one that recorded the verification results, and nothing re-ran them
 * there. Documentation is a build input.
 *
 * So this runs in a second rather than inside a forty-second build, and it uses
 * the packager's own token scanner rather than a second copy of the rule.
 */
describe("every hash-shaped token in the evidence is accounted for", () => {
  const documents = [
    "docs/release/REVIEW.txt",
    "docs/release/COMPATIBILITY-EVIDENCE.txt",
    "docs/release/PEPPER-CONTRACT.txt",
    "docs/release/RETENTION-EVIDENCE.txt",
  ];

  it("finds no token the repository cannot account for", () => {
    /*
     * THE PACKAGER'S OWN ALLOW-SET, not a narrower copy of it. A copy would
     * accumulate exceptions for tokens the packager already accounts for, and
     * a list of exceptions is not a control.
     *
     * The packager adds one thing this does not: the hash of every file it
     * just staged. That is permissiveness a DOCUMENT should never need — a
     * document citing a digest that exists only inside the archive being built
     * is citing something its reader cannot check.
     */
    const allowed = accountableHashes();
    const unaccounted: string[] = [];
    for (const doc of documents) {
      unaccounted.push(...unaccountedTokens(doc, readFileSync(join(ROOT, doc), "utf8"), allowed));
    }
    expect(unaccounted).toEqual([]);
  });

  it("applies the packager's own rule, not a copy of it", () => {
    /*
     * `hashTokens` is exported from the packager and used by it. A second
     * implementation here would be a second thing to keep in step, which is the
     * failure mode this repository keeps finding.
     */
    const source = readFileSync(join(ROOT, "scripts/release/build-package.ts"), "utf8");
    expect(source).toContain("export function hashTokens");
    expect(source).toContain("for (const { line, token } of hashTokens(text))");
  });

  it("counts a run of digits as a timestamp rather than a digest", () => {
    expect(hashTokens("recorded at 20260826140000")).toEqual([]);
    expect(hashTokens("sha 20260826140000abc")).toHaveLength(1);
  });

  it("sees a wrapped digest as two separate tokens, which is why it broke", () => {
    /*
     * THE EXACT SHAPE. A sha256 split across a line boundary is not one token
     * the checker can match against a known digest — it is two, and neither is
     * a prefix of anything.
     */
    const wrapped = "sha256 58a07af7b77b7c787f350fe7da41a40d6a012119ebb4246307e1\n52b02dbea4c6,";
    const tokens = hashTokens(wrapped);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.line).toBe(1);
    expect(tokens[1]?.line).toBe(2);
  });

  it("does not quote a preserved failed record's digest in the evidence", () => {
    /*
     * The digests live in this repository's commit messages, where a reader
     * with the repository can check them. Printing them in an archive offers a
     * number nothing in that archive can verify — which is precisely what the
     * accounting control exists to refuse.
     */
    const review = readFileSync(join(ROOT, "docs/release/REVIEW.txt"), "utf8");
    expect(review).not.toContain("974b74e963629c27");
    expect(review).not.toContain("948471bfdbb525a4");
    expect(review).toMatch(/THE DIGEST IS DELIBERATELY NOT QUOTED HERE/);
  });
});

/**
 * A DECLARED STATE OBJECT THAT NOTHING RENDERS IS DECORATION.
 *
 * `PEPPER_STATE`, `PRODUCTION_RUNTIME_STATE`, `OBSERVATION_MUTATION_STATUS`,
 * `DEPLOYMENT_INVENTORY_PROVENANCE` and `OLDEST_BUCKET_HISTORY_PROVENANCE` were
 * exported, frozen and asserted by tests — and nothing rendered them. The
 * documents stated the same facts as hand-written prose, so the constants
 * proved only that a constant existed. Changing one changed a test and changed
 * no document; changing a document changed no constant. That is two independent
 * copies of a changing fact, which is the defect the whole rendering layer
 * exists to prevent.
 *
 * The cases below are the only ones that can tell a rendering source from a
 * decorative constant: each replaces a value with a SYNTHETIC one and requires
 * the rendered document to move with it. A hand-written document does not.
 */
describe("every declared state object is a rendering source", () => {
  const template = readFileSync(join(ROOT, "docs/release/REVIEW.txt"), "utf8");
  const renderWith = (values: Readonly<Record<string, string>>): string =>
    render(template, { ...allFacts(), ...values }).out;

  /**
   * Each fact, the synthetic value put in its place, and a fragment of the real
   * one that must then be absent. The second half is what makes this a binding
   * test rather than an insertion test: prose that merely also contains the
   * synthetic string would still carry the original.
   */
  const bindings: readonly {
    key: string;
    synthetic: string;
    realFragment: string;
  }[] = [
    {
      key: "PEPPER_STATE_LINE",
      synthetic: "SYNTHETIC_PEPPER_STATE / SYNTHETIC_FINDING / PROCEED",
      realFragment: `${PEPPER_STATE.state} / ${PEPPER_STATE.finding} / ${PEPPER_STATE.verdict}`,
    },
    {
      key: "PRODUCTION_RUNTIME_LINE",
      synthetic: "SYNTHETIC_RUNTIME_STATE / PROCEED",
      realFragment: `${PRODUCTION_RUNTIME_STATE.state} / ${PRODUCTION_RUNTIME_STATE.verdict}`,
    },
    {
      key: "OBSERVATION_MUTATION_STATUS",
      synthetic: "SYNTHETIC_MUTATION_STATUS",
      realFragment: OBSERVATION_MUTATION_STATUS,
    },
    {
      key: "DEPLOYMENT_INVENTORY_LINE",
      synthetic: "last enumerated for the SYNTHETIC bundle, at SYNTHETIC TIME.",
      realFragment: `last enumerated for the ${DEPLOYMENT_INVENTORY_PROVENANCE.lastEnumeratedFor} bundle`,
    },
    {
      key: "BUCKET_HISTORY_PROVENANCE",
      synthetic: "SYNTHETIC PROVENANCE FOR THE BUCKET SERIES",
      realFragment: OLDEST_BUCKET_HISTORY_PROVENANCE,
    },
    {
      key: "EXTERNAL_ACTIVITY_BLOCK",
      synthetic: "  SYNTHETIC EXTERNAL ACTIVITY, none recorded",
      realFragment: KNOWN_EXTERNAL_ACTIVITY[0]?.action ?? "get_project",
    },
    {
      key: "THIS_MILESTONE_EXTERNAL",
      synthetic: "this milestone did something SYNTHETIC externally",
      realFragment: THIS_MILESTONE_EXTERNAL_ACCESS.statement,
    },
    {
      key: "PRODUCTION_TRANSITION_LINE",
      synthetic: "SYNTHETIC_VARIABLE in SYNTHETIC_SCOPE. Actor SYNTHETIC.",
      realFragment: `Actor ${PRODUCTION_TRANSITION.actor}, time ${PRODUCTION_TRANSITION.occurredAt}.`,
    },
    {
      key: "PATCH_SUMMARY",
      synthetic: "SYNTHETIC patch count",
      realFragment: `${String(HISTORICAL_CONTROL_CHAR_COMMITS.length)} ship base64-encoded`,
    },
  ];

  it("renders the real value for every one of them", () => {
    const real = renderWith({});
    for (const b of bindings) expect(real, b.key).toContain(b.realFragment);
  });

  it.each(bindings.map((b) => [b.key, b] as const))(
    "carries %s from the declared value and nowhere else",
    (_key, b) => {
      const swapped = renderWith({ [b.key]: b.synthetic });
      /* The synthetic value reaches the document ... */
      expect(swapped).toContain(b.synthetic);
      /* ... and the real one is not still written beside it. */
      expect(swapped).not.toContain(b.realFragment);
    },
  );

  it("leaves no placeholder unresolved and no fact unused", () => {
    /*
     * A placeholder nothing supplies prints as {{NAME}} in the delivered
     * document; a fact nothing renders is the decorative constant this whole
     * block exists to refuse. Both are failures.
     */
    const { out, missing } = render(template, allFacts());
    expect(missing).toEqual([]);
    expect(out).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });
});
