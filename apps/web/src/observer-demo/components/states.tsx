"use client";

/**
 * The two states that are not a screen: waiting, and a failure you can undo.
 *
 * Both live here rather than inside a route file so the copy is in one place
 * and can be asserted without a browser. Neither reads the fixture — a
 * loading frame that needs data has already lost the argument, and an error
 * screen that needs data is the second failure in a row.
 */

/** The frame, while the selection is being resolved on the server. */
export function LoadingScreen() {
  return (
    <div className="od">
      <div className="od-shell">
        <aside className="od-side" aria-hidden="true">
          <div className="od-brand">
            <span className="od-mark">IO</span>
            <span>
              <span className="od-brand-name">IRIS Observer</span>
              <span className="od-brand-sub">MADSPACE</span>
            </span>
          </div>
          <div className="od-navgroup">
            {[0, 1, 2].map((i) => (
              <span key={i} className="od-skel" style={{ height: 34, borderRadius: 9 }} />
            ))}
          </div>
        </aside>

        <div className="od-main">
          <header className="od-top">
            <div style={{ display: "grid", gap: 8 }}>
              <span className="od-skel" style={{ height: 17, width: 132 }} />
              <span className="od-skel" style={{ height: 11, width: 268 }} />
            </div>
            <span className="od-skel" style={{ height: 32, width: 320 }} />
          </header>

          <main className="od-body" aria-busy="true">
            <p className="od-visually-hidden" role="status">
              Loading the selected window.
            </p>

            <div className="od-kpis">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div className="od-panel od-kpi" key={i}>
                  <span className="od-skel" style={{ height: 11, width: 108 }} />
                  <span className="od-skel" style={{ height: 30, width: 92, marginTop: 12 }} />
                  <span className="od-skel" style={{ height: 11, width: 132, marginTop: 14 }} />
                </div>
              ))}
            </div>

            <div className="od-row od-row-2">
              <section className="od-panel">
                <span className="od-skel" style={{ display: "block", height: 320 }} />
              </section>
              <section className="od-panel">
                <span className="od-skel" style={{ display: "block", height: 320 }} />
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * A failure the reader can undo.
 *
 * It says what did not happen, what is still true, and gives the one control
 * that resolves it. No stack, no digest, no apology: a person looking at a
 * screen in front of a business partner needs a way forward, not a diagnosis.
 */
export function RecoverableError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="od">
      <div className="od-shell">
        <div className="od-main" style={{ gridColumn: "1 / -1" }}>
          <main className="od-body">
            <section className="od-panel od-error" role="alert">
              <span className="od-error-mark" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M12 7.5v5.2"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="16.4" r="1" fill="currentColor" />
                </svg>
              </span>

              <h1 className="od-error-title">This view could not be assembled</h1>
              <p className="od-error-text">
                The selected window did not finish loading. Nothing has been changed and no
                observation has been lost — the figures are derived on each request, so retrying
                rebuilds the same view from the same record.
              </p>

              <div className="od-error-actions">
                <button type="button" className="od-btn" onClick={onRetry}>
                  Try again
                </button>
                <a className="od-chip" href="/observer/overview">
                  Back to the Overview
                </a>
              </div>

              <p className="od-error-note">
                Every figure on this surface is synthetic demonstration data.
              </p>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
