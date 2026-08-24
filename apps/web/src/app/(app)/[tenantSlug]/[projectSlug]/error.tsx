"use client";

import { useEffect } from "react";

/**
 * The error state.
 *
 * It never renders a zero, and it never renders an empty chart. A number that
 * failed to load and a number that is genuinely zero are different facts, and
 * a dashboard that confuses them will be believed anyway.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[observer] screen failed", error);
  }, [error]);

  return (
    <section className="obs-state" role="alert">
      <strong>This screen could not be loaded</strong>
      <span>
        Nothing here is a zero — the figures did not arrive. Try again, and if it persists the
        reference is {error.digest ?? "unavailable"}.
      </span>
      <div className="obs-actions" style={{ marginTop: "var(--space-3)" }}>
        <button className="obs-action" data-emphasis="primary" onClick={reset} type="button">
          Try again
        </button>
      </div>
    </section>
  );
}
