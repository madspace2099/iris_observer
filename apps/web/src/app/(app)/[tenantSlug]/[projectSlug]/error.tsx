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

  /*
   * A refusal is not a fault.
   *
   * Layouts and pages render in parallel, so a page that reads a project the
   * viewer does not hold throws here even though the layout is already
   * rendering its own "not available" panel. Reporting that as a broken screen
   * sends the reader to support for something that is working exactly as
   * intended.
   *
   * Matched on the message because a server error is serialised before it
   * reaches this boundary — the class does not survive the crossing.
   */
  const refused = /no access to|not available to your account/i.test(error.message);

  if (refused) {
    return (
      <section className="obs-state" role="alert">
        <strong>This project is not available to your account</strong>
        <span>
          If you expected access, ask the developer who owns the project to grant it.
        </span>
      </section>
    );
  }

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
