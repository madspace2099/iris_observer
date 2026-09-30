import { describe, expect, it } from "vitest";
import { APPROVED_PROJECT_REF, PROJECT_MAPPING_STATES } from "../../scripts/release/preflight";
import { render, step1 } from "../../scripts/release/preflight-step1";

/**
 * `pnpm preflight:step1` answers with the table, never beside it.
 *
 * For each of the table's two routes: one case per state that route reaches,
 * and the states it cannot reach named in a list. The last case of each block
 * fails when the table gains a state neither list holds, so a row added to the
 * table cannot go unexamined on either route.
 */

const APPROVED = `https://${APPROVED_PROJECT_REF}.supabase.co`;
const OTHER = "https://aaaaaaaaaaaaaaaaaaaa.supabase.co";
const ALL_STATES = PROJECT_MAPPING_STATES.map((s) => s.name).sort();

type Case = { readonly args: string[]; readonly env?: Record<string, string> };

function expectTheTable(name: string, { args, env }: Case, via: "tooling" | "manual") {
  const row = PROJECT_MAPPING_STATES.find((s) => s.name === name);
  const result = step1(args, env ?? {});
  expect(result.outcome.state).toBe(name);
  expect(result.outcome.verdict).toBe(row?.verdict);
  expect(result.via).toBe(via);
  expect(render(result)).toContain(`via:     ${via}`);
  expect(render(result)).toContain(`remedy:  ${row?.remedy}`);
}

describe("the tooling route: a value a program read", () => {
  const CASES: Readonly<Record<string, Case>> = {
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

  it.each(Object.entries(CASES))("%s: the table's state, verdict and remedy", (name, c) =>
    expectTheTable(name, c, "tooling"),
  );

  it("reads the two variables when no argument is given", () => {
    expect(step1([], { SUPABASE_URL: APPROVED }).outcome.state).toBe("MAPPED");
    expect(
      step1([], { SUPABASE_URL: APPROVED, NEXT_PUBLIC_SUPABASE_URL: OTHER }).outcome.state,
    ).toBe("PROJECTS_DISAGREE");
  });

  it("does not trim what was copied", () => {
    expect(step1([`${APPROVED} `, "absent"], {}).outcome.state).toBe("SERVER_URL_MALFORMED");
  });

  it("accounts for every state of the table", () => {
    expect([...Object.keys(CASES), ...NOT_THIS_ROUTE].sort()).toEqual(ALL_STATES);
  });
});

describe("the manual route: a value a person read, with --manual", () => {
  const CASES: Readonly<Record<string, Case>> = {
    MANUAL_OBSERVATION_ABSENT: { args: ["--manual"], env: { SUPABASE_URL: APPROVED } },
    MANUAL_OBSERVATION_MALFORMED: { args: ["not a ref!", "absent", "--manual"] },
    MANUAL_PROJECT_WRONG: { args: [OTHER, "absent", "--manual"] },
    MANUAL_ORIGIN_SHAPE_UNPROVEN: { args: [APPROVED_PROJECT_REF, "absent", "--manual"] },
    MANUAL_PUBLIC_UNOBSERVED: { args: [APPROVED, "--manual"] },
    PUBLIC_URL_MALFORMED: { args: [APPROVED, "not-a-url", "--manual"] },
    PROJECTS_DISAGREE: { args: [APPROVED, OTHER, "--manual"] },
    MAPPED: { args: [APPROVED, "absent", "--manual"] },
  };
  /** The tooling route's own states: a person's reading never reaches them. */
  const NOT_THIS_ROUTE = [
    "TOOLING_CANNOT_ISOLATE",
    "SERVER_URL_ABSENT",
    "SERVER_URL_MALFORMED",
    "SERVER_PROJECT_WRONG",
    "PUBLIC_UNOBSERVED",
  ];

  it.each(Object.entries(CASES))("%s: the table's state, verdict and remedy", (name, c) =>
    expectTheTable(name, c, "manual"),
  );

  it("records a manual PASS as manual", () => {
    expect(step1([APPROVED, "absent", "--manual"], {}).outcome.via).toBe("manual");
  });

  it("accounts for every state of the table", () => {
    expect([...Object.keys(CASES), ...NOT_THIS_ROUTE].sort()).toEqual(ALL_STATES);
  });
});
