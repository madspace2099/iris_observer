import type { Route } from "next";

/**
 * Widens an href that came from data rather than from a literal.
 *
 * Typed routes verify links written in source, which is where broken links
 * actually get written. They cannot verify a path assembled from a tenant slug
 * and a project slug at runtime, nor an href handed over by a read model
 * (ADR-0012).
 *
 * Naming the widening rather than scattering `as Route` keeps the two kinds of
 * link visibly different: a checked literal, or a value the repository is
 * responsible for.
 */
export function dynamicRoute(href: string): Route {
  return href as Route;
}
