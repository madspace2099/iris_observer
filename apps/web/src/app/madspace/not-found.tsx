import Link from "next/link";

/**
 * MADSPACE'S OWN 404, ON `mad-`.
 *
 * Reached for a project id or a source id that does not resolve — the
 * operations equivalent of the customer product's `not-found.tsx`, and for
 * the same reason: before this file, a bad `/madspace/sources/{id}` fell
 * through to Next's stock page, on neither of this product's design systems,
 * for the one audience most likely to have typed the address by hand while
 * debugging something.
 *
 * Wrapped by `madspace/layout.tsx` the same way every operations page is —
 * the header, `OpsNav` and the scope band are already the ones the operator
 * was looking at — so this fills the `<main>` alone, on `.mad-*`.
 */
export default function NotFound() {
  return (
    <div className="mad-plane">
      <div className="mad-empty">
        <strong>Nothing answers to this address</strong>
        <span>
          The project or source id in the URL does not resolve. It may be mistyped, or it may have
          belonged to something that was removed. This is not a diagnostics result. Nothing was
          read.
        </span>
      </div>

      <Link className="mad-action" href="/madspace/projects">
        Back to Projects
      </Link>
    </div>
  );
}
