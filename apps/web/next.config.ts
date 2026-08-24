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

  /**
   * Response headers.
   *
   * Conservative on purpose: every one of these is either a pure hardening
   * header with no way to break a page, or — in the case of indexing — a
   * statement of fact about what this deployment is.
   *
   * A Content-Security-Policy is deliberately absent. Next injects inline
   * bootstrap scripts, so a CSP here needs a nonce and a middleware to issue
   * it, and an untested CSP that breaks the application is worse than none.
   * It belongs with production hardening, tested against a real deployment.
   */
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Framing is refused outright: nothing here is meant to be embedded, and
      // an analytics screen inside someone else's page is a clickjacking target.
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];

    /*
     * Staging must not be indexed.
     *
     * The data is synthetic and the sign-in is a scenario selector, so a search
     * result pointing here would misrepresent both. Production sets
     * OBSERVER_ENVIRONMENT=production and the header disappears.
     */
    const staging = process.env["OBSERVER_ENVIRONMENT"] !== "production";
    const headers = staging
      ? [...security, { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }]
      : security;

    return [{ source: "/:path*", headers }];
  },
};

export default config;
