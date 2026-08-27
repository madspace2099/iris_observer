/**
 * The preflight decision table for step 1, as data rather than as prose.
 *
 * The previous edition established the FACT — `apps/web/src/lib/supabase-env.ts`
 * resolves the destination from `["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]`
 * in that order, so an absent or blank server variable activates a fallback
 * through a browser-exposed one — and then called that a "finding". A finding
 * is not a decision. The same contract says the public variable must never
 * substitute for the authoritative server mapping, so a document that records
 * the fallback and keeps going contradicts itself: the operator is told the
 * mapping is unproved and given no instruction that stops them.
 *
 * Every state carries a verdict, and the verdicts are here rather than in four
 * documents, because four copies of a rule are four chances to disagree. The
 * pepper contract renders this table; the runbook and the tests assert against
 * it.
 */

/** What the operator may do next. */
export type Verdict =
  /** The mapping is proved. Step 2 may be reached. */
  | "PASS"
  /** Execution stops. The configuration must be corrected and step 1 rerun. */
  | "STOP"
  /** Nothing is decided here. Matthew reads it in the dashboard. */
  | "PAUSE";

/**
 * How a mapping was established.
 *
 * `manual` exists because PAUSE has to lead somewhere. A state whose only
 * instruction is "stop and look at the dashboard" leaves the operator holding
 * an observation with no defined way to turn it into a decision, and the
 * previous edition's prose then told them — as it told every non-PASS state —
 * to correct the configuration and restart. That is wrong advice for PAUSE:
 * PAUSE says the TOOLING could not show the value, not that the value is bad.
 */
export type Via = "tooling" | "manual";

export interface MappingState {
  /** The state's name, used verbatim in the documents and the tests. */
  readonly name: string;
  /** The observable condition, in the operator's terms. */
  readonly condition: string;
  readonly verdict: Verdict;
  /** What the operator does, and it is never "note it and continue". */
  readonly remedy: string;
}

/** The approved Observer project. Hosted Supabase; see {@link projectRef}. */
export const APPROVED_PROJECT_REF = "tfcchobwobpadenampyh";

/**
 * Ordered most-specific first: the first matching state is the verdict.
 *
 * `SERVER_URL_ABSENT` sits above every "wrong project" state deliberately. A
 * public URL naming the APPROVED project must not convert it into a PASS —
 * that is precisely the substitution the whole rule exists to forbid, and it is
 * the most tempting way to get past this gate.
 */
export const PROJECT_MAPPING_STATES: readonly MappingState[] = [
  {
    name: "TOOLING_CANNOT_ISOLATE",
    condition:
      "the tooling cannot expose the non-secret server URL or project ref without also exposing a secret",
    verdict: "PAUSE",
    remedy:
      "PAUSE. This says nothing about whether the configuration is correct, so do NOT rotate, replace or edit anything on the strength of it. Matthew reads ONLY the exact non-secret server origin or project ref in the Vercel dashboard, and that observation is then carried through the MANUAL CONFIRMATION path below. Step 2 is not reachable from PAUSE itself.",
  },
  {
    name: "SERVER_URL_ABSENT",
    condition: "SUPABASE_URL is absent, empty or whitespace",
    verdict: "STOP",
    remedy:
      "Set SUPABASE_URL for that environment to the approved project, then RESTART PREFLIGHT STEP 1. The resolver would otherwise fall back to NEXT_PUBLIC_SUPABASE_URL, and a browser-exposed variable is not an authoritative server mapping however good its value looks.",
  },
  {
    name: "SERVER_URL_MALFORMED",
    condition:
      "SUPABASE_URL is set but is not the canonical hosted origin https://<project-ref>.supabase.co",
    verdict: "STOP",
    remedy:
      "Correct the value to the canonical origin — https, the .supabase.co host, no userinfo, no port, no path beyond a single slash, no query, no fragment — then RESTART PREFLIGHT STEP 1. The resolver does NOT fall back here: it stops at the first name that is set and reports it unusable, so the deployment has no destination at all.",
  },
  {
    name: "SERVER_PROJECT_WRONG",
    condition: "SUPABASE_URL is a canonical origin but its project ref is not the approved one",
    verdict: "STOP",
    remedy:
      "Point the environment at the approved project, then RESTART PREFLIGHT STEP 1. Every claim in this release about rows, buckets and versions is about the approved database.",
  },
  {
    name: "PUBLIC_URL_MALFORMED",
    condition: "NEXT_PUBLIC_SUPABASE_URL is set but is not a canonical hosted origin",
    verdict: "STOP",
    remedy:
      "Correct or remove it, then RESTART PREFLIGHT STEP 1. A value that cannot be parsed cannot be compared, and an uncomparable public URL is not the same thing as an absent one.",
  },
  {
    name: "PROJECTS_DISAGREE",
    condition: "SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL name different projects",
    verdict: "STOP",
    remedy:
      "Reconcile the two, then RESTART PREFLIGHT STEP 1. The browser and the server are otherwise talking to two databases, and nothing downstream is safe to reason about.",
  },
  {
    name: "MANUAL_OBSERVATION_ABSENT",
    condition: "the manual confirmation path was entered with no dashboard observation recorded",
    verdict: "STOP",
    remedy:
      "Record the exact non-secret server origin or project ref Matthew read, then re-enter MANUAL CONFIRMATION. NO PUBLIC URL CAN RESCUE A MISSING SERVER OBSERVATION — the public variable is not the authoritative mapping in the manual path either.",
  },
  {
    name: "MANUAL_OBSERVATION_MALFORMED",
    condition: "the recorded dashboard observation is neither a canonical origin nor a project ref",
    verdict: "STOP",
    remedy:
      "Record it exactly as the dashboard shows it — the whole https://<project-ref>.supabase.co origin, or the project ref alone — then re-enter MANUAL CONFIRMATION.",
  },
  {
    name: "MANUAL_PROJECT_WRONG",
    condition: "the manual observation names a project that is not the approved one",
    verdict: "STOP",
    remedy:
      "This one IS a configuration fault, unlike the PAUSE that preceded it. Point the environment at the approved project, then RESTART PREFLIGHT STEP 1 from the beginning rather than re-entering manual confirmation.",
  },
  {
    name: "MANUAL_PUBLIC_UNOBSERVED",
    condition:
      "the manual server observation is canonical and names the approved project, but whether NEXT_PUBLIC_SUPABASE_URL exists was never observed",
    verdict: "PAUSE",
    remedy:
      "Have Matthew look for the exact NEXT_PUBLIC_SUPABASE_URL row and record one of two things: that the row is ABSENT, or its exact value. A search box that returns nothing for a typed name is not an observation that the row is absent — prefixed names may be filtered, matched loosely, or paginated, and none of that is documented. Until one of the two is recorded, this is server-ref established and manual confirmation INCOMPLETE, not PASS.",
  },
  {
    name: "MAPPED",
    condition:
      "the server origin is canonical, names the approved project, and NEXT_PUBLIC_SUPABASE_URL is either absent or names the same project — established by tooling, or by a successful manual comparison",
    verdict: "PASS",
    remedy: "Record the project ref. Step 2 may be reached.",
  },
];

export interface MappingInput {
  /** Raw value of the server variable, as configured. */
  readonly serverUrl: string | undefined;
  /** Raw value of the browser-exposed variable, as configured. */
  readonly publicUrl: string | undefined;
  /** The approved Observer project reference. */
  readonly approvedRef: string;
  /** True when the tooling could not show the server value without a secret. */
  readonly toolingCannotIsolate?: boolean;
}

export interface MappingOutcome {
  readonly state: string;
  readonly verdict: Verdict;
  /** The ref actually recorded, and only on PASS. */
  readonly ref: string | null;
  /** How a PASS was established. Null on anything that is not a PASS. */
  readonly via: Via | null;
}

/**
 * The canonical hosted-Supabase project origin, and nothing else.
 *
 * `https://<project-ref>.supabase.co`, with at most a single trailing slash.
 *
 * ## Why this is a whole-string regex and not URL-part inspection
 *
 * The previous version parsed the URL and returned `hostname.split(".")[0]`.
 * That accepted the first label of ANY host, so both of these resolved to the
 * approved ref and produced MAPPED/PASS:
 *
 *     https://<approved-ref>.example.com          — a foreign origin
 *     https://<approved-ref>.supabase.co.evil.test — suffix confusion
 *
 * Neither is the Observer database. A rule that reads one label of a hostname
 * is not checking the hostname, and the failure is silent: the operator sees
 * the ref they expected and records the mapping as proved.
 *
 * The anchored pattern rejects, by construction rather than by enumeration:
 * every foreign domain; every additional label before or after `supabase.co`;
 * `http`; userinfo, which needs an `@`; an explicit port, which needs a `:` —
 * including `:443`, which WHATWG parsing silently normalises away; any path
 * beyond `/`; query strings; fragments; and a trailing dot.
 *
 * SCOPE, stated rather than assumed: this release targets HOSTED Supabase. A
 * self-hosted deployment has a different origin shape entirely and would need a
 * different rule — it does not get one here, because accepting a shape this
 * project does not use is how the foreign-origin hole appeared in the first
 * place.
 */
const CANONICAL_ORIGIN = /^https:\/\/([a-z0-9]+(?:-[a-z0-9]+)*)\.supabase\.co\/?$/i;

/** A bare project reference, as the dashboard displays it. */
const BARE_REF = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/**
 * The project ref of a canonical hosted origin, or null.
 *
 * Null means "not a canonical Supabase project origin", which the caller must
 * treat as MALFORMED — never as "no opinion".
 */
export function projectRef(url: string | undefined): string | null {
  if (url === undefined) return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;

  const match = CANONICAL_ORIGIN.exec(trimmed);
  if (match === null) return null;
  const ref = match[1];
  if (ref === undefined) return null;

  /*
   * A second, independent parse. The regex is the rule; this is the check that
   * the rule and a real URL parser agree about what the host is, so a pattern
   * mistake cannot pass unnoticed.
   */
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username !== "" || parsed.password !== "") return null;
    if (parsed.port !== "") return null;
    if (parsed.search !== "" || parsed.hash !== "") return null;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
    if (parsed.hostname.toLowerCase() !== `${ref.toLowerCase()}.supabase.co`) return null;
  } catch {
    return null;
  }

  return ref.toLowerCase();
}

/** The ref from either a canonical origin or a bare ref, or null. */
export function manualObservationRef(observation: string | undefined): string | null {
  if (observation === undefined) return null;
  const trimmed = observation.trim();
  if (trimmed.length === 0) return null;
  const fromOrigin = projectRef(trimmed);
  if (fromOrigin !== null) return fromOrigin;
  return BARE_REF.test(trimmed) ? trimmed.toLowerCase() : null;
}

/** Is the value set to something non-blank, whatever its shape? */
const isSet = (value: string | undefined): boolean =>
  value !== undefined && value.trim().length > 0;

const outcome = (
  name: string,
  ref: string | null = null,
  via: Via | null = null,
): MappingOutcome => {
  const state = PROJECT_MAPPING_STATES.find((s) => s.name === name);
  if (state === undefined) throw new Error(`unknown mapping state ${name}`);
  const pass = state.verdict === "PASS";
  return {
    state: state.name,
    verdict: state.verdict,
    ref: pass ? ref : null,
    via: pass ? via : null,
  };
};

/**
 * The verdict for one environment, from the observable configuration.
 *
 * Pure, so the rule the documents state is the rule the tests execute. Nothing
 * here reads `process.env`, and nothing here reads a secret.
 */
export function classifyProjectMapping(input: MappingInput): MappingOutcome {
  if (input.toolingCannotIsolate === true) return outcome("TOOLING_CANNOT_ISOLATE");

  /*
   * Absent first, and above every project comparison. A public URL naming the
   * approved project is exactly the observation that makes this look safe, and
   * exactly the substitution the rule forbids.
   */
  if (!isSet(input.serverUrl)) return outcome("SERVER_URL_ABSENT");

  const serverRef = projectRef(input.serverUrl);
  if (serverRef === null) return outcome("SERVER_URL_MALFORMED");
  if (serverRef !== input.approvedRef) return outcome("SERVER_PROJECT_WRONG");

  if (isSet(input.publicUrl)) {
    const publicRef = projectRef(input.publicUrl);
    /*
     * A public value that cannot be parsed is its own state. Folding it into
     * PROJECTS_DISAGREE would say the two name different projects, when what
     * actually happened is that one of them names nothing at all.
     */
    if (publicRef === null) return outcome("PUBLIC_URL_MALFORMED");
    if (publicRef !== serverRef) return outcome("PROJECTS_DISAGREE");
  }

  return outcome("MAPPED", serverRef, "tooling");
}

/**
 * What was observed about NEXT_PUBLIC_SUPABASE_URL, as three distinct facts.
 *
 * "Not looked at" and "looked at and absent" are different observations, and
 * the previous signature could not tell them apart: it took an optional string,
 * so `undefined` meant both. That is the whole defect — MAPPED requires the
 * public variable to be absent OR to name the same project, and a parameter
 * that conflates "unobserved" with "absent" lets an unasked question satisfy a
 * condition that asks it.
 */
export type PublicObservation =
  | { readonly kind: "unobserved" }
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly value: string };

export const PUBLIC_UNOBSERVED: PublicObservation = { kind: "unobserved" };
export const PUBLIC_ABSENT: PublicObservation = { kind: "absent" };
export const publicPresent = (value: string): PublicObservation => ({ kind: "present", value });

export interface ManualConfirmationInput {
  /**
   * Exactly what Matthew read in the dashboard: the canonical origin or the
   * bare project ref. Nothing else, and never a key.
   */
  readonly observedServer: string | undefined;
  readonly approvedRef: string;
  /**
   * The public half of the same comparison.
   *
   * REQUIRED, and not optional: an omitted argument used to be indistinguishable
   * from an observed absence, and the function then returned PASS without ever
   * consulting it. The type now makes "I did not look" a value you have to
   * write down.
   */
  readonly observedPublic: PublicObservation;
}

/**
 * The only route from PAUSE to a proved mapping.
 *
 * PAUSE means the TOOLING could not isolate the non-secret value — not that the
 * configuration is wrong. So this path does not correct anything and does not
 * restart step 1: it takes one manual observation and compares it. Only the
 * comparison succeeding yields MAPPED/PASS, and it is marked `via: "manual"` so
 * a reader can tell a hand-read mapping from a tool-read one.
 *
 * A mismatch is a different matter — that IS a configuration fault, and it
 * routes to a STOP whose remedy restarts step 1 from the beginning.
 */
export function confirmManualMapping(input: ManualConfirmationInput): MappingOutcome {
  /*
   * THE SERVER OBSERVATION FIRST, AND THE ORDER IS THE RULE.
   *
   * Evaluating the public value before the server one would let a well-formed
   * public URL be consulted in a run where the authoritative server value was
   * never read. It cannot rescue the server observation and it must not be
   * reached before the server observation has been accepted.
   */
  if (!isSet(input.observedServer)) return outcome("MANUAL_OBSERVATION_ABSENT");
  const ref = manualObservationRef(input.observedServer);
  if (ref === null) return outcome("MANUAL_OBSERVATION_MALFORMED");
  if (ref !== input.approvedRef) return outcome("MANUAL_PROJECT_WRONG");

  /*
   * THEN THE PUBLIC ONE, WHICH THIS FUNCTION USED TO ACCEPT AND IGNORE.
   *
   * MAPPED's condition is not "the server names the approved project". It is
   * that AND "the public variable is absent or names the same project". The
   * manual path took a `publicUrl` argument, never read it, and returned PASS —
   * so a malformed or mismatched public value went through unchallenged on
   * exactly the route a human takes when the tooling could not help.
   */
  switch (input.observedPublic.kind) {
    case "unobserved":
      return outcome("MANUAL_PUBLIC_UNOBSERVED");
    case "absent":
      return outcome("MAPPED", ref, "manual");
    case "present": {
      const publicRef = projectRef(input.observedPublic.value);
      if (publicRef === null) return outcome("PUBLIC_URL_MALFORMED");
      if (publicRef !== ref) return outcome("PROJECTS_DISAGREE");
      return outcome("MAPPED", ref, "manual");
    }
  }
}

/**
 * THE recorded manual preflight observation. One object; every document renders
 * from it.
 *
 * The delivered `c1b80f0` archive printed Preview as `MAPPED / PASS / via
 * manual` in a hand-maintained table while the rule that decides that verdict
 * had already been corrected to require the public row as well. Verdict text
 * duplicated beside the rule is verdict text that can disagree with it, so the
 * text is now derived: the observation is stated once, and
 * {@link renderObservedMapping} runs it through the same classifier the tests
 * exercise.
 *
 * WHAT WAS ACTUALLY OBSERVED. Matthew read the Preview `SUPABASE_URL` row in
 * the Vercel dashboard, character for character, as the complete canonical
 * origin. Nobody looked for the `NEXT_PUBLIC_SUPABASE_URL` row — so its state
 * is `unobserved`, which is not `absent`, and Preview is therefore PAUSE.
 */
export interface RecordedEnvironmentObservation {
  readonly environment: string;
  /**
   * THREE STATES, for the same reason the public row has three.
   *
   * `observedServer: string | undefined` could not tell "nobody looked" from
   * "somebody looked and there was no row", and those reach different states:
   * the first is MANUAL_OBSERVATION_ABSENT, an incomplete confirmation, and the
   * second is SERVER_URL_ABSENT, a finding about the environment. Production is
   * the second — Matthew looked, and Production has no `SUPABASE_URL` — and it
   * was classifying as the first, so the rendered verdict named a state that
   * misdescribed what had happened even though both are STOP.
   */
  readonly observedServer: PublicObservation;
  readonly observedPublic: PublicObservation;
  /** When it was read. Time of day was not recorded, and is not invented. */
  readonly observedOn: string;
}

export const OBSERVED_MAPPINGS: readonly RecordedEnvironmentObservation[] = [
  {
    environment: "Preview",
    /*
     * The COMPLETE origin, not the bare ref. A bare ref cannot show that the
     * configured value had the required origin shape — it is what survives
     * extraction, not what was configured — so the full string is what is kept.
     */
    observedServer: publicPresent("https://tfcchobwobpadenampyh.supabase.co"),
    observedPublic: PUBLIC_UNOBSERVED,
    observedOn: "2026-08-27",
  },
  {
    environment: "Production",
    /* Looked for, and not there — which is a finding, not a gap in the record. */
    observedServer: PUBLIC_ABSENT,
    observedPublic: PUBLIC_UNOBSERVED,
    observedOn: "2026-08-27",
  },
];

/** The verdict for one recorded observation, from the classifier itself. */
export function classifyObservation(
  o: RecordedEnvironmentObservation,
  approvedRef: string,
): MappingOutcome {
  switch (o.observedServer.kind) {
    /* Nobody looked: the confirmation is incomplete, not a finding. */
    case "unobserved":
      return outcome("MANUAL_OBSERVATION_ABSENT");
    /* Somebody looked and there was no row: a finding about the environment. */
    case "absent":
      return outcome("SERVER_URL_ABSENT");
    case "present":
      return confirmManualMapping({
        observedServer: o.observedServer.value,
        approvedRef,
        observedPublic: o.observedPublic,
      });
  }
}

/** The carried-forward preflight result, rendered rather than restated. */
export function renderObservedMapping(approvedRef: string, indent = "  "): string {
  const rows = OBSERVED_MAPPINGS.map((o) => {
    const out = classifyObservation(o, approvedRef);
    const server =
      o.observedServer.kind === "unobserved"
        ? "NOT OBSERVED"
        : o.observedServer.kind === "absent"
          ? "observed absent"
          : o.observedServer.value;
    const pub =
      o.observedPublic.kind === "unobserved"
        ? "NOT OBSERVED"
        : o.observedPublic.kind === "absent"
          ? "observed absent"
          : o.observedPublic.value;
    return [
      `${indent}${o.environment.padEnd(12)}${out.state.padEnd(26)}${out.verdict}`,
      `${indent}    SUPABASE_URL              ${server}`,
      `${indent}    NEXT_PUBLIC_SUPABASE_URL  ${pub}`,
      `${indent}    ref recorded              ${out.ref ?? "(none — no mapping was proved)"}`,
      `${indent}    established via           ${out.via ?? "(none — no mapping was proved)"}`,
      `${indent}    observed on               ${o.observedOn}; exact time not recorded`,
    ].join("\n");
  });
  return rows.join("\n\n");
}

/** The table as the documents render it. */
export function renderMappingTable(indent = "  "): string {
  const rows = PROJECT_MAPPING_STATES.map((s) => {
    const head = `${indent}${s.name.padEnd(28)}${s.verdict}`;
    const condition = wrapAt(`${indent}    when: ${s.condition}`, 79, `${indent}          `);
    const remedy = wrapAt(`${indent}    then: ${s.remedy}`, 79, `${indent}          `);
    return [head, condition, remedy].join("\n");
  });
  return rows.join("\n\n");
}

function wrapAt(text: string, width: number, hanging: string): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length === 0) line = word;
    else if (`${line} ${word}`.length > width) {
      lines.push(line);
      line = hanging + word;
    } else line = `${line} ${word}`;
  }
  if (line.length > 0) lines.push(line);
  return lines.join("\n");
}
