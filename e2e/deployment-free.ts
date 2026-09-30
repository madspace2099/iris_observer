/**
 * THE E2E SERVER MUST NOT LOOK LIKE A DEPLOYMENT (GATE1, 2026-09-30).
 *
 * The suite runs a local production build, and since `49d4fc1` the Ask quota
 * opens on it because no platform marker is present. A CI runner that set one
 * would close the quota and fail every Ask case with 429 — a red suite for a
 * reason that is the runner, not the product. This names the markers that are
 * set, from the same list the application reads, and fails before the suite
 * starts rather than letting that masquerade as a product fault.
 *
 *   pnpm exec tsx e2e/deployment-free.ts
 */
import { DEPLOYMENT_MARKERS } from "../apps/web/src/lib/deployment-markers";

const set = DEPLOYMENT_MARKERS.filter((marker) => (process.env[marker] ?? "").length > 0);
if (set.length > 0) {
  console.error(`deployment markers are set in this environment: ${set.join(", ")}`);
  process.exit(1);
}
console.log(`no deployment marker is set (${DEPLOYMENT_MARKERS.length} checked)`);
