import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { facts, render } from "../../scripts/release/facts";
import {
  LIVE,
  DEPLOYMENTS,
  CAPABILITY,
  INVENTORY_UNCHANGED_IN,
} from "../../scripts/release/live-snapshot";

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
    expect(text()).toMatch(/PART ONE — PROJECT MAPPING, FROM A NON-SECRET VALUE/);
    expect(text()).toMatch(/SUPABASE_URL/);
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

describe("the deployment inventory's provenance", () => {
  const archives = existsSync(join(ROOT, "_review"))
    ? readdirSync(join(ROOT, "_review")).filter((f) => f.endsWith(".zip"))
    : [];

  it("names the bundles it claims to be unchanged across", () => {
    expect(INVENTORY_UNCHANGED_IN.length).toBeGreaterThan(0);
    expect(INVENTORY_UNCHANGED_IN.at(-1)).toBeTruthy();
  });

  it.runIf(archives.length > 0)("agrees with the archives actually on disk", () => {
    /*
     * Skipped rather than failed when the archives are absent. Packaging must
     * never depend on an earlier ZIP nobody declared — that was one of the
     * reasons the documented rebuild could not be run — so this is a check that
     * strengthens the claim when the evidence is there, not a requirement.
     */
    const urls = (text: string): string =>
      (text.match(/iris-observer-[a-z0-9]+-/g) ?? []).join(",");
    const found: string[] = [];
    let reference: string | null = null;
    for (const zip of archives) {
      let text = "";
      try {
        text = execFileSync(
          "unzip",
          ["-p", join(ROOT, "_review", zip), "COMPATIBILITY-EVIDENCE.txt"],
          {
            encoding: "utf8",
            maxBuffer: 32 * 1024 * 1024,
          },
        );
      } catch {
        continue;
      }
      const inventory = urls(
        /EVERY READY VERCEL DEPLOYMENT[\s\S]*?NOT DEPLOYED/.exec(text)?.[0] ?? "",
      );
      if (inventory === "") continue;
      reference ??= inventory;
      if (inventory === reference) found.push(zip.replace(/^IRIS-Observer-|-review\.zip$/g, ""));
    }
    expect(found.sort()).toEqual([...INVENTORY_UNCHANGED_IN].sort());
  });
});
