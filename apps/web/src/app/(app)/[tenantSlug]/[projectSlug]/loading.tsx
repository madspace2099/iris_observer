import { CardSkeleton, Skeleton } from "@observer/ui";

/**
 * The loading state keeps the page's shape.
 *
 * A spinner throws away the layout and makes the arrival of content feel like
 * a jump. Holding the shape means the reader's eye is already where the
 * verdict will be.
 */
export default function Loading() {
  return (
    <>
      <div>
        <Skeleton height="0.75rem" width="14rem" />
        <div style={{ height: "var(--space-3)" }} />
        <div className="obs-card obs-card-pad">
          <Skeleton height="1.75rem" width="70%" />
          <div style={{ height: "var(--space-3)" }} />
          <Skeleton height="1.25rem" width="55%" />
        </div>
      </div>

      <div className="obs-metric-grid">
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </div>

      <CardSkeleton lines={4} />
      <span className="obs-sr" role="status">
        Loading this project
      </span>
    </>
  );
}
