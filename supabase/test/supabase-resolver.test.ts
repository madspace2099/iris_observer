import { describe, expect, it } from "vitest";
import { resolveServerSupabase, diagnoseServerSupabase, type EnvSource } from "@/lib/supabase-env";
import {
  classifyProjectMapping,
  confirmManualMapping,
  PUBLIC_ABSENT,
  PUBLIC_UNOBSERVED,
  publicPresent,
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
        observedPublic: publicPresent(OTHER_URL),
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
        observedPublic: PUBLIC_ABSENT,
        approvedRef: APPROVED,
      }),
    ).toEqual({ state: "MAPPED", verdict: "PASS", ref: APPROVED, via: "tooling" });
  });

  it("PASSes when the public URL names the same project", () => {
    expect(
      classifyProjectMapping({
        serverUrl: APPROVED_URL,
        observedPublic: publicPresent(APPROVED_URL),
        approvedRef: APPROVED,
      }).verdict,
    ).toBe("PASS");
  });

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["whitespace", "   "],
  ])("STOPs with SERVER_URL_ABSENT when the server URL is %s", (_why, value) => {
    const outcome = classifyProjectMapping({
      serverUrl: value,
      observedPublic: publicPresent(APPROVED_URL),
      approvedRef: APPROVED,
    });
    expect(outcome).toEqual({ state: "SERVER_URL_ABSENT", verdict: "STOP", ref: null, via: null });
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
      observedPublic: publicPresent(APPROVED_URL),
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
        classifyProjectMapping({
          serverUrl: bad,
          observedPublic: PUBLIC_ABSENT,
          approvedRef: APPROVED,
        }),
        bad,
      ).toMatchObject({ state: "SERVER_URL_MALFORMED", verdict: "STOP" });
    }
  });

  it("STOPs when the server URL names the wrong project", () => {
    expect(
      classifyProjectMapping({
        serverUrl: OTHER_URL,
        observedPublic: PUBLIC_ABSENT,
        approvedRef: APPROVED,
      }),
    ).toMatchObject({ state: "SERVER_PROJECT_WRONG", verdict: "STOP" });
  });

  it("PAUSEs when the tooling cannot isolate the non-secret value", () => {
    expect(
      classifyProjectMapping({
        serverUrl: APPROVED_URL,
        observedPublic: PUBLIC_ABSENT,
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
      classifyProjectMapping({
        serverUrl: OTHER_URL,
        observedPublic: PUBLIC_ABSENT,
        approvedRef: APPROVED,
      }).ref,
    ).toBeNull();
  });

  it("every non-PASS state names an operator decision and a restart", () => {
    for (const state of PROJECT_MAPPING_STATES) {
      if (state.verdict === "PASS") continue;
      if (state.verdict === "PAUSE") {
        expect(state.remedy, state.name).toMatch(/Matthew/);
        continue;
      }
      expect(state.remedy, state.name).toMatch(/RESTART PREFLIGHT STEP 1|re-enter MANUAL/);
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

/**
 * The origin rule, and the only route from PAUSE to a proved mapping.
 *
 * `projectRef` used to return the first hostname label of any URL. Both of
 * these therefore produced MAPPED/PASS for the approved project:
 *
 *     https://<approved-ref>.example.com            — a foreign origin
 *     https://<approved-ref>.supabase.co.evil.test  — suffix confusion
 *
 * Neither is the Observer database, and the failure is silent: the operator
 * sees the ref they expected and records the mapping as proved.
 */
describe("only the canonical hosted origin can produce a PASS", () => {
  const REF = "tfcchobwobpadenampyh";
  const OK = `https://${REF}.supabase.co`;

  const INVALID_ORIGINS: readonly (readonly [string, string])[] = [
    ["a foreign domain whose first label is the approved ref", `https://${REF}.example.com`],
    ["suffix confusion after supabase.co", `https://${REF}.supabase.co.evil.test`],
    ["an extra label before the ref", `https://a.${REF}.supabase.co`],
    ["a lookalike registrable domain", `https://${REF}.supabase.com`],
    ["a lookalike host label", `https://${REF}.supabase-co.net`],
    ["plain http", `http://${REF}.supabase.co`],
    ["userinfo", `https://user@${REF}.supabase.co`],
    ["userinfo with a password", `https://user:pw@${REF}.supabase.co`],
    ["an explicit default port", `https://${REF}.supabase.co:443`],
    ["a non-default port", `https://${REF}.supabase.co:8443`],
    ["a path", `https://${REF}.supabase.co/rest/v1`],
    ["a deeper path", `https://${REF}.supabase.co/a/b`],
    ["a query string", `https://${REF}.supabase.co/?x=1`],
    ["a fragment", `https://${REF}.supabase.co/#f`],
    ["a trailing dot on the host", `https://${REF}.supabase.co.`],
    ["a bare ref with no scheme", REF],
    ["the host with no scheme", `${REF}.supabase.co`],
    ["a scheme that is not http(s)", `ftp://${REF}.supabase.co`],
    ["an entirely different service", "https://example.com"],
    ["nonsense", "not-a-url"],
  ];

  it.each(INVALID_ORIGINS)("rejects %s", (_why, url) => {
    expect(projectRef(url), url).toBeNull();
  });

  it.each(INVALID_ORIGINS)("never reaches MAPPED/PASS from %s", (_why, url) => {
    const out = classifyProjectMapping({
      serverUrl: url,
      observedPublic: PUBLIC_ABSENT,
      approvedRef: REF,
    });
    expect(out.verdict, url).toBe("STOP");
    expect(out.state, url).toBe("SERVER_URL_MALFORMED");
    expect(out.ref, url).toBeNull();
  });

  it.each(INVALID_ORIGINS)("never reaches MAPPED/PASS with %s as the public URL", (_why, url) => {
    const out = classifyProjectMapping({
      serverUrl: OK,
      observedPublic: publicPresent(url),
      approvedRef: REF,
    });
    expect(out.verdict, url).toBe("STOP");
    expect(out.state, url).toBe("PUBLIC_URL_MALFORMED");
  });

  it.each([
    ["the canonical origin", OK],
    ["with a trailing slash", `${OK}/`],
  ])("accepts %s", (_why, url) => {
    expect(projectRef(url)).toBe(REF);
    expect(
      classifyProjectMapping({ serverUrl: url, observedPublic: PUBLIC_ABSENT, approvedRef: REF }),
    ).toEqual({ state: "MAPPED", verdict: "PASS", ref: REF, via: "tooling" });
  });

  it.each([
    ["a leading space", ` ${OK}`],
    ["a trailing space", `${OK} `],
    ["a trailing newline", `${OK}\n`],
    ["a leading tab", `\t${OK}`],
  ])("refuses the canonical origin with %s around it", (_why, url) => {
    /*
     * THE WHOLE STRING, NOT A TRIMMED ONE.
     *
     * `projectRef` used to trim before applying its anchored pattern, so a
     * value with whitespace around it was accepted as the origin it resembles —
     * while the prose said only the exact whole-string origin is valid. The
     * whitespace is real: it is in the environment variable, it travels into
     * the URL a client builds, and this was the only place that could see it.
     */
    expect(projectRef(url)).toBeNull();
    expect(
      classifyProjectMapping({ serverUrl: url, observedPublic: PUBLIC_ABSENT, approvedRef: REF })
        .state,
    ).toBe("SERVER_URL_MALFORMED");
  });

  it("compares the ref conjunctively rather than by containment", () => {
    for (const near of [`${REF}x`, `x${REF}`, REF.slice(0, -1)]) {
      const out = classifyProjectMapping({
        serverUrl: `https://${near}.supabase.co`,
        observedPublic: PUBLIC_ABSENT,
        approvedRef: REF,
      });
      expect(out.state, near).toBe("SERVER_PROJECT_WRONG");
    }
  });
});

describe("PAUSE leads somewhere, and only one way", () => {
  const REF = "tfcchobwobpadenampyh";
  const OK = `https://${REF}.supabase.co`;

  it("PAUSE itself never yields a ref or a PASS", () => {
    const out = classifyProjectMapping({
      serverUrl: OK,
      observedPublic: PUBLIC_ABSENT,
      approvedRef: REF,
      toolingCannotIsolate: true,
    });
    expect(out).toEqual({
      state: "TOOLING_CANNOT_ISOLATE",
      verdict: "PAUSE",
      ref: null,
      via: null,
    });
  });

  it("a matching pair of manual observations is what turns it into a PASS", () => {
    for (const observation of [OK, `${OK}/`]) {
      expect(
        confirmManualMapping({
          observedServer: observation,
          approvedRef: REF,
          observedPublic: PUBLIC_ABSENT,
        }),
      ).toEqual({ state: "MAPPED", verdict: "PASS", ref: REF, via: "manual" });
    }
  });

  it("PAUSEs on a bare project ref, which cannot prove the configured shape", () => {
    /*
     * REVIEW says a bare ref is what survives extraction rather than what was
     * configured, and the classifier accepted one and returned PASS anyway. A
     * ref alone cannot show https, the right host, no port, no path, no query
     * and no credentials — six separate ways the mapping can be wrong.
     */
    expect(
      confirmManualMapping({
        observedServer: REF,
        approvedRef: REF,
        observedPublic: PUBLIC_ABSENT,
      }),
    ).toEqual({ state: "MANUAL_ORIGIN_SHAPE_UNPROVEN", verdict: "PAUSE", ref: null, via: null });
  });

  it("marks a manual PASS as manual, so it is distinguishable from a tooled one", () => {
    expect(
      confirmManualMapping({
        observedServer: OK,
        approvedRef: REF,
        observedPublic: PUBLIC_ABSENT,
      }).via,
    ).toBe("manual");
    expect(
      classifyProjectMapping({ serverUrl: OK, observedPublic: PUBLIC_ABSENT, approvedRef: REF })
        .via,
    ).toBe("tooling");
  });

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["whitespace", "   "],
  ])("STOPs when the manual observation is %s", (_why, observation) => {
    expect(
      confirmManualMapping({
        observedServer: observation,
        approvedRef: REF,
        observedPublic: PUBLIC_ABSENT,
      }),
    ).toEqual({ state: "MANUAL_OBSERVATION_ABSENT", verdict: "STOP", ref: null, via: null });
  });

  it.each([
    ["a canonical public origin", publicPresent(OK)],
    ["an absent public row", PUBLIC_ABSENT],
    ["an unobserved public row", PUBLIC_UNOBSERVED],
  ])("no public observation rescues a missing server observation: %s", (_why, observedPublic) => {
    /*
     * The ORDER is the rule. A public value must never be consulted in a run
     * where the authoritative server value was not read, so every public state
     * has to reach the same STOP.
     */
    const out = confirmManualMapping({
      observedServer: undefined,
      approvedRef: REF,
      observedPublic,
    });
    expect(out).toEqual({
      state: "MANUAL_OBSERVATION_ABSENT",
      verdict: "STOP",
      ref: null,
      via: null,
    });
  });

  it.each([`https://${REF}.example.com`, "not a ref at all!", "https://example.com"])(
    "STOPs on an unusable manual observation: %s",
    (observation) => {
      expect(
        confirmManualMapping({
          observedServer: observation,
          approvedRef: REF,
          observedPublic: PUBLIC_ABSENT,
        }).state,
      ).toBe("MANUAL_OBSERVATION_MALFORMED");
    },
  );

  it("STOPs on a manual mismatch, and routes it to a restart rather than a re-entry", () => {
    const out = confirmManualMapping({
      observedServer: "https://otherref00000000.supabase.co",
      approvedRef: REF,
      observedPublic: PUBLIC_ABSENT,
    });
    expect(out).toMatchObject({ state: "MANUAL_PROJECT_WRONG", verdict: "STOP" });
    const state = PROJECT_MAPPING_STATES.find((s) => s.name === "MANUAL_PROJECT_WRONG");
    expect(state?.remedy).toMatch(/RESTART PREFLIGHT STEP 1/);
  });

  it("keeps PAUSE and STOP remediation semantically distinct", () => {
    const pause = PROJECT_MAPPING_STATES.find((s) => s.name === "TOOLING_CANNOT_ISOLATE");
    expect(pause?.verdict).toBe("PAUSE");
    expect(pause?.remedy).not.toMatch(/RESTART PREFLIGHT STEP 1/);
    expect(pause?.remedy).toMatch(/do NOT rotate, replace or edit/i);
    expect(pause?.remedy).toMatch(/MANUAL CONFIRMATION/i);

    for (const state of PROJECT_MAPPING_STATES.filter((s) => s.verdict === "STOP")) {
      expect(state.remedy, state.name).toMatch(/RESTART PREFLIGHT STEP 1|re-enter MANUAL/);
    }
  });
});

/**
 * The half of the manual comparison that used to be accepted and ignored.
 *
 * `confirmManualMapping` took a `publicUrl`, documented it as "present only so
 * the rule can refuse it", and then returned `MAPPED/PASS` from the server
 * observation alone. But MAPPED's own condition is not "the server names the
 * approved project" — it is that AND "NEXT_PUBLIC_SUPABASE_URL is absent or
 * names the same project". So on exactly the path a human takes when the
 * tooling could not help, a malformed or mismatched public value passed.
 *
 * The parameter is now a three-state observation, because an optional string
 * cannot tell "I did not look" from "I looked and it was not there", and those
 * are different facts. One of them satisfies MAPPED's condition; the other is
 * an unasked question.
 */
describe("the manual path checks the public variable too", () => {
  const REF = "tfcchobwobpadenampyh";
  const OK = `https://${REF}.supabase.co`;
  const server = { observedServer: OK, approvedRef: REF };

  it("PAUSEs when nobody looked at the public row", () => {
    expect(confirmManualMapping({ ...server, observedPublic: PUBLIC_UNOBSERVED })).toEqual({
      state: "MANUAL_PUBLIC_UNOBSERVED",
      verdict: "PAUSE",
      ref: null,
      via: null,
    });
  });

  it("PASSes when the public row was observed to be absent", () => {
    expect(confirmManualMapping({ ...server, observedPublic: PUBLIC_ABSENT })).toEqual({
      state: "MAPPED",
      verdict: "PASS",
      ref: REF,
      via: "manual",
    });
  });

  it("PASSes when the public row names the same project", () => {
    expect(confirmManualMapping({ ...server, observedPublic: publicPresent(OK) })).toEqual({
      state: "MAPPED",
      verdict: "PASS",
      ref: REF,
      via: "manual",
    });
  });

  it.each([
    ["a foreign origin", `https://${REF}.example.com`],
    ["suffix confusion", `https://${REF}.supabase.co.evil.test`],
    ["not a URL at all", "not a url"],
    ["http rather than https", `http://${REF}.supabase.co`],
    ["credentials in the origin", `https://user:pw@${REF}.supabase.co`],
    ["a port", `https://${REF}.supabase.co:8443`],
    ["a path", `https://${REF}.supabase.co/rest/v1`],
    ["a query", `https://${REF}.supabase.co/?x=1`],
    ["a bare ref, which is not a URL", REF],
    ["empty", ""],
    ["whitespace", "   "],
  ])("STOPs on a malformed public observation: %s", (_why, value) => {
    /*
     * A bare ref is deliberately refused here even though the SERVER
     * observation accepts one. The rule for the public variable is about a
     * URL that a browser would be handed, and `projectRef` is the only thing
     * that decides what counts as one.
     */
    expect(confirmManualMapping({ ...server, observedPublic: publicPresent(value) })).toEqual({
      state: "PUBLIC_URL_MALFORMED",
      verdict: "STOP",
      ref: null,
      via: null,
    });
  });

  it("STOPs when the public row names a different project", () => {
    expect(
      confirmManualMapping({
        ...server,
        observedPublic: publicPresent("https://otherref00000000.supabase.co"),
      }),
    ).toEqual({ state: "PROJECTS_DISAGREE", verdict: "STOP", ref: null, via: null });
  });

  it("reaches the public check only after the server one has been accepted", () => {
    /*
     * A malformed server observation and a perfect public one must report the
     * SERVER problem: the public value cannot be what a reader is sent to fix.
     */
    expect(
      confirmManualMapping({
        observedServer: "not a ref at all!",
        approvedRef: REF,
        observedPublic: publicPresent(OK),
      }).state,
    ).toBe("MANUAL_OBSERVATION_MALFORMED");

    expect(
      confirmManualMapping({
        observedServer: "https://otherref00000000.supabase.co",
        approvedRef: REF,
        observedPublic: publicPresent(OK),
      }).state,
    ).toBe("MANUAL_PROJECT_WRONG");
  });

  it("never yields a ref or a via on anything that is not a PASS", () => {
    const notPass = [
      confirmManualMapping({ ...server, observedPublic: PUBLIC_UNOBSERVED }),
      confirmManualMapping({ ...server, observedPublic: publicPresent("not a url") }),
      confirmManualMapping({
        ...server,
        observedPublic: publicPresent("https://otherref00000000.supabase.co"),
      }),
    ];
    for (const out of notPass) {
      expect(out.ref).toBeNull();
      expect(out.via).toBeNull();
      expect(out.verdict).not.toBe("PASS");
    }
  });

  it("says why a search box returning nothing is not an observed absence", () => {
    const state = PROJECT_MAPPING_STATES.find((s) => s.name === "MANUAL_PUBLIC_UNOBSERVED");
    expect(state?.verdict).toBe("PAUSE");
    expect(state?.remedy).toMatch(/search box/i);
    expect(state?.remedy).toMatch(/not an observation/i);
    /* PAUSE means incomplete, not wrong — it must not send anyone to step 1. */
    expect(state?.remedy).not.toMatch(/RESTART PREFLIGHT STEP 1/);
  });
});
