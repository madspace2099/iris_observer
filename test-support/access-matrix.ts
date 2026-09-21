/**
 * THE ACCESS MATRIX. A TABLE OF EXPECTATIONS, NOT A SOURCE OF DATA.
 *
 * Observer refuses in three places and each refuses differently. The repository
 * settles which TENANT and PROJECT a reader may resolve, and answers with
 * `NotPermittedError` or `NotFoundError`. `maySeeSurface` settles which ROLE may
 * open a screen key, answers with a boolean, and **fails OPEN** on a key nobody
 * declared. `decideAccess` settles what a PLAN has paid for, answers with an
 * `AccessDecision`, and **fails CLOSED** on a key nobody priced. Three layers,
 * three vocabularies, two opposite defaults.
 *
 * Nothing in this repository had ever crossed them. The role gate is tested
 * against real viewers with no plan in sight; the plan gate is tested against
 * literal strings with no viewer at all. This file is the crossing, written as
 * data so that a reader can see which combinations are covered and, more
 * usefully, which are not.
 *
 * ## What this is NOT, and the rules that make that true
 *
 * It is **not a data layer**. `CLAUDE.md` non-negotiable 2 and ADR-0007 forbid
 * one, and nothing here generates a meeting, a unit or a figure. Every cell
 * names an input to a REAL function — the real `SyntheticObserverRepository`,
 * the real `maySeeSurface`, the real `decideAccess` — and the expected answer.
 *
 * **This file imports nothing**, which is the strongest available form of that
 * rule: a table with no imports cannot reach a repository, cannot construct a
 * viewer and cannot be mistaken for a source. The six capacities are named as
 * strings and resolved against the real `VIEWERS` by the test, so this file
 * adds no seventh capacity — a parallel viewer factory would be exactly the
 * second data layer the rule is about.
 *
 * It is **not a production fallback**. It lives in `test-support/`, which is
 * reachable only through `vitest.config.ts` — no `tsconfig` that builds the
 * application includes this directory, and `apps/web/tsconfig.json` compiles
 * `src/**` and nothing else. There is no code path that reaches it when a real
 * source is missing, because there is no code path that reaches it at all
 * outside a test run. `access-matrix.test.ts` asserts that rather than trusting
 * it.
 *
 * It **writes no event**. No ingestion call, no contract type, no schema.
 *
 * ## The one thing it must own: a registry that prices something
 *
 * `ACCESS_REGISTRY` prices every capability at FREE and `TENANT_PLANS` is
 * empty, so against the shipped configuration `upgrade_required` can never
 * fire — and two existing tests assert both of those stay that way. Every plan
 * function therefore takes a registry as an optional last parameter for exactly
 * this purpose. `FIXTURE_REGISTRY` is that parameter's value, and it is the
 * only thing here that does not already exist somewhere else.
 */

/** The four roles, in the order `ROLES` declares them. */
export const MATRIX_ROLES = [
  "sales_agent",
  "agency_manager",
  "developer",
  "madspace_admin",
] as const;
export type MatrixRole = (typeof MATRIX_ROLES)[number];

/** The three plans. Held values only; the refused shapes live in `NOT_PLANS`. */
export const MATRIX_PLANS = ["FREE", "PRO", "MAX"] as const;
export type MatrixPlan = (typeof MATRIX_PLANS)[number];

/**
 * Values that look like a plan and are not one.
 *
 * The prototype names are the interesting half and they are here because the
 * matrix found them: `decideAccess("FREE", "toString")` answered `{allowed:
 * true}` before `entitlements.ts` started reading the registry with an
 * own-property check. A deny-by-default gate that admits five key names is the
 * exact failure this table exists to catch, so the names stay in it.
 */
export const NOT_PLANS: readonly unknown[] = [
  undefined,
  null,
  "",
  "free",
  "Free",
  " FREE",
  "MAX ",
  "PREMIUM",
  0,
  3,
  true,
  ["MAX"],
  { plan: "MAX" },
];

/** Keys that name no capability anybody priced. */
export const UNPRICED_KEYS: readonly string[] = [
  "billing",
  "billing.invoice",
  "claude",
  "surfaces.units",
  "",
  ".",
  // Prototype names. Own-property lookup is what makes these refusals.
  "toString",
  "constructor",
  "valueOf",
  "hasOwnProperty",
  "__proto__",
];

/**
 * A registry that actually prices something, for the cells the shipped one
 * cannot produce. Passed as the last argument to the real functions; the real
 * registry is never touched.
 */
export const FIXTURE_REGISTRY: Readonly<Record<string, MatrixPlan>> = {
  surface: "FREE",
  metric: "FREE",
  "metric.exec": "PRO",
  "metric.people": "MAX",
};

/* --- the role axis --------------------------------------------------------- */

/**
 * One (role, surface key) expectation against `maySeeSurface`.
 *
 * `maySeeSurface` is the right target and `requireSurface` is not: the latter
 * calls Next's `redirect()`, which throws a framework control-flow object
 * rather than returning, and importing it drags `next/navigation` into the test
 * graph — which `entitlements.ts` records as having broken four unrelated
 * suites once already.
 */
export interface SurfaceCell {
  readonly key: string;
  readonly role: MatrixRole;
  readonly allowed: boolean;
  /** Why this cell is here, in one line. Printed when it fails. */
  readonly note: string;
}

function everyRole(key: string, allowed: boolean, note: string): SurfaceCell[] {
  return MATRIX_ROLES.map((role) => ({ key, role, allowed, note }));
}

export const SURFACE_CELLS: readonly SurfaceCell[] = [
  // The baseline: a project surface open to all four.
  ...everyRole("units", true, "an ordinary project surface admits every role"),
  ...everyRole("flow", true, "an ordinary project surface admits every role"),

  // The one product route that narrows by role (P1-05 closed this).
  ...MATRIX_ROLES.map((role) => ({
    key: "[meetingId]",
    role,
    allowed: role !== "developer",
    note: "the meeting replay declares three roles and the developer is not one",
  })),

  // MADSPACE administration.
  ...MATRIX_ROLES.map((role) => ({
    key: "madspace",
    role,
    allowed: role === "madspace_admin",
    note: "administration is a separate surface, never a nav item",
  })),
  ...MATRIX_ROLES.map((role) => ({
    key: "diagnostics",
    role,
    allowed: role === "madspace_admin",
    note: "administration is a separate surface",
  })),

  /*
   * FAIL-OPEN, ASSERTED DELIBERATELY. An undeclared key is one nobody
   * restricted, and `routes.ts` argues that denying it would make a page
   * unreachable rather than unguarded. A matrix row expecting `false` here
   * would encode the opposite of the design — so the row expects `true` and
   * says why.
   */
  ...everyRole(
    "a-surface-nobody-declared",
    true,
    "maySeeSurface fails OPEN: an undeclared key is one nobody restricted",
  ),

  /*
   * LAST-SEGMENT SHADOWING, also deliberate. `maySeeSurface` matches the first
   * route whose final segment equals the key, so two routes ending in the same
   * word share one answer. Both of these are real collisions in the table, and
   * a reader of this matrix should meet them here rather than in production.
   */
  ...everyRole(
    "projects",
    true,
    "shadowing: /projects (all four) is declared before /madspace/projects",
  ),
  ...everyRole(
    "sign-in",
    false,
    "shadowing: /sign-in declares an empty role list, so it denies every role",
  ),
];

/* --- the plan axis --------------------------------------------------------- */

export type MatrixOutcome = "allowed" | "upgrade_required" | "forbidden";

export interface PlanCell {
  readonly plan: unknown;
  readonly key: string;
  readonly expect: MatrixOutcome;
  readonly note: string;
}

export const PLAN_CELLS: readonly PlanCell[] = [
  // Allowed: the base plan reaches what the base plan prices.
  { plan: "FREE", key: "metric.unit.active_dwell", expect: "allowed", note: "FREE reaches FREE" },
  {
    plan: "PRO",
    key: "metric.unit.active_dwell",
    expect: "allowed",
    note: "a dearer plan reaches a cheaper capability",
  },
  {
    plan: "MAX",
    key: "metric.unit.active_dwell",
    expect: "allowed",
    note: "a dearer plan reaches a cheaper capability",
  },
  {
    plan: "PRO",
    key: "metric.exec.revenue",
    expect: "allowed",
    note: "PRO reaches the PRO family",
  },
  {
    plan: "MAX",
    key: "metric.exec.revenue",
    expect: "allowed",
    note: "MAX reaches the PRO family",
  },
  {
    plan: "MAX",
    key: "metric.people.follow_up_delay",
    expect: "allowed",
    note: "MAX reaches the MAX family",
  },

  // Upgrade required: the capability exists and this plan does not reach it.
  {
    plan: "FREE",
    key: "metric.exec.revenue",
    expect: "upgrade_required",
    note: "the executive family is priced above FREE",
  },
  {
    plan: "FREE",
    key: "metric.exec.units_sold",
    expect: "upgrade_required",
    note: "the whole family moves together",
  },
  {
    plan: "FREE",
    key: "metric.people.follow_up_delay",
    expect: "upgrade_required",
    note: "a MAX family is out of reach from FREE",
  },
  {
    plan: "PRO",
    key: "metric.people.follow_up_delay",
    expect: "upgrade_required",
    note: "a MAX family is out of reach from PRO",
  },

  // Forbidden: nobody priced it. Never `upgrade_required` — there is no
  // upgrade that would help, and offering one invites payment for a bug.
  ...UNPRICED_KEYS.map((key) => ({
    plan: "MAX" as const,
    key,
    expect: "forbidden" as const,
    note: "an unpriced capability is refused even on the strongest plan",
  })),
];

/* --- the address axis ------------------------------------------------------ */

/**
 * One (viewer, address) expectation against the real repository.
 *
 * `error` is the class name because the two are NOT interchangeable and the
 * distinction is load-bearing: existence is checked before authorisation, so a
 * real project addressed through the wrong tenant is NOT found rather than
 * forbidden. The application layer then renders both identically, on purpose,
 * so that a refusal cannot confirm somebody else's project exists — that is the
 * layout's job and not this table's, and the test says which layer it asserts.
 */
export interface AddressCell {
  readonly viewerKey: MatrixViewerKey;
  readonly tenantSlug: string;
  readonly projectSlug: string;
  readonly error: "none" | "NotPermittedError" | "NotFoundError";
  readonly note: string;
}

export const ADDRESS_CELLS: readonly AddressCell[] = [
  {
    viewerKey: "developer",
    tenantSlug: "alpha",
    projectSlug: "northgate",
    error: "none",
    note: "a granted pair, so a refusal cannot pass for the wrong reason",
  },
  {
    viewerKey: "agencyManager",
    tenantSlug: "alpha",
    projectSlug: "riverside",
    error: "NotPermittedError",
    note: "holds the tenant, not this project — the tenant does not carry the project with it",
  },
  {
    viewerKey: "developer",
    tenantSlug: "beta",
    projectSlug: "kingsford",
    error: "NotPermittedError",
    note: "does not hold the tenant at all",
  },
  {
    viewerKey: "agencyManager",
    tenantSlug: "alpha",
    projectSlug: "kingsford",
    error: "NotFoundError",
    note: "a real project through the wrong tenant is NOT FOUND, not forbidden — the pair is checked as a pair",
  },
  {
    viewerKey: "developer",
    tenantSlug: "no-such-tenant",
    projectSlug: "northgate",
    error: "NotFoundError",
    note: "a tenant slug that exists nowhere",
  },
  {
    viewerKey: "developer",
    tenantSlug: "alpha",
    projectSlug: "no-such-project",
    error: "NotFoundError",
    note: "a project slug that exists nowhere",
  },
];

/**
 * The six capacities the synthetic world declares, named rather than imported.
 *
 * This file imports NOTHING, which is the strongest form of the rule it has to
 * obey: a table with no imports cannot be a data layer, cannot reach a
 * repository and cannot become a fallback for one. The test resolves these
 * names against the real `VIEWERS`, so a key that stopped existing fails there
 * rather than silently selecting `undefined` here.
 */
export const MATRIX_VIEWER_KEYS = [
  "developer",
  "agencyManager",
  "salesAgent",
  "salesAgentIster",
  "salesAgentDual",
  "madspace",
] as const;
export type MatrixViewerKey = (typeof MATRIX_VIEWER_KEYS)[number];

/* --- what this matrix cannot reach ----------------------------------------- */

/**
 * States the v3 plan names for P1-10 that have no counterpart in the product.
 *
 * Recorded as data, and read by a test, so that "not covered" is a claim the
 * suite makes out loud rather than a silence. The distinction is the one the
 * P1-03 audit used throughout: a state that EXISTS and is untested is a missing
 * test; a state that does not exist is a missing feature, and writing a test
 * for it would mean inventing the feature first.
 */
export interface UnreachableState {
  readonly state: string;
  readonly why: string;
  readonly evidence: string;
}

export const UNREACHABLE_STATES: readonly UnreachableState[] = [
  {
    state: "trial expiry",
    why: "There is no trial, no subscription period and no expiry anywhere in this product. A test would have to invent the feature before it could assert on it, and P1-07 recorded why there is nowhere to persist one.",
    evidence: 'grep -rniE "\\btrial\\b" apps/web/src packages → no match outside the design lab',
  },
  {
    state: 'MetricValue state "error"',
    why: "Declared in METRIC_STATES and produced by nothing in the repository — only two renderers consume it. Reaching it means hand-building a MetricValue, which is a component test rather than an access-matrix row.",
    evidence:
      "packages/readmodels/src/metric-value.ts (METRIC_STATES); no producer in packages/synthetic/src/format.ts",
  },
  {
    state: "a tenant with a plan above the base",
    why: "TENANT_PLANS is empty and an existing test asserts it stays empty, because a tenant id written into application logic would break CLAUDE.md non-negotiable 6. Every PRO and MAX cell in this matrix is therefore driven through the registry parameter, not through a configured tenant.",
    evidence:
      "apps/web/src/lib/entitlements.ts (TENANT_PLANS); apps/web/test/entitlements.test.ts (asserts it is empty)",
  },
];
