import { Skeleton } from "@observer/ui";

/**
 * The operations surface while a screen is on its way.
 *
 * The same shape every /madspace page has — a head with its kicker, title
 * and lede, then a plane — reserved before the data arrives, so the surface
 * does not grow by a screen when it does. Hidden from assistive technology
 * except for the one status sentence, which says what is happening.
 */
export default function Loading() {
  return (
    <>
      <header className="mad-head" aria-hidden="true">
        <div className="mad-head-text">
          <Skeleton height="0.75rem" width="10rem" />
          <Skeleton height="2.5rem" width="min(24rem, 60%)" />
          <Skeleton height="1.125rem" width="min(40rem, 90%)" />
        </div>
      </header>
      <section className="mad-plane" aria-hidden="true">
        <Skeleton height="1.25rem" width="12rem" />
        <Skeleton height="6rem" width="100%" />
      </section>
      <span className="obs-sr" role="status">
        Loading this screen
      </span>
    </>
  );
}
