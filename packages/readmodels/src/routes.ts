/**
 * LINKS FROM THE ROUTE MAP (R08-6, Máté 2026-10-02).
 *
 * A replay and an agent's page are the two records a read model links to most,
 * and their links were template strings written out in some twenty places,
 * some encoding the identifier and some not. The patterns live here, once: the
 * web route map declares its surfaces with them, and every link to one is
 * built from them, each parameter encoded. A route the map does not hold
 * cannot be linked to.
 */

export const REPLAY_ROUTE = "/[tenantSlug]/[projectSlug]/meetings/[meetingId]";
export const AGENT_DETAIL_ROUTE = "/[tenantSlug]/[projectSlug]/agents/[agentId]";

type Linked = typeof REPLAY_ROUTE | typeof AGENT_DETAIL_ROUTE;
type ParamsOf<R extends string> = R extends `${string}[${infer P}]${infer Rest}`
  ? { readonly [K in P | keyof ParamsOf<Rest>]: string }
  : Record<never, string>;

/** The route with every `[param]` filled and encoded. */
export function routeHref<R extends Linked>(route: R, params: ParamsOf<R>): string {
  return route.replace(/\[(\w+)\]/g, (_, name: string) => {
    const value = (params as Readonly<Record<string, string>>)[name];
    if (value === undefined) throw new Error(`${route} needs ${name}`);
    return encodeURIComponent(value);
  });
}

/** Where a project's records live: the two slugs every link starts from. */
export interface ProjectAddress {
  readonly tenantSlug: string;
  readonly projectSlug: string;
}

/** A view's own project, as the address its links start from. */
export const addressOf = (context: {
  readonly tenant: { readonly slug: string };
  readonly project: { readonly slug: string };
}): ProjectAddress => ({ tenantSlug: context.tenant.slug, projectSlug: context.project.slug });

export const replayHref = (at: ProjectAddress, meetingId: string): string =>
  routeHref(REPLAY_ROUTE, { ...at, meetingId });

export const agentDetailHref = (at: ProjectAddress, agentId: string): string =>
  routeHref(AGENT_DETAIL_ROUTE, { ...at, agentId });
