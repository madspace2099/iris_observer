import { describe, expect, it } from "vitest";
import { APPROVED_PROJECT_REF, PROJECT_MAPPING_STATES } from "../../scripts/release/preflight";
import { render, step1 } from "../../scripts/release/preflight-step1";

/**
 * `pnpm preflight:step1` answers with the table, never beside it.
 *
 * One case per state of `PROJECT_MAPPING_STATES`. The script feeds a value into
 * the tooling classifier, so the states only the other two routes produce are
 * named below with the route that produces them — a state missing from both
 * lists fails the last case, so a row added to the table cannot go unexamined.
 */

const APPROVED = `https://${APPROVED_PROJECT_REF}.supabase.co`;
const OTHER = "https://aaaaaaaaaaaaaaaaaaaa.supabase.co";

const CASES: Readonly<
  Record<string, { readonly args: string[]; readonly env?: Record<string, string> }>
> = {
  SERVER_URL_ABSENT: { args: [], env: {} },
  SERVER_URL_MALFORMED: { args: [`${APPROVED}/rest/v1`] },
  SERVER_PROJECT_WRONG: { args: [OTHER] },
  PUBLIC_URL_MALFORMED: { args: [APPROVED, "not-a-url"] },
  PROJECTS_DISAGREE: { args: [APPROVED, OTHER] },
  PUBLIC_UNOBSERVED: { args: [APPROVED] },
  MAPPED: { args: [APPROVED, "absent"] },
};

/** Reached only when no value can be read at all, or through `confirmManualMapping`. */
const NOT_THIS_ROUTE = [
  "TOOLING_CANNOT_ISOLATE",
  "MANUAL_ORIGIN_SHAPE_UNPROVEN",
  "MANUAL_OBSERVATION_ABSENT",
  "MANUAL_OBSERVATION_MALFORMED",
  "MANUAL_PROJECT_WRONG",
  "MANUAL_PUBLIC_UNOBSERVED",
];

describe("pnpm preflight:step1 answers with the table", () => {
  it.each(Object.entries(CASES))(
    "%s: the table's state, verdict and remedy",
    (name, { args, env }) => {
      const row = PROJECT_MAPPING_STATES.find((s) => s.name === name);
      const result = step1(args, env ?? {});
      expect(result.outcome.state).toBe(name);
      expect(result.outcome.verdict).toBe(row?.verdict);
      expect(render(result)).toContain(`remedy:  ${row?.remedy}`);
    },
  );

  it("reads the two variables when no argument is given", () => {
    const pass = step1([], { SUPABASE_URL: APPROVED });
    expect(pass.outcome.state).toBe("MAPPED");
    const disagree = step1([], { SUPABASE_URL: APPROVED, NEXT_PUBLIC_SUPABASE_URL: OTHER });
    expect(disagree.outcome.state).toBe("PROJECTS_DISAGREE");
  });

  it("does not trim what was copied", () => {
    expect(step1([`${APPROVED} `, "absent"], {}).outcome.state).toBe("SERVER_URL_MALFORMED");
  });

  it("accounts for every state of the table", () => {
    expect([...Object.keys(CASES), ...NOT_THIS_ROUTE].sort()).toEqual(
      PROJECT_MAPPING_STATES.map((s) => s.name).sort(),
    );
  });
});
