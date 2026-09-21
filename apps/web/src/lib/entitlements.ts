import "server-only";

/**
 * WHAT A CUSTOMER HAS PAID FOR. A SECOND GATE, NEVER A REPLACEMENT FOR THE FIRST.
 *
 * Observer already answers two access questions and answers them well. Which
 * TENANT and PROJECT a viewer holds is settled by the repository, which
 * resolves the slugs in the URL against the viewer's own grants and refuses
 * before it reads anything. Which ROLE may open a screen is settled by
 * `maySeeSurface` in `routes.ts` and enforced by `requireSurface` inside each
 * page — "a hidden link is not access control".
 *
 * This file answers a third, commercial question, and it is deliberately
 * composed with the other two rather than folded into them: a FREE tenant and a
 * MAX tenant are the same tenant boundary, and an agent and a developer are the
 * same two roles, whichever plan pays for them. Three questions, three answers,
 * and a surface has to satisfy all three. Nothing here may ever be read as
 * permission to skip the first two.
 *
 * ## Deny by default, and why that differs from `maySeeSurface`
 *
 * `maySeeSurface` fails OPEN on a key it does not find, on purpose and with its
 * reasoning written beside it: an undeclared surface is one nobody restricted,
 * and denying it would make a page unreachable rather than unguarded —
 * unreachable being the failure nobody reports. `surfaces.test.ts` covers the
 * other half by requiring every page to have a declared surface.
 *
 * This resolver fails CLOSED, because the question is different. An undeclared
 * capability is not one nobody restricted; it is one nobody priced. Answering
 * "allowed" there gives away whatever is added next, silently, to everybody, and
 * the person who finds out is the customer who paid for it. So an unknown key
 * is refused, an unknown plan is refused, and the completeness test below is
 * what keeps that from quietly breaking a real screen.
 *
 * ## Where the plan value comes from, and what is still blocked
 *
 * Nowhere persistent, and that is recorded rather than worked around. There is
 * no tier column, no entitlement table and no key-value store this could be
 * saved to: `observer.account_preferences` has three fixed columns and
 * `observer.connector_configs` is keyed by a four-value check constraint (the
 * P1-03 audit, §9.7). Creating one is out of scope for this phase, and altering
 * a schema, an RLS policy or an RPC is forbidden outright.
 *
 * The v3 plan anticipated exactly this and permits exactly this answer: where
 * no durable tier configuration exists, a version-controlled default registry
 * in application code may be used, admin editing is then an unsaved preview,
 * and the runtime task stays BLOCKED. So `TENANT_PLANS` is empty and every
 * tenant resolves to `DEFAULT_PLAN`. Filling it in is a commit, not a screen.
 *
 * ## What may never become a plan
 *
 * Not a query parameter, not a header, not a cookie, not a field in a request
 * body, not a value a component was handed. `plan=MAX` and `preview=MAX` are
 * strings a reader can type. The plan is resolved on the server from the tenant
 * the repository already authorised, and `entitlements.test.ts` scans this
 * application for the other shapes.
 */

/** The three commercial levels, weakest first. The order IS the comparison. */
export const PLANS = ["FREE", "PRO", "MAX"] as const;
export type Plan = (typeof PLANS)[number];

/**
 * The plan every tenant resolves to until a durable store exists.
 *
 * FREE rather than MAX, and the choice is not cosmetic. A default that admits
 * everything means the day a capability is priced, every tenant keeps it and
 * nobody notices the gate does not work; a default that admits the base level
 * means the same day, the gate is visible immediately and on purpose.
 */
export const DEFAULT_PLAN: Plan = "FREE";

/**
 * Per-tenant overrides, version-controlled and empty.
 *
 * Empty is the honest state and also the rule: `CLAUDE.md` forbids anything
 * project-specific in application logic, so a tenant's plan is configuration
 * this file holds a shape for, never a name it hard-codes.
 */
export const TENANT_PLANS: Readonly<Record<string, Plan>> = {};

/**
 * The decision, in the shape the v3 plan specifies.
 *
 * Two refusals and they are not interchangeable. `upgrade_required` says the
 * capability exists and this plan does not reach it, which a surface may offer
 * to fix. `forbidden` says the request was not a question this system answers —
 * an unknown plan, an unpriced key — and a surface must not turn that into an
 * upsell, because inviting somebody to pay for something nobody has defined is
 * how a placeholder becomes a promise.
 */
export type AccessDecision =
  | { readonly allowed: true; readonly effectivePlan: Plan }
  | { readonly allowed: false; readonly reason: "forbidden" | "upgrade_required" };

/**
 * The registry: a capability path, and the weakest plan that reaches it.
 *
 * Keys are dotted paths over identifiers that already exist elsewhere in this
 * repository — `surface.<the route's own last segment>` and `metric.<the id the
 * metric registry declares>` — so nothing here invents a vocabulary, and a
 * capability that is not one of those two things has to be added deliberately.
 *
 * Only the roots are declared. Everything below a declared path inherits it,
 * which is what makes restricting a family one line: `"metric.exec": "PRO"`
 * moves every executive metric at once, and `"metric.exec.revenue": "MAX"`
 * moves one of them further. What it cannot do is move one BACK — see
 * `requiredPlan`.
 */
export const ACCESS_REGISTRY: Readonly<Record<string, Plan>> = {
  surface: "FREE",
  metric: "FREE",
};

function rank(plan: Plan): number {
  return PLANS.indexOf(plan);
}

/**
 * A plan, or null for anything that is not exactly one of the three.
 *
 * No trimming, no case folding, no coercion. A value that needed repairing
 * before it could be compared did not come from this server.
 */
export function asPlan(value: unknown): Plan | null {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value)
    ? (value as Plan)
    : null;
}

/**
 * The plan this tenant holds.
 *
 * Takes the tenant id the repository already resolved — never a slug off the
 * URL, which is a string the reader controls and which only means a tenant
 * after the repository has said so.
 */
export function planForTenant(tenantId: string): Plan {
  return TENANT_PLANS[tenantId] ?? DEFAULT_PLAN;
}

/**
 * The strongest plan any ancestor of this key demands, or null if no ancestor
 * declares one at all.
 *
 * **Restrictions add up and never subtract**, which is the property that keeps
 * a parent's decision from leaking through a child. A nested view asking for
 * `metric.exec.revenue` cannot be cheaper than `metric.exec`, because this
 * takes the MAXIMUM across the whole chain rather than the most specific match.
 * Reading only the deepest entry would let one careless line in a child grant
 * what its parent refuses, and a child view is exactly where nobody looks.
 */
export function requiredPlan(
  key: string,
  /*
   * The registry to read, defaulting to the real one.
   *
   * A parameter rather than a module-level rebinding so that a test can walk a
   * hierarchy this product does not have yet — a parent at PRO with a child
   * declaring FREE beneath it — against THIS function rather than against a
   * copy of it written in the test. A guard that re-implements the rule it is
   * guarding proves only that somebody can write the rule twice.
   */
  registry: Readonly<Record<string, Plan>> = ACCESS_REGISTRY,
): Plan | null {
  const parts = key.split(".");
  let required: Plan | null = null;
  for (let i = 1; i <= parts.length; i += 1) {
    const declared = registry[parts.slice(0, i).join(".")];
    if (declared === undefined) continue;
    if (required === null || rank(declared) > rank(required)) required = declared;
  }
  return required;
}

/**
 * The one decision function. Everything else in this file serves it.
 *
 * `plan` is `unknown` on purpose: every caller is handing over a value that
 * came from somewhere, and the type system cannot tell a resolved plan from a
 * string that arrived in a request. Making the parameter honest forces the
 * check rather than trusting the caller's annotation.
 */
export function decideAccess(plan: unknown, key: string): AccessDecision {
  const held = asPlan(plan);
  // An unrecognised plan is not a weak plan. It is not an answer at all, so it
  // reaches nothing — including the capabilities FREE reaches.
  if (held === null) return { allowed: false, reason: "forbidden" };

  const required = requiredPlan(key);
  // Nobody priced this. Refusing is the only answer that cannot give something
  // away, and `forbidden` rather than `upgrade_required` because there is no
  // upgrade that would help.
  if (required === null) return { allowed: false, reason: "forbidden" };

  if (rank(held) < rank(required)) return { allowed: false, reason: "upgrade_required" };
  return { allowed: true, effectivePlan: held };
}

/**
 * The same decision for a whole chain, for a surface that renders nested data.
 *
 * A page that shows a metric inside a section inside a screen has three keys to
 * satisfy, and it must satisfy all of them. The first refusal wins and is the
 * one returned, so the caller reports the outermost reason rather than the
 * deepest — telling a reader that one figure needs an upgrade, on a screen they
 * were never entitled to open, describes the wrong problem.
 */
export function decideAll(plan: unknown, keys: readonly string[]): AccessDecision {
  // An empty list is not a satisfied list. Nothing was asked for, so nothing is
  // granted — otherwise a caller whose keys array came out empty by accident
  // would be handed an allowance, which is the most expensive kind of typo.
  if (keys.length === 0) return { allowed: false, reason: "forbidden" };

  let granted: Plan | null = null;
  for (const key of keys) {
    const decision = decideAccess(plan, key);
    if (!decision.allowed) return decision;
    granted = decision.effectivePlan;
  }
  return granted === null
    ? { allowed: false, reason: "forbidden" }
    : { allowed: true, effectivePlan: granted };
}
