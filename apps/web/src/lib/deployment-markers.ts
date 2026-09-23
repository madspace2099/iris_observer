/**
 * NAMES A PLATFORM SETS AND A PERSON DOES NOT.
 *
 * Presence is what counts, not value: `VERCEL_ENV=preview` is still Vercel.
 * Two readers stand on this list, and for the same reason — a variable a
 * person could copy into a deployment is not a fact about where the process
 * runs, and these are: the credential test store refuses to exist on any of
 * them (`credentials/test-store.ts`), and the session signing stand-in is
 * refused on any of them whatever `OBSERVER_ENVIRONMENT` says
 * (`session-secret.ts`). One list, so the two cannot disagree about what a
 * deployment is. No `server-only` import here, because the session resolver
 * is tested without a server.
 */
export const DEPLOYMENT_MARKERS = [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "AWS_REGION",
  "AWS_EXECUTION_ENV",
  "LAMBDA_TASK_ROOT",
  "NETLIFY",
  "RENDER",
  "FLY_APP_NAME",
  "DYNO",
  "WEBSITE_INSTANCE_ID",
  "KUBERNETES_SERVICE_HOST",
  "K_SERVICE",
] as const;

/** True when any platform marker is present in `source`, whatever its value. */
export function onDeploymentPlatform(source: Readonly<Record<string, string | undefined>>): boolean {
  return DEPLOYMENT_MARKERS.some((marker) => (source[marker] ?? "").length > 0);
}
