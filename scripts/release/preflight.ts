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
 * Every state now carries a verdict, and the verdicts are here rather than in
 * four documents, because four copies of a rule are four chances to disagree.
 * The pepper contract renders this table; the runbook and the tests assert
 * against it.
 */

/** What the operator may do next. */
export type Verdict =
  /** The mapping is proved. Step 2 may be reached. */
  | "PASS"
  /** Execution stops. The configuration must be corrected and step 1 rerun. */
  | "STOP"
  /** Nothing is decided here. Matthew reads it in the dashboard. */
  | "PAUSE";

export interface MappingState {
  /** The state's name, used verbatim in the documents and the tests. */
  readonly name: string;
  /** The observable condition, in the operator's terms. */
  readonly condition: string;
  readonly verdict: Verdict;
  /** What the operator does, and it is never "note it and continue". */
  readonly remedy: string;
}

/**
 * Ordered most-specific first: the first matching state is the verdict.
 *
 * `FALLBACK_IN_EFFECT` sits above every "wrong project" state deliberately. A
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
      "Matthew reads the value directly in the Vercel dashboard and records only the project ref. Do not widen the read.",
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
    condition: "SUPABASE_URL is set but is not a bare https/http origin",
    verdict: "STOP",
    remedy:
      "Correct the value — origin only, no path, no query, no fragment — then RESTART PREFLIGHT STEP 1. The resolver does NOT fall back here: it stops at the first name that is set and reports it unusable, so the deployment has no destination at all.",
  },
  {
    name: "SERVER_PROJECT_WRONG",
    condition: "SUPABASE_URL is valid but its project ref is not the approved Observer project",
    verdict: "STOP",
    remedy:
      "Point the environment at the approved project, then RESTART PREFLIGHT STEP 1. Every claim in this release about rows, buckets and versions is about the approved database.",
  },
  {
    name: "PROJECTS_DISAGREE",
    condition: "SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL name different projects",
    verdict: "STOP",
    remedy:
      "Reconcile the two, then RESTART PREFLIGHT STEP 1. The browser and the server are otherwise talking to two databases, and nothing downstream is safe to reason about.",
  },
  {
    name: "MAPPED",
    condition:
      "SUPABASE_URL is valid, names the approved project, and NEXT_PUBLIC_SUPABASE_URL is either absent or names the same project",
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
}

/**
 * A Supabase project ref from a project URL, or null.
 *
 * Deliberately strict about shape rather than clever: `https://<ref>.supabase.co`
 * with nothing on the end of it. Anything else is either not a project URL or
 * not what the variable is for, and both are for the caller to notice.
 */
export function projectRef(url: string | undefined): string | null {
  if (url === undefined) return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
    if (parsed.search !== "" || parsed.hash !== "") return null;
    const [ref] = parsed.hostname.split(".");
    return ref !== undefined && ref.length > 0 ? ref : null;
  } catch {
    return null;
  }
}

/** Is the value set to something non-blank, whatever its shape? */
const isSet = (value: string | undefined): boolean =>
  value !== undefined && value.trim().length > 0;

/**
 * The verdict for one environment, from the observable configuration.
 *
 * Pure, so the rule the documents state is the rule the tests execute. Nothing
 * here reads `process.env`, and nothing here reads a secret.
 */
export function classifyProjectMapping(input: MappingInput): MappingOutcome {
  const say = (name: string, ref: string | null = null): MappingOutcome => {
    const state = PROJECT_MAPPING_STATES.find((s) => s.name === name);
    if (state === undefined) throw new Error(`unknown mapping state ${name}`);
    return {
      state: state.name,
      verdict: state.verdict,
      ref: state.verdict === "PASS" ? ref : null,
    };
  };

  if (input.toolingCannotIsolate === true) return say("TOOLING_CANNOT_ISOLATE");

  /*
   * Absent first, and above every project comparison. A public URL naming the
   * approved project is exactly the observation that makes this look safe, and
   * exactly the substitution the rule forbids.
   */
  if (!isSet(input.serverUrl)) return say("SERVER_URL_ABSENT");

  const serverRef = projectRef(input.serverUrl);
  if (serverRef === null) return say("SERVER_URL_MALFORMED");
  if (serverRef !== input.approvedRef) return say("SERVER_PROJECT_WRONG");

  const publicRef = projectRef(input.publicUrl);
  if (isSet(input.publicUrl) && publicRef !== serverRef) return say("PROJECTS_DISAGREE");

  return say("MAPPED", serverRef);
}

/** The table as the documents render it. */
export function renderMappingTable(indent = "  "): string {
  const rows = PROJECT_MAPPING_STATES.map((s) => {
    const head = `${indent}${s.name.padEnd(24)}${s.verdict}`;
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
