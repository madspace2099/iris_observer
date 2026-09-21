import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WRAPPERS, renderWrapper, extractBody } from "../../scripts/release/wrap-migration";

/**
 * The contract migration's own instructions must state the corrected
 * retirement policy — in the source AND in the paste wrapper.
 *
 * This file exists because of a specific failure. The rollout, the runbook and
 * the verifier were all corrected to say that a version-1-capable deployment
 * must be DELETED. The migration that actually performs the retirement was not,
 * and it is the file somebody opens at the moment they are about to close the
 * door. Its comments still described an inventory selected by AGE and offered
 * protection as an equivalent remedy — the exact belief the correction exists
 * to remove, sitting in the most authoritative place a reader could find it.
 *
 * The assertions run over BOTH artefacts, because an operator pasting SQL into
 * the Supabase editor reads the wrapper and never opens the source.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const SOURCE = "supabase/migrations/20260826090000_observer_audit_facade_cleanup.sql";
const WRAPPER = "_sql-to-paste/observer-migration-2-contract.sql";

const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

/** Comments stripped, whitespace collapsed: what the server actually runs. */
const strip = (sql: string): string =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Both artefacts, so neither can drift from the other. */
const ARTEFACTS = [
  ["migration source", SOURCE],
  ["paste wrapper", WRAPPER],
] as const;

describe("the contract migration states the corrected retirement policy", () => {
  describe.each(ARTEFACTS)("%s", (_label, path) => {
    const text = (): string => read(path);

    it("classifies TWO capabilities, not one", () => {
      expect(text()).toMatch(/LEGACY-FA(Ç|C)ADE CALLER/);
      expect(text()).toMatch(/VERSION-1-CAPABLE ADMISSION WRITER|thirteen-argument admission/i);
    });

    it("requires a version-1-capable deployment to be DELETED", () => {
      expect(text()).toMatch(/MUST BE DELETED/);
      expect(text()).toMatch(/pseudonym_version = 1/);
    });

    it("allows a legacy-façade-only deployment to be deleted OR protected, and says why", () => {
      expect(text()).toMatch(
        /deleted\s+(\*\*)?OR(\*\*)?\s+protected|DELETED OR\s*\n?--?\s*PROTECTED/i,
      );
      /* The reason matters more than the permission: the RPC stops existing. */
      expect(text()).toMatch(/removes the (RPC|function)/i);
    });

    it("says this migration does not disable thirteen-argument admission", () => {
      expect(text()).toMatch(
        /DOES NOT DISABLE THIRTEEN-ARGUMENT ADMISSION|does not close that path/i,
      );
    });

    it("names every 3f298a6 deployment, the fresh proof Preview included", () => {
      expect(text()).toMatch(/3f298a6/);
      expect(text()).toMatch(/fresh proof Preview/i);
    });

    it("classifies 1ee5d2d as neither", () => {
      expect(text()).toMatch(/1ee5d2d/);
      expect(text()).toMatch(/1ee5d2d is NEITHER|is NEITHER\./i);
      expect(text()).toMatch(/TWELVE\s+argument|twelve-argument/i);
    });

    it("requires enumeration to pagination exhaustion, repeated after deletion", () => {
      expect(text()).toMatch(/--next/);
      expect(text()).toMatch(/exhaustion/i);
      expect(text()).toMatch(/Repeat the whole enumeration after the deletions/i);
    });

    it("states what the verifier can and cannot return", () => {
      expect(text()).toMatch(/retirement_floor_ts/);
      expect(text()).toMatch(/NO-GO/);
      expect(text()).toMatch(/UNUSABLE/);
      expect(text()).toMatch(/INCONCLUSIVE/);
      expect(text()).toMatch(/NEVER RETURN READY/);
    });

    it("checks both version axes, not just audit_version", () => {
      expect(text()).toMatch(/audit_version = 1/);
      expect(text()).toMatch(/pseudonym_version = 1/);
    });

    /* ---------------- the wording that must never come back --------------- */

    it.each([
      ["protection reaches the route handler", /cannot reach its own\s*\n?--?\s*route handler/i],
      ["an inventory selected by age", /build older than the admission\/completion/i],
      ["deployments predating admit_ai_request", /predates? the one that\s*\n?--?\s*introduced/i],
      ["an unpaginated enumeration instruction", /check every READY deployment whose commit/i],
    ])("does not contain the superseded wording: %s", (_why, pattern) => {
      expect(text()).not.toMatch(pattern);
    });
  });

  describe("the edit was comments only", () => {
    it("leaves exactly three executable statements", () => {
      const statements = strip(read(SOURCE))
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      expect(statements).toHaveLength(3);
      expect(statements[0]).toMatch(/^drop function if exists public\.consume_ai_quota\(/);
      expect(statements[1]).toMatch(/^drop function if exists public\.record_ai_request\(/);
      expect(statements[2]).toBe("notify pgrst, 'reload schema'");
    });

    it("drops neither more nor fewer functions than before", () => {
      const drops = read(SOURCE).match(/^drop function/gm) ?? [];
      expect(drops).toHaveLength(2);
      /* observer.consume_ai_quota is the implementation and must survive. */
      expect(read(SOURCE)).not.toMatch(/^drop function if exists observer\./m);
    });

    it("keeps the NOTIFY inside the transaction the wrapper opens", () => {
      const wrapper = read(WRAPPER);
      const notify = wrapper.indexOf("notify pgrst");
      expect(notify).toBeGreaterThan(wrapper.indexOf("begin;"));
      expect(notify).toBeLessThan(wrapper.lastIndexOf("commit;"));
    });
  });
});

describe("every paste wrapper is generated from its source", () => {
  it.each(WRAPPERS.map((w) => [w.out, w] as const))(
    "%s body is byte-identical to its source",
    (_name, spec) => {
      const wrapper = read(join("_sql-to-paste", spec.out));
      expect(extractBody(wrapper)).toBe(read(spec.source));
    },
  );

  it.each(WRAPPERS.map((w) => [w.out, w] as const))(
    "%s header sha256 is the source's real hash",
    (_name, spec) => {
      const wrapper = read(join("_sql-to-paste", spec.out));
      const claimed = /^-- sha256\s+:\s+([0-9a-f]{64})$/m.exec(wrapper)?.[1];
      const actual = createHash("sha256")
        .update(readFileSync(join(ROOT, spec.source)))
        .digest("hex");
      expect(claimed).toBe(actual);
    },
  );

  it.each(WRAPPERS.map((w) => [w.out, w] as const))(
    "%s is exactly what the generator renders",
    (_name, spec) => {
      /*
       * The stronger claim, and the one that makes the header's "byte-identical"
       * assertion mechanical rather than aspirational: regenerating produces the
       * file already on disk. Three of these four were reproduced byte for byte
       * from hand-written originals before any of them was regenerated, which is
       * what establishes that the generator is faithful and not merely
       * self-consistent.
       */
      expect(read(join("_sql-to-paste", spec.out))).toBe(renderWrapper(spec, ROOT));
    },
  );
});
