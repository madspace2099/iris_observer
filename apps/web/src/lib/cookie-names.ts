/**
 * COOKIE NAMES, WITH NO OTHER IMPORT IN THIS FILE — DELIBERATELY.
 *
 * `middleware.ts` runs on the Edge runtime and `session.ts` imports
 * `node:crypto` for HMAC signing, which the Edge runtime does not have. Both
 * files need `LAST_PROJECT_COOKIE`, and if one imported it from the other,
 * whichever file is "the other" would drag its runtime's dependencies into a
 * bundle that cannot use them — `node:crypto` into the Edge bundle, or a
 * middleware-only API into the Node one. A third file with nothing in it but
 * strings is the only shape that is safe to import from both.
 */

/**
 * Which project a reader was last inside, as `{tenantSlug}/{projectSlug}`.
 *
 * Written by `middleware.ts` on every project-scoped request — the one place
 * that can write a cookie on an ordinary navigation, since a Server Component
 * render cannot. Read and RE-VALIDATED by `lib/landing.ts`, which is the only
 * place that ever trusts it: a cookie is browser state, not a grant.
 */
export const LAST_PROJECT_COOKIE = "observer_last_project";
