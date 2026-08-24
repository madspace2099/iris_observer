import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages are consumed as TypeScript source (ADR-0003), so Next
  // compiles them rather than resolving a prebuilt dist.
  transpilePackages: [
    "@observer/contracts",
    "@observer/metrics",
    "@observer/readmodels",
    "@observer/synthetic",
    "@observer/ui",
  ],
  /**
   * Typed routes stay on. They catch a broken literal link at compile time,
   * which is worth the one constraint they impose: a data-driven href has to
   * be widened at the boundary rather than passed straight through.
   *
   * Note that `tsc` needs `.next/types` to exist, so `typecheck` runs
   * `next typegen` first.
   */
  typedRoutes: true,
};

export default config;
