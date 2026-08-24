/**
 * Server startup.
 *
 * Next calls `register` once per server process, which is the only place a
 * startup log actually belongs. The root layout is the wrong hook: for a static
 * route its module is evaluated at build time, so a report written there
 * describes the build machine rather than the deployment.
 */
export async function register(): Promise<void> {
  // Node only. The edge runtime has no process environment to report on and no
  // server log to write to.
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  const { reportEnvironment } = await import("./lib/env");
  reportEnvironment();
}
