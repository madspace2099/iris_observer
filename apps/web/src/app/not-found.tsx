import Link from "next/link";
import type { Metadata } from "next";

import "@/portal/portal.css";

export const metadata: Metadata = { title: "Page not found" };

/**
 * THE ROOT 404 — DELIBERATELY THE ONLY ONE THAT MUST NEVER FAIL ITSELF.
 *
 * Before this file, every mistyped URL and every `notFound()` call with no
 * more specific boundary above it rendered Next's stock, unstyled page —
 * belonging to none of the three visual systems this product actually has,
 * and reading as a different application entirely at the exact moment a
 * reader is already lost.
 *
 * ## Why this one is static, and the other two are not identical to it
 *
 * `(app)/[tenantSlug]/[projectSlug]/not-found.tsx` and
 * `madspace/not-found.tsx` sit inside layouts that already resolved a viewer
 * and a project; this one does not, and CANNOT assume either resolved
 * successfully — it is exactly what renders when nothing more specific
 * matched. So it reads no session, calls no repository method, and links to
 * one destination that is safe unauthenticated: `/`, which the root page
 * itself resolves to sign-in or the project picker depending on who is
 * asking. A 404 handler that could itself throw would be the one page in the
 * product with no floor beneath it.
 *
 * `mp-` because a reader with nowhere more specific to land is, by
 * definition, not inside a project — the portal is the correct register.
 */
export default function NotFound() {
  return (
    <div className="mp">
      <a className="mp-skip" href="#main">
        Skip to content
      </a>

      <header className="mp-bar">
        <div className="mp-bar-inner">
          <span className="mp-bar-brand">MADSPACE</span>
          <span className="mp-bar-product">IRIS Observer</span>
        </div>
      </header>

      <main className="mp-main" id="main" tabIndex={-1}>
        <div className="mp-empty">
          <strong>This page does not exist</strong>
          <p>
            The address may be mistyped, or it may point at something that was moved or removed.
            Nothing was loaded — this is not an empty result, it is a page this application does not
            serve.
          </p>
          <Link className="mp-btn" href="/">
            Go to IRIS Observer
          </Link>
        </div>
      </main>
    </div>
  );
}
