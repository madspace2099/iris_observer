"use client";

import { RecoverableError } from "@/observer-demo/components/states";

/**
 * The route-level boundary for every Observer screen.
 *
 * `reset` re-renders the segment, which is a real recovery here: nothing is
 * mutated on this surface, so a second attempt derives the same view from the
 * same frozen record.
 */
export default function ObserverError({ reset }: { error: Error; reset: () => void }) {
  return <RecoverableError onRetry={reset} />;
}
