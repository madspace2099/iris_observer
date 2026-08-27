import { describe, expect, it } from "vitest";
import { resolveServerSupabase, diagnoseServerSupabase, type EnvSource } from "@/lib/supabase-env";
import {
  classifyProjectMapping,
  projectRef,
  PROJECT_MAPPING_STATES,
} from "../../scripts/release/preflight";

/**
 * What the resolver DOES, and what the preflight DECIDES — proved separately.
 *
 * The previous test asserted that `URL_NAMES` was the array
 * `["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]`. That is a claim about a
 * literal, not about behaviour: the array could stay exactly as written while
 * `read()` stopped honouring its order, and every document built on "in that
 * order" would still read as proved. These execute the exported resolver.
 *
 * The two halves must not be confused, and the tests keep them apart on
 * purpose:
 *
 *   RUNTIME     what a deployed build actually does with the configuration it
 *               has, including the fallback to the browser-exposed variable;
 *   PREFLIGHT   what the rollout permits, which is stricter — the fallback is
 *               a STOP even though the runtime would happily proceed.
 *
 * Every URL here is synthetic. Every credential here is synthetic, fixed and
 * inert, and there is no generator anywhere in this file.
 */

/** Synthetic, fixed, and shaped only well enough to satisfy `isSecretKey`. */
const KEY = "test-secret-key-not-a-real-credential";
const APPROVED = "approvedref00000";
const OTHER = "otherref000000000";
const APPROVED_URL = `https://${APPROVED}.supabase.co`;
const OTHER_URL = `https://${OTHER}.supabase.co`;

const env = (source: Record<string, string | undefined>): EnvSource => source;

describe("the resolver's runtime behaviour", () => {
  it("prefers the server variable when both are valid", () => {
    const resolved = resolveServerSupabase(
      env({
        SUPABASE_URL: APPROVED_URL,
        NEXT_PUBLIC_SUPABASE_URL: OTHER_URL,
        SUPABASE_SECRET_KEY: KEY,
      }),
    );
    expect(resolved?.url).toBe(APPROVED_URL);
    expect(resolved?.from).toContain("SUPABASE_URL");
    expect(resolved?.from).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("falls back to the public variable when the server one is absent", () => {
    const resolved = resolveServerSupabase(
      env({ NEXT_PUBLIC_SUPABASE_URL: APPROVED_URL, SUPABASE_SECRET_KEY: KEY }),
    );
    expect(resolved?.url).toBe(APPROVED_URL);
    expect(resolved?.from).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("falls back to the public variable when the server one is blank", () => {
    /* Blank is not absent anywhere else in this release either. */
    const resolved = resolveServerSupabase(
      env({
        SUPABASE_URL: "   ",
        NEXT_PUBLIC_SUPABASE_URL: APPROVED_URL,
        SUPABASE_SECRET_KEY: KEY,
      }),
    );
    expect(resolved?.url).toBe(APPROVED_URL);
    expect(resolved?.from).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("refuses rather than falling back when the server variable is malformed", () => {
    /*
     * The distinction the documents now state: `read()` stops at the FIRST name
     * that is set. A malformed server URL therefore leaves the deployment with
     * no destination at all — it does not quietly become the public one.
     */
    const source = env({
      SUPABASE_URL: "localhost:54321",
      NEXT_PUBLIC_SUPABASE_URL: APPROVED_URL,
      SUPABASE_SECRET_KEY: KEY,
    });
    expect(resolveServerSupabase(source)).toBeNull();

    const diagnosis = diagnoseServerSupabase(source);
    expect(diagnosis.configured).toBe(false);
    expect(diagnosis.malformed).toContain("SUPABASE_URL");
    expect(diagnosis.using).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("selects the server variable at runtime even when the two disagree", () => {
    /*
     * The runtime has no opinion about which project is approved. That is the
     * whole reason the preflight has to STOP on a disagreement: nothing in the
     * deployed code will notice.
     */
    const source = env({
      SUPABASE_URL: APPROVED_URL,
      NEXT_PUBLIC_SUPABASE_URL: OTHER_URL,
      SUPABASE_SECRET_KEY: KEY,
    });
    expect(diagnoseServerSupabase(source).host).toBe(`${APPROVED}.supabase.co`);
    expect(
      classifyProjectMapping({
        serverUrl: APPROVED_URL,
        publicUrl: OTHER_URL,
        approvedRef: APPROVED,
      }),
    ).toMatchObject({ state: "PROJECTS_DISAGREE", verdict: "STOP" });
  });

  it("works from the server variable alone", () => {
    const source = env({ SUPABASE_URL: APPROVED_URL, SUPABASE_SECRET_KEY: KEY });
    expect(resolveServerSupabase(source)?.url).toBe(APPROVED_URL);
    expect(diagnoseServerSupabase(source).configured).toBe(true);
    expect(diagnoseServerSupabase(source).missing).toEqual([]);
  });

  it("reports no usable URL when neither name is set", () => {
    const source = env({ SUPABASE_SECRET_KEY: KEY });
    expect(resolveServerSupabase(source)).toBeNull();
    const diagnosis = diagnoseServerSupabase(source);
    expect(diagnosis.configured).toBe(false);
    expect(diagnosis.missing).toContain("SUPABASE_URL");
    expect(diagnosis.host).toBeNull();
  });

  it("names the variable it used, and never a value", () => {
    const resolved = resolveServerSupabase(
      env({ SUPABASE_URL: APPROVED_URL, SUPABASE_SECRET_KEY: KEY }),
    );
    expect(resolved?.from).toEqual(["SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
    /* `from` is written to logs; it must be names only. */
    expect(resolved?.from.join(" ")).not.toContain(KEY);
    expect(JSON.stringify(diagnoseServerSupabase(env({ SUPABASE_SECRET_KEY: KEY })))).not.toContain(
      KEY,
    );
  });
});

describe("the preflight decision, which is stricter than the runtime", () => {
  it("PASSes only on a valid, approved server URL", () => {
    expect(
      classifyProjectMapping({
        serverUrl: APPROVED_URL,
        publicUrl: undefined,
        approvedRef: APPROVED,
      }),
    ).toEqual({ state: "MAPPED", verdict: "PASS", ref: APPROVED });
  });

  it("PASSes when the public URL names the same project", () => {
    expect(
      classifyProjectMapping({
        serverUrl: APPROVED_URL,
        publicUrl: APPROVED_URL,
        approvedRef: APPROVED,
      }).verdict,
    ).toBe("PASS");
  });

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["whitespace", "   "],
  ])("STOPs with FALLBACK_IN_EFFECT when the server URL is %s", (_why, value) => {
    const outcome = classifyProjectMapping({
      serverUrl: value,
      publicUrl: APPROVED_URL,
      approvedRef: APPROVED,
    });
    expect(outcome).toEqual({ state: "SERVER_URL_ABSENT", verdict: "STOP", ref: null });
  });

  it("a public URL naming the approved project does not rescue the fallback", () => {
    /*
     * The single most tempting way past this gate, and the one the whole rule
     * exists to forbid: the public value looks right, so the mapping looks
     * proved. It is not — the runtime would be resolving its server writes
     * through a browser-exposed variable.
     */
    const outcome = classifyProjectMapping({
      serverUrl: undefined,
      publicUrl: APPROVED_URL,
      approvedRef: APPROVED,
    });
    expect(outcome.verdict).toBe("STOP");
    expect(outcome.ref).toBeNull();
  });

  it("STOPs on a malformed server URL", () => {
    for (const bad of [
      "localhost:54321",
      `${APPROVED_URL}/rest/v1`,
      `${APPROVED_URL}?x=1`,
      "ftp://x.y",
    ]) {
      expect(
        classifyProjectMapping({ serverUrl: bad, publicUrl: undefined, approvedRef: APPROVED }),
        bad,
      ).toMatchObject({ state: "SERVER_URL_MALFORMED", verdict: "STOP" });
    }
  });

  it("STOPs when the server URL names the wrong project", () => {
    expect(
      classifyProjectMapping({ serverUrl: OTHER_URL, publicUrl: undefined, approvedRef: APPROVED }),
    ).toMatchObject({ state: "SERVER_PROJECT_WRONG", verdict: "STOP" });
  });

  it("PAUSEs when the tooling cannot isolate the non-secret value", () => {
    expect(
      classifyProjectMapping({
        serverUrl: APPROVED_URL,
        publicUrl: undefined,
        approvedRef: APPROVED,
        toolingCannotIsolate: true,
      }),
    ).toMatchObject({ state: "TOOLING_CANNOT_ISOLATE", verdict: "PAUSE" });
  });

  it("records a ref only on PASS", () => {
    for (const state of PROJECT_MAPPING_STATES) {
      if (state.verdict === "PASS") continue;
      expect(state.remedy, state.name).not.toBe("");
    }
    expect(
      classifyProjectMapping({ serverUrl: OTHER_URL, publicUrl: undefined, approvedRef: APPROVED })
        .ref,
    ).toBeNull();
  });

  it("every non-PASS state names an operator decision and a restart", () => {
    for (const state of PROJECT_MAPPING_STATES) {
      if (state.verdict === "PASS") continue;
      if (state.verdict === "PAUSE") {
        expect(state.remedy, state.name).toMatch(/Matthew/);
        continue;
      }
      expect(state.remedy, state.name).toMatch(/RESTART PREFLIGHT STEP 1/);
    }
  });

  it("extracts a project ref only from a bare project origin", () => {
    expect(projectRef(APPROVED_URL)).toBe(APPROVED);
    expect(projectRef(`${APPROVED_URL}/`)).toBe(APPROVED);
    expect(projectRef(`${APPROVED_URL}/rest/v1`)).toBeNull();
    expect(projectRef("   ")).toBeNull();
    expect(projectRef(undefined)).toBeNull();
  });
});
