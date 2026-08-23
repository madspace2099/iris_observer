import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages are consumed as TypeScript source (ADR-0003), so Next
  // compiles them rather than resolving a prebuilt dist.
  transpilePackages: ["@observer/contracts", "@observer/db", "@observer/metrics", "@observer/ui"],
  typedRoutes: true,
};

export default config;
