import { Skeleton } from "@observer/ui";

/**
 * The loading state keeps the page's shape.
 *
 * It stopped doing that. This file still described the card-and-metric-grid
 * layout the product had two milestones ago, so a short placeholder occupying
 * a few hundred pixels was replaced by a full analytical plane — a four-column
 * agent comparison, a chart band and a findings list — and the whole document
 * jumped.
 *
 * A skeleton is a promise about geometry. It reserves a plane of roughly the
 * right height, in roughly the right places, so the reader's eye is already
 * where the verdict will be and nothing below it moves when the figures land.
 */
export default function Loading() {
  return (
    <div className="iris-one">
      <section className="iris-plane iris-stack" aria-hidden="true">
        {/* Kicker, verdict, supporting line — the top of every surface. */}
        <Skeleton height="0.75rem" width="18rem" />
        <Skeleton height="2.25rem" width="min(38rem, 70%)" />
        <Skeleton height="1.125rem" width="min(52rem, 90%)" />

        <div className="iris-load-figures">
          {[0, 1, 2].map((i) => (
            <div key={i} className="iris-load-figure">
              <Skeleton height="0.75rem" width="7rem" />
              <Skeleton height="2rem" width="5rem" />
              <Skeleton height="0.75rem" width="9rem" />
            </div>
          ))}
        </div>

        {/*
         * The analytical band.
         *
         * Every view puts something tall here — rings, a matrix, a lane, a
         * chart. Reserving it is what stops the surface growing by a screen
         * when it arrives.
         */}
        <div className="iris-load-band" />
        <div className="iris-load-band" data-short="true" />
      </section>

      <span className="obs-sr" role="status">
        Loading this project
      </span>
    </div>
  );
}
