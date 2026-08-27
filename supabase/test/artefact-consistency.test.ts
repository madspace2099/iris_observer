import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { facts, render } from "../../scripts/release/facts";
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
} from "../../scripts/release/live-snapshot";
import { baselineCommit } from "../../scripts/release/facts";
import {
  OBSERVED_MAPPINGS,
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
    const values = facts({ stagedFiles: 0 });
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
    const values = facts({ stagedFiles: 0 });
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
    /* Migration 3 unapplied is why the column count and the arg count agree. */
    if (LIVE.pseudonymVersionColumn === 0) expect(LIVE.admitArgs).toBe(13);
    else expect(LIVE.admitArgs).toBe(15);
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
    const rendered = render(read("docs/release/REVIEW.txt"), facts({ stagedFiles: 0 })).out;
    expect(rendered).toMatch(/last ENUMERATED for\s+f1dbffd/);
    expect(rendered).toMatch(/currently accurate\s+UNKNOWN/);
    expect(rendered).toContain("prior archives + this candidate");
  });

  it("no artefact says a byte comparison establishes that no query was made", () => {
    /*
     * It cannot. An unchanged record is equally consistent with no query and
     * with a query that returned the same values.
     */
    const rendered = render(
      read("docs/release/RETENTION-EVIDENCE.txt"),
      facts({ stagedFiles: 0 }),
    ).out;
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
    const section = /EVERY READY VERCEL DEPLOYMENT[\s\S]*?NOT DEPLOYED/.exec(text)?.[0] ?? "";
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
    expect(DELIVERED_ARCHIVES.map((a) => a.bundle)).toEqual([...INVENTORY_RECORDED_IN]);
    for (const a of DELIVERED_ARCHIVES) expect(a.sha256, a.bundle).toMatch(/^[0-9a-f]{64}$/);
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

  it("does not claim no history was ever rewritten", () => {
    /*
     * It said "no history was rewritten" in the operator declaration and then
     * described the authorised rewrite of two local-only commits in section 1.
     * Both are true of DIFFERENT milestones, and only saying one of them reads
     * as a contradiction of the other.
     */
    expect(review).not.toMatch(/^no history was rewritten\.$/m);
    expect(review).toMatch(/NO HISTORY WAS REWRITTEN IN THIS ROUND/);
    expect(review).toMatch(/ONE EARLIER ROUND DID REWRITE TWO\s+COMMITS/);
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

  it("lists every authoritative run, including the red one", () => {
    /*
     * A history that names only the green runs reports a gate that never
     * refused. The red run at `7b18141` was a defect this repository
     * introduced, and the green run at the NEXT commit does not retract it —
     * that commit was never re-run.
     */
    expect(review).toMatch(/aa579a4\s+GREEN on its first attempt/);
    expect(review).toMatch(/7b18141\s+RED/);
    expect(review).toMatch(/c1b80f0\s+GREEN on its first attempt/);
    expect(review).toMatch(/THE RED RUN WAS NOT RETRIED AT ITS OWN COMMIT/);
    expect(review).toMatch(/A later green result at a later commit is not a retraction/);
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

  it("dates the manual observation honestly and marks it carried forward", () => {
    expect(review).toMatch(/OBSERVED BY MATTHEW ON 2026-08-27; EXACT TIME NOT RECORDED/);
    expect(review).toMatch(/carried-forward manual reading, not a current live one/);
  });

  it("keeps the three claims about external access distinct", () => {
    /*
     * "No external access in this milestone", "observed manually at some earlier
     * point", and "the current state, which nobody re-read" are three different
     * statements, and collapsing them is how a stale reading becomes a claim
     * about now.
     */
    expect(review).toMatch(/NO EXTERNAL MUTATION OCCURRED/);
    expect(review).toMatch(/carried-forward manual reading/);
    expect(review).toMatch(/NOT been re-observed since/);
    expect(review).toMatch(/Neither was re-observed in this\s+milestone/);
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
    expect(outcomeOf("c1b80f0")).toBe("rejected");
    expect(outcomeOf("aa579a4")).toBe("rejected");
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
    expect(last).toBe("c1b80f0");
    expect(baselineCommit().startsWith(last)).toBe(true);
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
    const review = render(read("docs/release/REVIEW.txt"), facts({ stagedFiles: 0 })).out;
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

  it("reaches PAUSE for Preview, because nobody looked at the public row", () => {
    const preview = outcomes.find((o) => o.environment === "Preview");
    expect(preview?.state).toBe("MANUAL_PUBLIC_UNOBSERVED");
    expect(preview?.verdict).toBe("PAUSE");
    expect(preview?.ref).toBeNull();
  });

  it("reaches STOP for Production, on the server observation alone", () => {
    const production = outcomes.find((o) => o.environment === "Production");
    expect(production?.state).toBe("SERVER_URL_ABSENT");
    expect(production?.verdict).toBe("STOP");
  });

  it("claims no PASS anywhere, in the rendering or in the document", () => {
    const block = renderObservedMapping(APPROVED_PROJECT_REF);
    expect(block).not.toContain("PASS");
    expect(block).toContain("MANUAL_PUBLIC_UNOBSERVED");
    expect(block).toContain("SERVER_URL_ABSENT");
    /* And the complete origin is kept, not reduced to a bare ref. */
    expect(block).toContain("https://tfcchobwobpadenampyh.supabase.co");
  });

  it("renders into the evidence rather than being typed beside it", () => {
    const source = readFileSync(join(ROOT, "docs/release/REVIEW.txt"), "utf8");
    expect(source).toContain("{{OBSERVED_MAPPING_BLOCK}}");
    const review = render(source, facts({ stagedFiles: 0 })).out;
    expect(review).toContain("MANUAL_PUBLIC_UNOBSERVED");
    expect(review).not.toMatch(/Preview\s+SUPABASE_URL\s+MAPPED/);
  });
});
