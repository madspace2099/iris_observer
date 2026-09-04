/**
 * THE CUSTOMER PRODUCT'S OWN 404.
 *
 * Reached for a bad unit code, a bad agent id, a bad thread id — every
 * `notFound()` call under this segment, nine of them at last count, all of
 * which used to fall through to Next's stock page: unstyled, belonging to
 * none of this product's three visual systems, and reading as a different
 * application at the exact moment a reader is already lost inside this one.
 *
 * ## It renders inside the shell for free
 *
 * `not-found.tsx` at a route segment is still wrapped by that segment's own
 * `layout.tsx` — the same rule `error.tsx` already relies on here. The
 * project layout has already resolved a real project by the time anything
 * nested under it could call `notFound()`, so the header, the navigation and
 * the context band are exactly the ones the reader was already looking at;
 * this file only has to fill the `<main>` they sit around, on `.ox-*`, the
 * system every one of the three routes that can reach it is built from.
 *
 * A LEAF nested under a specific unit/agent/thread lost, not the whole
 * project — which is why the one action here is "back to Ask IRIS", not
 * "back to your projects". The reader had the right project open; one drill-
 * down inside it did not resolve.
 */
export default function NotFound() {
  return (
    <div className="ox-page">
      <div className="ox-body">
        <div className="ox-empty">
          <p className="ox-empty-title">This isn&rsquo;t here</p>
          <p className="ox-empty-note">
            The address may be mistyped, or point at a unit, an agent or a conversation that has
            since changed. Use the navigation above to find your way back — nothing on this project
            was lost, one link to it was wrong.
          </p>
        </div>
      </div>
    </div>
  );
}
