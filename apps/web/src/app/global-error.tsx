"use client";

import { useEffect } from "react";

import "@fontsource-variable/manrope";
import "@observer/ui/tokens.css";
import "@observer/ui/components.css";
import "@/portal/portal.css";

/**
 * THE LAST FLOOR: AN ERROR NO NEARER BOUNDARY CAUGHT.
 *
 * Only `[tenantSlug]/[projectSlug]/error.tsx` exists below this, and it cannot
 * catch its own layout, `/projects`, `/welcome`, `/settings/ai`, `/madspace` or
 * `/sign-in`. Without this file those errors reach Next's built-in page, which
 * is white on a light-mode system; the owner, 2026-10-19: "Everything in the
 * system must have a dark background, not white" (ADR-0042).
 *
 * It replaces the root layout, so it brings its own document and the sheets it
 * needs, and draws in the portal register the root 404 uses: a reader here is
 * not inside a project either.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[observer] unhandled error", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>Something failed · IRIS Observer</title>
        <div className="mp">
          <main className="mp-main" id="main" tabIndex={-1}>
            <div className="mp-empty" role="alert">
              <strong>This screen could not be loaded</strong>
              <p>
                Nothing here is a zero: the figures did not arrive. Try again, and if it persists
                the reference is {error.digest ?? "unavailable"}.
              </p>
              <button className="mp-btn" onClick={() => retry()} type="button">
                Try again
              </button>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
