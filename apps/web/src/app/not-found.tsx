import Link from "next/link";
import type { Metadata } from "next";

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
 * ## The product's chrome, and one line (review round 8)
 *
 * It wore the light portal's "MADSPACE | IRIS Observer" bar over a card of
 * three lines. It wears the shell's header now, as `/projects` does — the
 * wordmark, nothing that needs a session — and the project 404's empty state
 * (`.ox-empty`), with one line and the way back.
 */
export default function NotFound() {
  return (
    <div className="irs-shell ox-root ox-graphite" data-surface="account">
      <header className="irs-header">
        <Link className="irs-brand" href="/" aria-label="IRIS by MADSPACE — IRIS Observer">
          <img className="irs-brand-mark" src="/brand/iris-wordmark.svg" alt="IRIS" />
          <span className="irs-brand-sub">by MADSPACE</span>
        </Link>
      </header>

      <main className="irs-main" id="main" tabIndex={-1}>
        <div className="ox-page">
          <div className="ox-body">
            <div className="ox-empty">
              <p className="ox-empty-title">This page does not exist</p>
              <p className="ox-empty-note">The address may be mistyped.</p>
              <Link className="ox-btn" data-weight="primary" href="/">
                Go to IRIS Observer
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
